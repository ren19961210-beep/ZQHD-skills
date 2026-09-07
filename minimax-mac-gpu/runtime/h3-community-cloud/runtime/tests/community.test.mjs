import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm, readdir, open } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:http";
import { configureWorkflow } from "../src/workflow.mjs";
import { resolveReferenceVideoInputs, buildMediaArguments } from "../src/media-input.mjs";
import { CompShareProvider } from "../src/providers/compshare-provider.mjs";
import { writeJobManifest, readJobManifest } from "../src/comfy-job.mjs";
import { resolveUserConfigDir } from "../src/user-paths.mjs";
import { createUserConfig, resourceOptions } from "../src/onboarding.mjs";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
const source = JSON.parse(await readFile(join(root, "workflows/official-h3-reference-image-native-20step-api.json"), "utf8"));
const settings = { aspectRatio: "16:9", durationSeconds: 2, megapixels: 0.2, seed: 42, filenamePrefix: "test" };
const configured = (extra = {}) => configureWorkflow(source, { ...settings, referenceVideos: ["测试 空格.mp4"], ...extra });
let temp;
let video;

before(async () => {
  temp = await mkdtemp(join(tmpdir(), "h3-community-test-"));
  video = join(temp, "参考 空格.mp4");
  await exec("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=red:s=32x32:r=24:d=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", video]);
});
after(async () => { if (temp) await rm(temp, { recursive: true, force: true }); });

test("纯视频提示词只添加实际视频引用，默认提示词也可用", () => {
  for (const prompt of [undefined, "继承视频动作", "<Video 1> 继承视频动作"]) {
    const workflow = configured({ prompt });
    assert.equal((workflow["131"].inputs.prompt.match(/<Video 1>/g) ?? []).length, 1);
    assert.doesNotMatch(workflow["131"].inputs.prompt, /<Picture/);
    assert.deepEqual(workflow["131"].inputs["ref_videos.ref_video_0"], ["codex_reference_video_components_0", 0]);
    assert.equal(workflow.codex_reference_video_0.inputs.file, "测试 空格.mp4");
  }
});

test("混合素材保持编号和顺序，不连接参考音轨，不改写模板", () => {
  const original = JSON.stringify(source);
  const workflow = configured({ referenceImages: ["a.png", "b.png"], referenceVideos: ["a.mp4", "b.mp4", "c.mp4"], prompt: "<Picture 2> <Video 3> 转身" });
  for (const tag of ["Picture 1", "Picture 2", "Video 1", "Video 2", "Video 3"]) assert.equal(workflow["131"].inputs.prompt.split(`<${tag}>`).length, 2);
  assert.equal(workflow.codex_reference_video_2.inputs.file, "c.mp4");
  for (const node of Object.values(workflow)) {
    for (const value of Object.values(node.inputs)) {
      if (Array.isArray(value) && String(value[0]).startsWith("codex_reference_video_components_")) assert.equal(value[1], 0);
    }
  }
  assert.equal(JSON.stringify(source), original);
});

for (const [name, extra, pattern] of [
  ["无素材", { referenceVideos: [] }, /至少需要/],
  ["不存在的图片标签", { prompt: "<Picture 1> 运动" }, /不存在的素材/],
  ["越界视频标签", { prompt: "<Video 2> 运动" }, /不存在的素材/],
  ["混用关键帧", { firstFrameImage: "a.png" }, /不能同时使用/],
  ["空视频路径", { referenceVideos: [""] }, /不能为空/],
  ["超量视频", { referenceVideos: ["a", "b", "c", "d"] }, /最多 3/],
]) test(`提交前拒绝${name}`, () => assert.throws(() => configured(extra), pattern));

test("实际视频探测可用，空输入、缺失文件、格式与大小检查生效", async () => {
  const [result] = await resolveReferenceVideoInputs(video);
  assert.equal(result.duration, 2);
  assert.equal(result.fps, 24);
  assert.equal(result.codec, "h264");
  assert.deepEqual(await resolveReferenceVideoInputs(), []);
  await assert.rejects(resolveReferenceVideoInputs(""), /不能为空/);
  await assert.rejects(resolveReferenceVideoInputs(join(temp, "不存在.mp4")), /不存在/);
  const invalid = join(temp, "file.txt");
  await writeFile(invalid, "测试");
  await assert.rejects(resolveReferenceVideoInputs(invalid), /格式/);
  const large = join(temp, "large.mp4");
  const handle = await open(large, "w");
  await handle.truncate(50 * 1024 * 1024 + 1);
  await handle.close();
  await assert.rejects(resolveReferenceVideoInputs(large), /50MB/);
});

