import { stat } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const SUPPORTED_IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const SUPPORTED_VIDEO_EXTENSIONS = new Set([".mp4", ".mov"]);
const SUPPORTED_VIDEO_CODECS = new Set(["h264", "hevc"]);
const execFileAsync = promisify(execFile);

export async function resolveImageInput(value, { label = "首帧图片" } = {}) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label}路径不能为空`);
  }

  const imagePath = resolve(value);
  const fileInfo = await stat(imagePath).catch(() => null);
  if (!fileInfo?.isFile()) {
    throw new Error(`${label}不存在或不是普通文件：${imagePath}`);
  }

  const extension = extname(imagePath).toLowerCase();
  if (!SUPPORTED_IMAGE_EXTENSIONS.has(extension)) {
    throw new Error(`${label}格式只支持 PNG、JPG、JPEG 和 WebP`);
  }

  return imagePath;
}

export function resolveReferenceImageInput(value) {
  return resolveImageInput(value, { label: "参考图" });
}

export async function resolveReferenceImageInputs(values) {
  const inputs = values === undefined
    ? []
    : Array.isArray(values)
      ? values
      : [values];
  if (inputs.length > 9) {
    throw new Error("参考图最多支持 9 张");
  }
  return Promise.all(inputs.map((value) => resolveReferenceImageInput(value)));
}

export function resolveLastFrameImageInput(value) {
  return resolveImageInput(value, { label: "尾帧图片" });
}

function fraction(value) {
  const [numerator, denominator = 1] = String(value).split("/").map(Number);
  return denominator ? numerator / denominator : 0;
}

export async function resolveReferenceVideoInput(value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("参考视频路径不能为空");
  }
  const videoPath = resolve(value);
  const fileInfo = await stat(videoPath).catch(() => null);
  if (!fileInfo?.isFile()) {
    throw new Error(`参考视频不存在或不是普通文件：${videoPath}`);
  }
  if (!SUPPORTED_VIDEO_EXTENSIONS.has(extname(videoPath).toLowerCase())) {
    throw new Error("参考视频格式只支持 MP4 和 MOV");
  }
  if (fileInfo.size > 50 * 1024 * 1024) {
    throw new Error("参考视频单文件不能超过 50MB");
  }

  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=codec_name,avg_frame_rate:format=duration",
    "-of", "json", videoPath,
  ], { timeout: 15_000, maxBuffer: 1024 * 1024 });
  const metadata = JSON.parse(stdout);
  const stream = metadata.streams?.[0];
  const duration = Number(metadata.format?.duration);
  const fps = fraction(stream?.avg_frame_rate);
  if (!SUPPORTED_VIDEO_CODECS.has(stream?.codec_name)) {
    throw new Error("参考视频编码只支持 H.264 和 H.265/HEVC");
  }
  if (!(duration >= 2 && duration <= 15)) {
    throw new Error("参考视频时长必须为 2–15 秒");
  }
  if (!(fps >= 23.976 && fps <= 60)) {
    throw new Error("参考视频帧率必须为 23.976–60 fps");
  }
  return { path: videoPath, duration, fps, codec: stream.codec_name };
}

export async function resolveReferenceVideoInputs(values) {
  const inputs = values === undefined ? [] : Array.isArray(values) ? values : [values];
  if (inputs.length > 3) throw new Error("参考视频最多支持 3 段");
  const videos = await Promise.all(inputs.map(resolveReferenceVideoInput));
  const totalDuration = videos.reduce((sum, video) => sum + video.duration, 0);
  if (totalDuration > 15) throw new Error("参考视频总时长不能超过 15 秒");
  return videos;
}

// 外层预览与真实提交共用同一份素材参数，保留顺序和含空格的路径。
export function buildMediaArguments({ firstFrameImagePath, lastFrameImagePath, referenceImagePaths = [], referenceVideos = [] }) {
  const args = [];
  if (firstFrameImagePath) args.push("--first-frame-image", firstFrameImagePath);
  if (lastFrameImagePath) args.push("--last-frame-image", lastFrameImagePath);
  for (const path of referenceImagePaths) args.push("--reference-image", path);
  for (const video of referenceVideos) args.push("--reference-video", video.path);
  return args;
}
