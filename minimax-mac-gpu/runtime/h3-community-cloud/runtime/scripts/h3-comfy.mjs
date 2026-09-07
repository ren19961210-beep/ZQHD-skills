#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { ComfyClient } from "../src/comfy-client.mjs";
import {
  resolveImageInput,
  resolveLastFrameImageInput,
  resolveReferenceImageInputs,
  resolveReferenceVideoInputs,
} from "../src/media-input.mjs";
import {
  createJobId,
  hasRecoverableSubmission,
  queueHasPromptId,
  readJobManifest,
  readJobManifestIfPresent,
  waitForArtifact,
  writeJobManifest,
} from "../src/comfy-job.mjs";
import {
  configureWorkflow,
  describeWorkflow,
  inspectWorkflowCompatibility,
  PRESETS,
  resolveGenerationSettings,
} from "../src/workflow.mjs";
import { defaultOutputDir } from "../src/user-paths.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultWorkflow = join(
  projectRoot,
  "workflows/official-h3-t2v-turbo-8step-api.json",
);

function usage() {
  console.log(`用法：
  h3-comfy inspect
  h3-comfy health --url <ComfyUI URL>
  h3-comfy preflight --url <ComfyUI URL> [--workflow <API JSON>]
  h3-comfy generate --url <ComfyUI URL> [选项]
  h3-comfy recover --url <ComfyUI URL> --manifest <manifest.json>

generate 选项：
  --aspect-ratio <16:9|9:16|...>        用户指定画幅
  --duration-seconds <2-15>             用户指定时长
  --megapixels <0.2-1.0>                用户指定清晰度
  --preset <${Object.keys(PRESETS).join("|")}>   兼容旧快捷方式
  --prompt-file <路径>                  使用文本文件替换基线提示词
  --first-frame-image <本地图片路径>    以该图片作为视频首帧关键帧
  --last-frame-image <本地图片路径>     以该图片作为视频尾帧关键帧
  --reference-image <本地图片路径>      以图片作为参考，可重复 1–9 次
  --reference-video <本地视频路径>      以视频动作/场景作为参考，可重复 1–3 次；默认不复用原音轨
  --seed <非负整数>                     默认随机
  --workflow <API JSON 路径>            默认官方模板改造的 Turbo 工作流
  --output-dir <目录>                    默认用户数据目录
  --timeout-seconds <秒>                 默认 1200
  --poll-seconds <秒>                    默认 5

也可以通过 H3_COMFY_URL 设置 ComfyUI URL。`);
}

function parseNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} 必须是数字`);
  return number;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    help: { type: "boolean", short: "h" },
    url: { type: "string" },
    workflow: { type: "string", default: defaultWorkflow },
    preset: { type: "string" },
    "aspect-ratio": { type: "string" },
    "duration-seconds": { type: "string" },
    megapixels: { type: "string" },
    "prompt-file": { type: "string" },
    "first-frame-image": { type: "string" },
    "last-frame-image": { type: "string" },
    "reference-image": { type: "string", multiple: true },
    "reference-video": { type: "string", multiple: true },
    "expected-reference-video-count": { type: "string" },
    seed: { type: "string" },
    "job-id": { type: "string" },
    manifest: { type: "string" },
    "output-dir": { type: "string", default: defaultOutputDir },
    "timeout-seconds": { type: "string", default: "1200" },
    "poll-seconds": { type: "string", default: "5" },
    provider: { type: "string", default: "compshare" },
    "provider-resource-id": { type: "string" },
    "runtime-profile": { type: "string" },
    region: { type: "string" },
    gpu: { type: "string" },
    "system-ram": { type: "string" },
    "hourly-price": { type: "string" },
    "image-version": { type: "string" },
  },
});

if (values.help || positionals.length !== 1) {
  usage();
  process.exit(values.help ? 0 : 1);
}

const command = positionals[0];
const workflowPath = resolve(values.workflow);
const startedAt = performance.now();

if (command === "inspect") {
  console.log(JSON.stringify(describeWorkflow(await readJson(workflowPath)), null, 2));
  process.exit(0);
}

const baseUrl = values.url ?? process.env.H3_COMFY_URL;
if (!baseUrl) throw new Error("缺少 --url 或 H3_COMFY_URL");
const client = new ComfyClient(baseUrl);

if (command === "health") {
  const stats = await client.health();
  console.log(JSON.stringify(stats, null, 2));
  process.exit(0);
}

if (command === "preflight") {
  const [stats, objectInfo, workflow] = await Promise.all([
    client.health(),
    client.objectInfo(),
    readJson(workflowPath),
  ]);
  const compatibility = inspectWorkflowCompatibility(workflow, objectInfo);
  console.log(JSON.stringify({ stats, compatibility }, null, 2));
  if (!compatibility.compatible) process.exitCode = 2;
  process.exit();
}

if (command === "recover") {
  if (!values.manifest) throw new Error("recover 缺少 --manifest");
  const manifestPath = resolve(values.manifest);
  const manifest = await readJobManifest(manifestPath);
  if (manifest.status === "succeeded" && manifest.artifact_path) {
    console.log(`任务已经完成：${manifest.artifact_path}`);
    process.exit(0);
  }
  if (!hasRecoverableSubmission(manifest)) {
    throw new Error("manifest 没有可恢复的 prompt_id；为避免重复计费，不会重新提交");
  }

  manifest.status = "recovering";
  manifest.completed_at = null;
  manifest.recovery_attempts = (manifest.recovery_attempts ?? 0) + 1;
  await writeJobManifest(manifestPath, manifest);

  try {
    const [history, queue] = await Promise.all([
      client.history(manifest.prompt_id),
      client.queue(),
    ]);
    if (!history?.[manifest.prompt_id] && !queueHasPromptId(queue, manifest.prompt_id)) {
      const error = new Error(
        "当前 ComfyUI 的历史和队列中都找不到原 prompt_id；不会重新提交",
      );
      error.code = "COMFY_PROMPT_NOT_FOUND";
      throw error;
    }
    const { artifact } = await waitForArtifact(client, manifest.prompt_id, {
      pollMs: parseNumber(values["poll-seconds"], "poll-seconds") * 1000,
      timeoutMs: parseNumber(values["timeout-seconds"], "timeout-seconds") * 1000,
    });
    const artifactPath = join(dirname(manifestPath), basename(artifact.filename));
    await writeFile(artifactPath, await client.download(artifact));

    manifest.status = "succeeded";
    manifest.completed_at = new Date().toISOString();
    manifest.artifact_path = artifactPath;
    manifest.failure_code = null;
    manifest.failure_detail = null;
    await writeJobManifest(manifestPath, manifest);
    console.log(`已按原 prompt_id 恢复并下载视频：${artifactPath}`);
  } catch (error) {
    manifest.status = "recovery-pending";
    manifest.completed_at = null;
    manifest.failure_code = error?.code ?? "UNKNOWN";
    manifest.failure_detail = error instanceof Error ? error.message : String(error);
    await writeJobManifest(manifestPath, manifest);
    throw error;
  }
  process.exit(0);
}

if (command !== "generate") {
  usage();
  throw new Error(`未知命令：${command}`);
}

const seed = values.seed
  ? parseNumber(values.seed, "seed")
  : Math.floor(Math.random() * 2 ** 48);
if (!Number.isSafeInteger(seed) || seed < 0) {
  throw new Error("seed 必须是非负安全整数");
}

const prompt = values["prompt-file"]
  ? await readFile(resolve(values["prompt-file"]), "utf8")
  : undefined;
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
if (values["expected-reference-video-count"] !== undefined &&
    parseNumber(values["expected-reference-video-count"], "expected-reference-video-count") !== referenceVideos.length) {
  throw new Error("参考视频参数在进程间传递时丢失，拒绝提交任务");
}
if (
  (referenceImagePaths.length > 0 || referenceVideos.length > 0) &&
  (firstFrameImagePath || lastFrameImagePath)
) {
  throw new Error("关键帧参数与参考素材参数不能同时使用");
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
const jobId = values["job-id"] ?? createJobId();
const jobDir = join(resolve(values["output-dir"]), jobId);
await mkdir(jobDir, { recursive: true });

const manifestPath = join(jobDir, "manifest.json");
if (await readJobManifestIfPresent(manifestPath)) {
  throw new Error(`任务目录已存在 manifest，拒绝覆盖：${manifestPath}`);
}
const manifest = {
  job_id: jobId,
  provider: values.provider,
  provider_resource_id: values["provider-resource-id"] ?? null,
  runtime_profile: values["runtime-profile"] ?? null,
  region: values.region ?? null,
  gpu: values.gpu ?? null,
  system_ram_mb: values["system-ram"]
    ? parseNumber(values["system-ram"], "system-ram")
    : null,
  hourly_price: values["hourly-price"]
    ? parseNumber(values["hourly-price"], "hourly-price")
    : null,
  image_version: values["image-version"] ?? null,
  comfy_url: baseUrl,
  workflow: workflowPath,
  preset: values.preset ?? null,
  generation_parameters: {
    mode: referenceImagePaths.length > 0 || referenceVideos.length > 0
      ? "reference-media-to-video"
      : firstFrameImagePath && lastFrameImagePath
        ? "first-last-frame-to-video"
        : firstFrameImagePath
        ? "first-frame-to-video"
        : lastFrameImagePath
          ? "last-frame-to-video"
          : "text-to-video",
    aspect_ratio: generationSettings.aspectRatio,
    duration_seconds: generationSettings.durationSeconds,
    megapixels: generationSettings.megapixels,
    first_frame_filename: firstFrameImagePath
      ? basename(firstFrameImagePath)
      : null,
    last_frame_filename: lastFrameImagePath
      ? basename(lastFrameImagePath)
      : null,
    reference_image_filename: referenceImagePaths[0]
      ? basename(referenceImagePaths[0])
      : null,
    reference_image_filenames: referenceImagePaths.map((imagePath) =>
      basename(imagePath)
    ),
    reference_video_filenames: referenceVideos.map((video) => basename(video.path)),
    reference_video_audio_reused: false,
  },
  seed,
  status: "preparing",
  submitted_at: null,
  completed_at: null,
  prompt_id: null,
  submission_count: 0,
  recovery_attempts: 0,
  artifact_path: null,
  failure_code: null,
  failure_detail: null,
  timings_ms: {},
};
await writeJobManifest(manifestPath, manifest);

try {
  const uploadStartedAt = performance.now();
  let firstFrameImage;
  if (firstFrameImagePath) {
    const uploaded = await client.uploadImage(firstFrameImagePath, {
      subfolder: `codex-h3/${jobId}`,
    });
    firstFrameImage = [uploaded.subfolder, uploaded.name].filter(Boolean).join("/");
    console.log(`首帧图片已上传：${firstFrameImage}`);
  }
  let lastFrameImage;
  if (lastFrameImagePath) {
    const uploaded = await client.uploadImage(lastFrameImagePath, {
      subfolder: `codex-h3/${jobId}`,
    });
    lastFrameImage = [uploaded.subfolder, uploaded.name].filter(Boolean).join("/");
    console.log(`尾帧图片已上传：${lastFrameImage}`);
  }
  const referenceImages = [];
  for (const [index, referenceImagePath] of referenceImagePaths.entries()) {
    const uploaded = await client.uploadImage(referenceImagePath, {
      subfolder: `codex-h3/${jobId}`,
    });
    const referenceImage = [uploaded.subfolder, uploaded.name]
      .filter(Boolean)
      .join("/");
    referenceImages.push(referenceImage);
    console.log(`参考图 ${index + 1}/${referenceImagePaths.length} 已上传：${referenceImage}`);
  }
  const uploadedReferenceVideos = [];
  for (const [index, referenceVideo] of referenceVideos.entries()) {
    const uploaded = await client.uploadVideo(referenceVideo.path, {
      subfolder: `codex-h3/${jobId}`,
    });
    const video = [uploaded.subfolder, uploaded.name].filter(Boolean).join("/");
    uploadedReferenceVideos.push(video);
    console.log(`参考视频 ${index + 1}/${referenceVideos.length} 已上传：${video}`);
  }

  manifest.timings_ms.upload = Math.round(performance.now() - uploadStartedAt);
  const preflightStartedAt = performance.now();
  const sourceWorkflow = await readJson(workflowPath);
  const workflow = configureWorkflow(sourceWorkflow, {
    ...generationSettings,
    prompt,
    seed,
    filenamePrefix: `video/Codex_${jobId}`,
    firstFrameImage,
    lastFrameImage,
    referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
    referenceVideos: uploadedReferenceVideos.length > 0
      ? uploadedReferenceVideos
      : undefined,
  });
  const compatibility = inspectWorkflowCompatibility(
    workflow,
    await client.objectInfo(),
  );
  if (!compatibility.compatible) {
    const error = new Error(
      `当前 ComfyUI 与工作流不兼容：${JSON.stringify(compatibility)}`,
    );
    error.code = "COMFY_WORKFLOW_INCOMPATIBLE";
    throw error;
  }

  await client.health();
  manifest.timings_ms.preflight = Math.round(performance.now() - preflightStartedAt);
  await writeFile(join(jobDir, "workflow.json"), `${JSON.stringify(workflow, null, 2)}\n`, "utf8");
  const submitStartedAt = performance.now();
  manifest.prompt_id = await client.submit(workflow, randomUUID());
  manifest.timings_ms.submit = Math.round(performance.now() - submitStartedAt);
  manifest.status = "submitted";
  manifest.submitted_at = new Date().toISOString();
  manifest.submission_count = 1;
  await writeJobManifest(manifestPath, manifest);

  console.log(`任务已提交：${manifest.prompt_id}`);
  const waitStartedAt = performance.now();
  const { artifact } = await waitForArtifact(client, manifest.prompt_id, {
    pollMs: parseNumber(values["poll-seconds"], "poll-seconds") * 1000,
    timeoutMs: parseNumber(values["timeout-seconds"], "timeout-seconds") * 1000,
  });

  const localName = basename(artifact.filename);
  manifest.timings_ms.queue_and_generation = Math.round(performance.now() - waitStartedAt);
  const downloadStartedAt = performance.now();
  const artifactPath = join(jobDir, localName);
  await writeFile(artifactPath, await client.download(artifact));
  manifest.timings_ms.download = Math.round(performance.now() - downloadStartedAt);
  manifest.timings_ms.client_total = Math.round(performance.now() - startedAt);

  manifest.status = "succeeded";
  manifest.completed_at = new Date().toISOString();
  manifest.artifact_path = artifactPath;
  await writeJobManifest(manifestPath, manifest);
  console.log(`视频已下载：${artifactPath}`);
} catch (error) {
  manifest.status = manifest.prompt_id ? "recovery-pending" : "failed";
  manifest.completed_at = manifest.prompt_id ? null : new Date().toISOString();
  manifest.failure_code = error?.code ?? "UNKNOWN";
  manifest.failure_detail = error instanceof Error ? error.message : String(error);
  await writeJobManifest(manifestPath, manifest);
  throw error;
}
