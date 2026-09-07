import { randomUUID } from "node:crypto";
import { rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

export async function updateConfigResourceId(configPath, config, resourceId) {
  if (typeof resourceId !== "string" || !resourceId.trim()) {
    throw new Error("无法写入空的实例 ID");
  }
  if (!config?.provider || typeof config.provider !== "object") {
    throw new Error("本地配置缺少 provider");
  }

  const selectedPath = resolve(configPath);
  const metadata = await stat(selectedPath);
  const updated = {
    ...config,
    provider: {
      ...config.provider,
      resourceId,
    },
  };
  const temporaryPath = `${dirname(selectedPath)}/.${basename(selectedPath)}.${randomUUID()}.tmp`;

  try {
    await writeFile(temporaryPath, `${JSON.stringify(updated, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: metadata.mode,
    });
    await rename(temporaryPath, selectedPath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }

  return updated;
}
