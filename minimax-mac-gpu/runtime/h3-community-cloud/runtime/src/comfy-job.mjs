import { randomUUID } from "node:crypto";
import { readFile, writeFile, rename, rm } from "node:fs/promises";
import { findVideoArtifact } from "./workflow.mjs";

export function createJobId(now = new Date(), suffix = randomUUID().slice(0, 8)) {
  const timestamp = now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `h3-${timestamp}-${suffix}`;
}

export async function readJobManifest(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function readJobManifestIfPresent(path) {
  try {
    return await readJobManifest(path);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export async function writeJobManifest(path, manifest) {
  manifest.updated_at = new Date().toISOString();
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

export function hasRecoverableSubmission(manifest) {
  return Boolean(
    manifest?.prompt_id &&
      manifest.status !== "succeeded" &&
      !manifest.artifact_path,
  );
}

export function queueHasPromptId(queue, promptId) {
  function contains(value) {
    if (value === promptId) return true;
    if (Array.isArray(value)) return value.some(contains);
    if (!value || typeof value !== "object") return false;
    return Object.values(value).some(contains);
  }

  return contains(queue?.queue_running) || contains(queue?.queue_pending);
}

function getHistoryEntry(history, promptId) {
  return history?.[promptId] ?? null;
}

export async function waitForArtifact(
  client,
  promptId,
  { pollMs, timeoutMs, sleep = setTimeout },
) {
  const deadline = Date.now() + timeoutMs;
  let serviceWasUnavailable = false;
  let missingAfterRecovery = 0;

  while (Date.now() < deadline) {
    let history;
    try {
      history = await client.history(promptId);
    } catch (error) {
      if ([502, 503, 504].includes(error?.status)) {
        serviceWasUnavailable = true;
        await new Promise((resolvePromise) => sleep(resolvePromise, pollMs));
        continue;
      }
      throw error;
    }

    const entry = getHistoryEntry(history, promptId);

    if (entry) {
      serviceWasUnavailable = false;
      missingAfterRecovery = 0;
      const artifact = findVideoArtifact(entry);
      if (artifact) return { artifact, entry };

      if (entry.status?.status_str === "error") {
        throw new Error(`ComfyUI 任务失败: ${JSON.stringify(entry.status.messages ?? [])}`);
      }

      if (entry.status?.completed) {
        throw new Error("ComfyUI 任务已经完成，但历史记录中没有视频产物");
      }
    } else if (serviceWasUnavailable) {
      missingAfterRecovery += 1;
      if (missingAfterRecovery >= 2) {
        const error = new Error("ComfyUI 服务重启后任务历史已丢失");
        error.code = "COMFY_RESTARTED";
        throw error;
      }
    }

    await new Promise((resolvePromise) => sleep(resolvePromise, pollMs));
  }

  throw new Error(`等待任务超时（${Math.round(timeoutMs / 1000)} 秒）`);
}