for (const [name, duration, fps, codec, pattern] of [
  ["时长不足", 1, 24, "libx264", /时长/],
  ["帧率不足", 2, 12, "libx264", /帧率/],
  ["帧率过高", 2, 61, "libx264", /帧率/],
  ["错误编码", 2, 24, "mpeg4", /编码/],
  ["总时长过长", 6, 24, "libx264", /总时长/],
]) test(`实际媒体拒绝${name}`, async () => {
  const file = join(temp, `${name}.mp4`);
  await exec("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", `color=s=32x32:r=${fps}:d=${duration}`, "-c:v", codec, file]);
  await assert.rejects(resolveReferenceVideoInputs(duration === 6 ? [file, file, file] : file), pattern);
});

test("参数转发保持多个素材和空格路径", () => {
  assert.deepEqual(buildMediaArguments({ referenceImagePaths: ["a b.png"], referenceVideos: [{ path: "a b.mp4" }, { path: "c.mov" }] }), ["--reference-image", "a b.png", "--reference-video", "a b.mp4", "--reference-video", "c.mov"]);
});

test("内层检测外层声明的视频数量，漏传时在网络访问前终止", async () => {
  await assert.rejects(exec(process.execPath, [join(root, "scripts/h3-comfy.mjs"), "generate", "--url", "http://127.0.0.1:1", "--expected-reference-video-count", "1", "--aspect-ratio", "16:9", "--duration-seconds", "2", "--megapixels", "0.2"]), error => {
    assert.match(error.stderr, /进程间传递时丢失/);
    return true;
  });
});

test("外层 CLI 本地预览走实际校验，无绑定实例也能运行", async () => {
  const config = join(temp, "config.json");
  await writeFile(config, JSON.stringify({ provider: { type: "compshare", credentialProfile: "不存在的测试凭证", resourceId: "" }, runtimeProfile: "profiles/compshare-official-h3-turbo-8step-033-v1.json" }));
  const { stdout } = await exec(process.execPath, [join(root, "scripts/h3-cloud.mjs"), "generate", "--dry-run", "--config", config, "--reference-video", video, "--reference-video", video, "--aspect-ratio", "16:9", "--duration-seconds", "2", "--megapixels", "0.2"]);
  const preview = JSON.parse(stdout);
  assert.equal(preview.cloud_accessed, false);
  assert.equal(preview.reference_video_count, 2);
  assert.deepEqual(preview.media_arguments, ["--reference-video", video, "--reference-video", video]);
  assert.ok(preview.workflow["131"].inputs["ref_videos.ref_video_1"]);
});

test("资源缺失需要独立清单复核，默认生成调用仍抛错", async () => {
  const calls = [];
  const provider = new CompShareProvider({ credentialProfile: "test", runner: async args => {
    calls.push(args);
    if (args.includes("show")) throw Object.assign(new Error("未找到实例 uhost-test。"), { code: "invalid_usage" });
    return { items: [] };
  } });
  assert.equal((await provider.getStatus("uhost-test", { allowMissing: true })).state, "missing");
  assert.ok(calls[1].includes("--id"));
  await assert.rejects(provider.getStatus("uhost-test"), /未找到实例/);
  assert.equal((await provider.getStatus("", { allowMissing: true })).state, "unconfigured");
});

test("认证错误和无效清单不能误报实例缺失", async () => {
  for (const code of ["unauthorized", "ETIMEDOUT"]) {
    const provider = new CompShareProvider({ credentialProfile: "test", runner: async () => { throw Object.assign(new Error("失败"), { code }); } });
    await assert.rejects(provider.getStatus("uhost-test", { allowMissing: true }), { code });
  }
  for (const items of [undefined, [{ UHostId: "uhost-test" }]]) {
    const provider = new CompShareProvider({ credentialProfile: "test", runner: async args => {
      if (args.includes("show")) throw Object.assign(new Error("未找到实例 uhost-test。"), { code: "invalid_usage" });
      return { items };
    } });
    await assert.rejects(provider.getStatus("uhost-test", { allowMissing: true }), /未找到实例/);
  }
});

test("任务清单原子更新且临时文件清理", async () => {
  const path = join(temp, "manifest.json");
  await writeJobManifest(path, { prompt_id: "one", status: "submitted" });
  await writeJobManifest(path, { prompt_id: "one", status: "succeeded" });
  assert.equal((await readJobManifest(path)).status, "succeeded");
  assert.equal((await readdir(temp)).filter(name => name.endsWith(".tmp")).length, 0);
});

