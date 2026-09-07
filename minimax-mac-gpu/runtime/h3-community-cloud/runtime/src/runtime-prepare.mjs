import { createHash } from "node:crypto";

export const RUNTIME_PREPARE_PYTHON = String.raw`
import base64
import hashlib
import json
import os
import sys
import tempfile

config = json.loads(base64.b64decode(sys.argv[1]).decode("utf-8"))
target_root = config["targetRoot"]
marker_path = config["markerPath"]

def safe_relative_path(value):
    normalized = os.path.normpath(value)
    if os.path.isabs(value) or normalized == ".." or normalized.startswith("../"):
        raise RuntimeError("模型路径不是安全的相对路径: " + value)
    return normalized

entries = []
for model in config["models"]:
    source_path = safe_relative_path(model.get("sourcePath", model["path"]))
    target_path = safe_relative_path(model.get("targetPath", model["path"]))
    source = os.path.join(model["sourceRoot"], source_path)
    target = os.path.join(target_root, target_path)
    if not os.path.isfile(source):
        raise RuntimeError("平台缓存缺少模型: " + source)
    actual_size = os.path.getsize(source)
    if actual_size != model["sizeBytes"]:
        raise RuntimeError(
            "模型大小不匹配: %s (%s != %s)"
            % (source, actual_size, model["sizeBytes"])
        )
    entries.append((model, source, target))

marker_valid = False
try:
    with open(marker_path, "r", encoding="utf-8") as marker_file:
        marker = json.load(marker_file)
    marker_valid = marker.get("fingerprint") == config["fingerprint"]
except (FileNotFoundError, json.JSONDecodeError, OSError):
    marker_valid = False

links_valid = all(
    os.path.islink(target)
    and os.path.realpath(target) == os.path.realpath(source)
    for _, source, target in entries
)

if marker_valid and links_valid:
    print(json.dumps({
        "runtimeId": config["runtimeId"],
        "fingerprint": config["fingerprint"],
        "cached": True,
        "verifiedFiles": len(entries),
        "createdLinks": 0,
    }))
    sys.exit(0)

for model, source, _ in entries:
    digest = hashlib.sha256()
    with open(source, "rb") as model_file:
        while True:
            chunk = model_file.read(8 * 1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
    actual_hash = digest.hexdigest()
    if actual_hash != model["sha256"]:
        raise RuntimeError(
            "模型 SHA-256 不匹配: %s (%s != %s)"
            % (source, actual_hash, model["sha256"])
        )

created_links = 0
for _, source, target in entries:
    if os.path.lexists(target):
        if not os.path.islink(target):
            raise RuntimeError("拒绝覆盖现有模型文件: " + target)
        if os.path.realpath(target) != os.path.realpath(source):
            raise RuntimeError("拒绝替换指向其他位置的模型链接: " + target)
        continue
    os.makedirs(os.path.dirname(target), exist_ok=True)
    os.symlink(source, target)
    created_links += 1

os.makedirs(os.path.dirname(marker_path), exist_ok=True)
marker = {
    "schemaVersion": 1,
    "runtimeId": config["runtimeId"],
    "fingerprint": config["fingerprint"],
    "verifiedFiles": len(entries),
}
marker_fd, temporary_marker = tempfile.mkstemp(
    prefix=".prepare-",
    dir=os.path.dirname(marker_path),
    text=True,
)
try:
    with os.fdopen(marker_fd, "w", encoding="utf-8") as marker_file:
        json.dump(marker, marker_file, sort_keys=True)
        marker_file.write("\n")
    os.replace(temporary_marker, marker_path)
finally:
    if os.path.exists(temporary_marker):
        os.unlink(temporary_marker)

print(json.dumps({
    "runtimeId": config["runtimeId"],
    "fingerprint": config["fingerprint"],
    "cached": False,
    "verifiedFiles": len(entries),
    "createdLinks": created_links,
}))
`;

function requireString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Runtime Prepare 缺少${label}`);
  }
  return value;
}

function validateModel(model) {
  requireString(model?.path, "模型路径");
  if (model?.source !== undefined) requireString(model.source, "模型来源");
  if (model?.sourcePath !== undefined) {
    requireString(model.sourcePath, ` ${model.path} 的来源路径`);
  }
  requireString(model?.sha256, ` ${model?.path ?? "未知模型"} 的 SHA-256`);
  if (!Number.isSafeInteger(model?.sizeBytes) || model.sizeBytes <= 0) {
    throw new Error(`Runtime Prepare 模型大小无效：${model?.path ?? "未知"}`);
  }
}

export function buildRuntimePreparePayload(binding, runtimeSpec) {
  const modelCache = binding?.modelCache;
  if (modelCache?.copyToSystemDisk !== false) {
    throw new Error("Runtime Prepare 只允许零复制平台缓存");
  }

  const runtimeId = requireString(runtimeSpec?.id, " Runtime Spec ID");
  const targetRoot = requireString(modelCache?.targetRoot, " ComfyUI 模型根目录");
  const markerRoot = requireString(modelCache?.markerRoot, "验证标记目录");
  const models = runtimeSpec?.models?.files;
  if (!Array.isArray(models) || models.length === 0) {
    throw new Error("Runtime Prepare 没有可校验的模型文件");
  }
  models.forEach(validateModel);

  const configuredSources = modelCache.sources;
  const sourceRoots = configuredSources
    ? Object.fromEntries(
        Object.entries(configuredSources).map(([id, source]) => [
          id,
          requireString(source?.path, `模型缓存来源 ${id} 的路径`),
        ]),
      )
    : {
        default: requireString(modelCache?.path, "平台缓存路径"),
      };

  const preparedModels = models.map((model) => {
    const sourceId = model.source ?? "default";
    const sourceRoot = sourceRoots[sourceId];
    if (!sourceRoot) {
      throw new Error(`Runtime Prepare 缺少模型缓存来源：${sourceId}`);
    }
    return {
      path: model.path,
      sourceId,
      sourceRoot,
      sourcePath: model.sourcePath ?? model.path,
      targetPath: model.path,
      sizeBytes: model.sizeBytes,
      sha256: model.sha256,
    };
  });

  const fingerprintSource = JSON.stringify({
    runtimeId,
    repository: runtimeSpec.models.repository,
    revision: runtimeSpec.models.revision,
    sources: runtimeSpec.models.sources,
    models: preparedModels.map(
      ({ path, sourceId, sourcePath, sizeBytes, sha256 }) => ({
        path,
        sourceId,
        sourcePath,
        sizeBytes,
        sha256,
      }),
    ),
  });
  const fingerprint = createHash("sha256").update(fingerprintSource).digest("hex");
  const safeRuntimeId = runtimeId.replace(/[^A-Za-z0-9._-]/g, "_");

  return {
    schemaVersion: 1,
    runtimeId,
    fingerprint,
    targetRoot,
    markerPath: `${markerRoot.replace(/\/$/, "")}/${safeRuntimeId}.json`,
    models: preparedModels,
  };
}

export function encodeRuntimePreparePayload(payload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

export function parseRuntimePrepareResult(stdout) {
  const lines = String(stdout ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) throw new Error("Runtime Prepare 没有返回结果");

  let result;
  try {
    result = JSON.parse(lines.at(-1));
  } catch {
    throw new Error("Runtime Prepare 返回了无效 JSON");
  }
  if (
    typeof result?.cached !== "boolean" ||
    !Number.isInteger(result?.verifiedFiles) ||
    !Number.isInteger(result?.createdLinks)
  ) {
    throw new Error("Runtime Prepare 结果缺少必要字段");
  }
  return result;
}
