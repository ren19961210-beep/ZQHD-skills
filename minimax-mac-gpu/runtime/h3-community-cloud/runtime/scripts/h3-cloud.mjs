#!/usr/bin/env node

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { ComfyClient } from "../src/comfy-client.mjs";
import {
  resolveImageInput,
  resolveLastFrameImageInput,
  resolveReferenceImageInputs,
  resolveReferenceVideoInputs,
  buildMediaArguments,
} from "../src/media-input.mjs";
import {
  createJobId,
  hasRecoverableSubmission,
  readJobManifestIfPresent,
} from "../src/comfy-job.mjs";
import { configureWorkflow, resolveGenerationSettings } from "../src/workflow.mjs";
import { openRuntimeEndpoint } from "../src/runtime-endpoint.mjs";
import {
  createProvider,
  defaultConfigPath,
  getRuntimeWorkflowPath,
  loadProjectConfig,
  validateRuntime,
} from "../src/project-config.mjs";
import { defaultOutputDir } from "../src/user-paths.mjs";

const scriptsDir = dirname(fileURLToPath(import.meta.url));

function usage() {
  console.log(`用法：
  h3-cloud status [--config <本地配置>]
  h3-cloud url [--config <本地配置>]
  h3-cloud start [--config <本地配置>]
  h3-cloud stop --yes [--config <本地配置>]
  h3-cloud generate [选项]

generate 选项：
  --aspect-ratio <16:9|9:16|...>       用户指定画幅
  --duration-seconds <2-15>            用户指定时长
  --megapixels <0.2-1.0>               用户指定清晰度
  --preset <preview|balanced|short_hq>  兼容旧快捷方式，可被显式参数覆盖
  --prompt-file <路径>                 使用自定义提示词文件
  --first-frame-image <本地图片路径>   以该图片作为视频首帧关键帧
  --last-frame-image <本地图片路径>    以该图片作为视频尾帧关键帧
  --reference-image <本地图片路径>     以图片作为参考，可重复 1–9 次
  --reference-video <本地视频路径>     以视频动作/场景作为参考，可重复 1–3 次；默认不复用原音轨
  --seed <非负整数>                    默认随机
  --dry-run                            本地校验并输出工作流，不访问云端
  --keep-running                       完成后不关机（默认关机）`);
}

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    config: { type: "string", default: defaultConfigPath },
    yes: { type: "boolean", default: false },
    help: { type: "boolean", short: "h" },
    preset: { type: "string" },
    "aspect-ratio": { type: "string" },
    "duration-seconds": { type: "string" },
    megapixels: { type: "string" },
    "prompt-file": { type: "string" },
    "first-frame-image": { type: "string" },
    "last-frame-image": { type: "string" },
    "reference-image": { type: "string", multiple: true },
    "reference-video": { type: "string", multiple: true },
    seed: { type: "string" },
    "output-dir": { type: "string" },
    "timeout-seconds": { type: "string", default: "1200" },
    "poll-seconds": { type: "string", default: "5" },
    "keep-running": { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
  },
});

if (values.help || positionals.length !== 1) {
  usage();
  process.exit(values.help ? 0 : 1);
}

const command = positionals[0];
const { config, runtime, deployment } = await loadProjectConfig(values.config);
const provider = createProvider(config);
const resourceId = config.provider.resourceId;

function parseNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} 必须是数字`);
  return number;
}

async function waitForComfy(url, { timeoutMs = 300_000 } = {}) {
  const client = new ComfyClient(url);
  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    try {
      return await client.health();
    } catch (error) {
      lastError = error;
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 5_000));
    }
  }

  throw new Error(
    `等待 ComfyUI 健康检查超时：${lastError?.message ?? "未知错误"}`,
  );
}

function runH3Client(args, childRef) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [resolve(scriptsDir, "h3-comfy.mjs"), ...args], {
      stdio: "inherit",
    });
    childRef.current = child;
    child.once("error", rejectPromise);
    child.once("exit", (code, signal) => {
      childRef.current = null;
      if (code === 0) return resolvePromise();
      const error = new Error(
        signal ? `H3 客户端被 ${signal} 中断` : `H3 客户端退出码：${code}`,
      );
      error.code = signal ? "H3_CLIENT_INTERRUPTED" : "H3_CLIENT_FAILED";
      rejectPromise(error);
    });
  });
}

if (command === "status") {
  const status = await provider.getStatus(resourceId, { allowMissing: true });
  if (!["missing", "unconfigured"].includes(status.state)) validateRuntime(status, runtime);
  console.log(JSON.stringify({ status, runtimeProfile: runtime.id }, null, 2));
  process.exit(0);
}

if (command === "url") {
  const status = await provider.getStatus(resourceId);
  validateRuntime(status, runtime);
  if (status.state !== "running") throw new Error("实例尚未运行");
  const url = await provider.getSoftwareUrl(resourceId, runtime.softwareName);
  console.log(JSON.stringify({ url, runtimeProfile: runtime.id }, null, 2));
  process.exit(0);
}

if (command === "start") {
  const status = await provider.start(resourceId);
  validateRuntime(status, runtime);
  console.log(JSON.stringify({ status, runtimeProfile: runtime.id }, null, 2));
  process.exit(0);
}

if (command === "stop") {
  if (!values.yes) throw new Error("关机需要显式传入 --yes");
  const status = await provider.stop(resourceId);
  console.log(JSON.stringify({ status, runtimeProfile: runtime.id }, null, 2));
  process.exit(0);
}

if (command === "generate") {
  if (values.preset && !runtime.allowedPresets?.includes(values.preset)) {
    throw new Error(`Runtime Profile 不允许预设：${values.preset}`);
  }
  const generationSettings = resolveGenerationSettings({
    preset: values.preset,
    aspectRatio: values["aspect-ratio"],
    durationSeconds:
      values["duration-seconds"] === undefined
        ? undefined
        : parseNumber(values["duration-seconds"], "duration-seconds"),
    megapixels:
      values.megapixels === undefined
        ? undefined
        : parseNumber(values.megapixels, "megapixels"),
  });
  const firstFrameImagePath = values["first-frame-image"]
    ? await resolveImageInput(values["first-frame-image"])
    : undefined;
  const lastFrameImagePath = values["last-frame-image"]
    ? await resolveLastFrameImageInput(values["last-frame-image"])
    : undefined;
  const referenceImagePaths = await resolveReferenceImageInputs(
    values["reference-image"],
  );
  const referenceVideos = await resolveReferenceVideoInputs(values["reference-video"]);
  if (
    (referenceImagePaths.length > 0 || referenceVideos.length > 0) &&
    (firstFrameImagePath || lastFrameImagePath)
  ) {
    throw new Error("关键帧参数与参考素材参数不能同时使用");
  }
  const generationMode = referenceImagePaths.length > 0 || referenceVideos.length > 0
    ? "reference-image-to-video"
    : firstFrameImagePath && lastFrameImagePath
      ? "first-last-frame-to-video"
      : firstFrameImagePath
        ? "first-frame-to-video"
        : lastFrameImagePath
          ? "last-frame-to-video"
          : "text-to-video";
  const workflowPath = getRuntimeWorkflowPath(runtime, generationMode);
  const mediaArguments = buildMediaArguments({ firstFrameImagePath, lastFrameImagePath, referenceImagePaths, referenceVideos });
  const sourceWorkflow = JSON.parse(await readFile(workflowPath, "utf8"));
  const prompt = values["prompt-file"] ? await readFile(resolve(values["prompt-file"]), "utf8") : undefined;
  const previewWorkflow = configureWorkflow(sourceWorkflow, {
    ...generationSettings,
    prompt,
    seed: values.seed === undefined ? 0 : parseNumber(values.seed, "seed"),
    filenamePrefix: "video/local-preview",
    firstFrameImage: firstFrameImagePath,
    lastFrameImage: lastFrameImagePath,
    referenceImages: referenceImagePaths,
    referenceVideos: referenceVideos.map(video => video.path),
  });
  for (const name of ["timeout-seconds", "poll-seconds"]) {
    if (!(parseNumber(values[name], name) > 0)) throw new Error(`${name} 必须大于 0`);
  }
  if (values["dry-run"]) {
    console.log(JSON.stringify({ dry_run: true, cloud_accessed: false, mode: generationMode,
      media_arguments: mediaArguments, reference_video_count: referenceVideos.length,
      settings: generationSettings, workflow: previewWorkflow }, null, 2));
    process.exit(0);
  }
  const modeLabel = {
    "text-to-video": "文生视频",
    "first-frame-to-video": "首帧图生视频",
    "last-frame-to-video": "尾帧图生视频",
    "first-last-frame-to-video": "首尾帧图生视频",
    "reference-image-to-video": "参考素材生视频",
  }[generationMode];
  console.log(
    `生成参数：${modeLabel} · ${generationSettings.aspectRatio.split(" ", 1)[0]} · ${generationSettings.durationSeconds} 秒 · ${generationSettings.megapixels}MP`,
  );

  const jobId = createJobId();
  const outputRoot = resolve(values["output-dir"] ?? defaultOutputDir);
  const manifestPath = join(outputRoot, jobId, "manifest.json");

  const childRef = { current: null };
  let endpoint;
  let interrupted = false;
  const interrupt = () => {
    interrupted = true;
    childRef.current?.kill("SIGTERM");
  };
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);

  let taskError;
  try {
    let status = await provider.getStatus(resourceId);
    validateRuntime(status, runtime);

    if (status.state === "stopped") {
      console.log("实例已关机，正在自动启动……");
      status = await provider.start(resourceId);
      validateRuntime(status, runtime);
    } else if (status.state !== "running") {
      throw new Error(`实例当前为 ${status.providerState}，不能提交任务`);
    }

    if (config.safety?.scheduleStopAfter) {
      await provider.scheduleStop(resourceId, config.safety.scheduleStopAfter);
      console.log(`已设置 ${config.safety.scheduleStopAfter} 后兜底关机`);
    }

    console.log("正在等待 Runtime Transport 就绪（最多 5 分钟）……");
    const transport = await provider.waitForRuntimeTransport(resourceId, {
      onAttempt(event) {
        const elapsedSeconds = Math.round(event.elapsedMs / 1000);
        if (event.state === "ready") {
          console.log(
            `Runtime Transport 第 ${event.attempt} 次探测成功（已等待 ${elapsedSeconds} 秒）`,
          );
          return;
        }
        console.log(
          `Runtime Transport 第 ${event.attempt} 次探测未就绪（${event.errorCode}，已等待 ${elapsedSeconds} 秒）`,
        );
      },
    });
    console.log(
      `Runtime Transport 已就绪；平台启动时间：${status.providerStartedAt ?? "未返回"}；共 ${transport.attempts} 次探测`,
    );

    if (deployment) {
      console.log("正在校验平台模型缓存并准备 Runtime……");
      const prepared = await provider.prepareRuntime(resourceId, {
        binding: deployment.binding,
        runtimeSpec: deployment.runtimeSpec,
      });
      console.log(
        prepared.cached
          ? `Runtime 已准备，快速复核 ${prepared.verifiedFiles} 个模型文件`
          : `Runtime 准备完成，校验 ${prepared.verifiedFiles} 个模型文件，新建 ${prepared.createdLinks} 个软链接`,
      );
    }

    endpoint = await openRuntimeEndpoint({ provider, resourceId, runtime });
    const url = endpoint.url;
    console.log("正在等待 ComfyUI 就绪……");
    await waitForComfy(url);

    const hourlyPrice = [
      status.billing.instanceHourly,
      status.billing.imageHourly,
      status.billing.diskHourly,
    ].reduce((sum, value) => sum + (Number(value) || 0), 0);

    const clientArgs = [
      "generate",
      "--url",
      url,
      "--workflow",
      workflowPath,
      "--expected-reference-video-count",
      String(referenceVideos.length),
      "--job-id",
      jobId,
      "--aspect-ratio",
      generationSettings.aspectRatio,
      "--duration-seconds",
      String(generationSettings.durationSeconds),
      "--megapixels",
      String(generationSettings.megapixels),
      "--timeout-seconds",
      values["timeout-seconds"],
      "--poll-seconds",
      values["poll-seconds"],
      "--provider",
      "compshare",
      "--provider-resource-id",
      resourceId,
      "--runtime-profile",
      runtime.id,
      "--region",
      status.region,
      "--gpu",
      `${status.gpu.type}x${status.gpu.count}`,
      "--system-ram",
      String(status.memoryMb),
      "--hourly-price",
      String(hourlyPrice),
      "--image-version",
      status.image.version ?? "unknown",
    ];
    if (values.preset) clientArgs.push("--preset", values.preset);
    if (values["prompt-file"]) {
      clientArgs.push("--prompt-file", values["prompt-file"]);
    }
    clientArgs.push(...mediaArguments);
    if (values.seed) clientArgs.push("--seed", values.seed);
    if (values["output-dir"]) {
      clientArgs.push("--output-dir", values["output-dir"]);
    }

    try {
      await runH3Client(clientArgs, childRef);
    } catch (error) {
      if (interrupted) throw error;
      const manifest = await readJobManifestIfPresent(manifestPath);
      if (!hasRecoverableSubmission(manifest)) throw error;

      console.log(
        `任务已取得 prompt_id ${manifest.prompt_id}，连接中断后只恢复查询与下载，不会重新提交。`,
      );
      let recoveryError = error;
      let recovered = false;
      for (let attempt = 1; attempt <= 3 && !interrupted; attempt += 1) {
        try {
          if (endpoint) {
            try {
              await endpoint.close();
            } catch (closeError) {
              console.error(`警告：重建通道前关闭旧通道失败：${closeError.message}`);
            }
            endpoint = undefined;
          }
          endpoint = await openRuntimeEndpoint({ provider, resourceId, runtime });
          await waitForComfy(endpoint.url, { timeoutMs: 60_000 });
          await runH3Client(
            [
              "recover",
              "--url",
              endpoint.url,
              "--manifest",
              manifestPath,
              "--timeout-seconds",
              values["timeout-seconds"],
              "--poll-seconds",
              values["poll-seconds"],
            ],
            childRef,
          );
          recovered = true;
          break;
        } catch (candidateError) {
          recoveryError = candidateError;
          console.error(`原任务第 ${attempt}/3 次恢复未完成：${candidateError.message}`);
        }
      }
      if (!recovered) {
        const finalError = new Error(
          `任务已提交但无法恢复原 prompt_id；已拒绝重复提交：${recoveryError.message}`,
        );
        finalError.code = "H3_RECOVERY_FAILED";
        throw finalError;
      }
    }
    if (interrupted) throw new Error("任务被用户中断");
  } catch (error) {
    taskError = error;
  } finally {
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);

    if (endpoint) {
      try {
        await endpoint.close();
      } catch (cleanupError) {
        if (taskError) {
          console.error(`警告：任务失败后关闭 Runtime 通道也失败：${cleanupError.message}`);
        } else {
          taskError = cleanupError;
        }
      }
    }

    const shouldStop =
      config.safety?.stopAfterJob !== false && !values["keep-running"];
    if (shouldStop) {
      try {
        console.log("正在执行任务后的 GPU 关机……");
        const stopped = await provider.stop(resourceId);
        console.log(`实例状态：${stopped.state}`);
      } catch (cleanupError) {
        if (taskError) {
          console.error(`警告：任务失败后自动关机也失败：${cleanupError.message}`);
        } else {
          taskError = cleanupError;
        }
      }
    }
  }

  if (taskError) throw taskError;
  process.exit(0);
}

usage();
throw new Error(`未知命令：${command}`);