test("自有插件配置目录与社区原版隔离", () => {
  assert.equal(resolveUserConfigDir({ env: {}, home: "/tmp/example" }), "/tmp/example/.config/h3-community-cloud");
});

test("H20 选择保留 96GB 显存配置且不回退 A800", async () => {
  const option = resourceOptions("compshare").find(item => item.id === "h20-96gb");
  assert.equal(option.hardware.gpuMemoryGiB, 96);
  assert.equal(option.hardware.systemMemoryGiB, 240);
  const config = createUserConfig({ platform: "compshare", credentialProfile: "test", resourceOption: option.id });
  const binding = JSON.parse(await readFile(join(root, config.deploymentBinding), "utf8"));
  assert.equal(binding.compute.gpu, "H20");
  assert.equal(binding.compute.count, 1);
  assert.equal(config.provider.resourceId, "");
  assert.equal(binding.safety.scheduleStopAfter, "30m");
});

test("本地模拟 ComfyUI 验证真实上传、单次提交、工作流、下载和耗时记录", async () => {
  let submitted;
  let submissions = 0;
  let uploaded = false;
  const bytes = await readFile(video);
  const server = createServer(async (req, res) => {
    try {
      res.setHeader("content-type", "application/json");
      if (req.url === "/upload/image") {
        const body = Buffer.concat(await Array.fromAsync(req));
        assert.ok(body.includes(bytes));
        assert.ok(body.includes(Buffer.from("video/mp4")));
        uploaded = true;
        return res.end(JSON.stringify({ name: "input.mp4", subfolder: "test", type: "input" }));
      }
      if (req.url === "/object_info") {
        const definitions = {};
        for (const node of Object.values(configured())) {
          const required = definitions[node.class_type]?.input.required ?? {};
          for (const key of Object.keys(node.inputs)) required[key] = ["测试类型"];
          definitions[node.class_type] = { input: { required } };
        }
        return res.end(JSON.stringify(definitions));
      }
      if (req.url === "/system_stats") return res.end("{}");
      if (req.url === "/prompt") {
        submissions++;
        submitted = JSON.parse(Buffer.concat(await Array.fromAsync(req)).toString());
        return res.end(JSON.stringify({ prompt_id: "test-prompt" }));
      }
      if (req.url === "/history/test-prompt") return res.end(JSON.stringify({ "test-prompt": { status: { completed: true }, outputs: { "92": { videos: [{ filename: "result.mp4", type: "output", subfolder: "" }] } } } }));
      if (req.url.startsWith("/view?")) return res.end(bytes);
      res.writeHead(404).end("{}");
    } catch (error) { res.writeHead(500).end(JSON.stringify({ error: error.message })); }
  });
  await new Promise(done => server.listen(0, "127.0.0.1", done));
  try {
    const url = `http://127.0.0.1:${server.address().port}`;
    await exec(process.execPath, [join(root, "scripts/h3-comfy.mjs"), "generate", "--url", url, "--workflow", join(root, "workflows/official-h3-reference-image-native-20step-api.json"), "--reference-video", video, "--aspect-ratio", "16:9", "--duration-seconds", "2", "--megapixels", "0.2", "--output-dir", temp, "--job-id", "integration", "--timeout-seconds", "5"]);
    assert.equal(uploaded, true);
    assert.equal(submissions, 1);
    assert.doesNotMatch(submitted.prompt["131"].inputs.prompt, /<Picture/);
    assert.equal(submitted.prompt.codex_reference_video_0.inputs.file, "test/input.mp4");
    const manifest = await readJobManifest(join(temp, "integration/manifest.json"));
    assert.equal(manifest.status, "succeeded");
    assert.equal(manifest.generation_parameters.mode, "reference-media-to-video");
    assert.equal(manifest.generation_parameters.reference_video_filenames.length, 1);
    assert.equal(manifest.submission_count, 1);
    for (const field of ["upload", "preflight", "submit", "queue_and_generation", "download", "client_total"]) assert.ok(manifest.timings_ms[field] >= 0);
    assert.deepEqual(await readFile(manifest.artifact_path), bytes);
    assert.deepEqual(JSON.parse(await readFile(join(temp, "integration/workflow.json"))), submitted.prompt);
  } finally {
    server.closeAllConnections();
    await new Promise(done => server.close(done));
  }
});
