import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { CompShareProvider } from "./providers/compshare-provider.mjs";
import { defaultConfigPath } from "./user-paths.mjs";

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export { defaultConfigPath };

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function loadProjectConfig(path = defaultConfigPath) {
  const configPath = resolve(path);
  const config = await readJson(configPath);
  const runtimeProfilePath = resolve(projectRoot, config.runtimeProfile);
  const runtime = await readJson(runtimeProfilePath);
  let deployment = null;

  if (config.deploymentBinding) {
    const bindingPath = resolve(projectRoot, config.deploymentBinding);
    const binding = await readJson(bindingPath);
    const runtimeSpecPath = resolve(projectRoot, binding.runtimeSpec);
    const runtimeSpec = await readJson(runtimeSpecPath);
    deployment = {
      bindingPath,
      binding,
      runtimeSpecPath,
      runtimeSpec,
    };
  }

  if (config.provider?.type !== "compshare") {
    throw new Error(`暂不支持 Provider：${config.provider?.type}`);
  }

  return {
    configPath,
    config,
    runtimeProfilePath,
    runtime: {
      ...runtime,
      workflowPath: resolve(projectRoot, runtime.workflow),
      workflowPaths: Object.fromEntries(
        Object.entries(runtime.workflows ?? {}).map(([mode, workflow]) => [
          mode,
          resolve(projectRoot, workflow),
        ]),
      ),
    },
    deployment,
  };
}

export function getRuntimeWorkflowPath(runtime, mode) {
  const modePath = runtime.workflowPaths?.[mode];
  if (modePath) return modePath;
  if (
    [
      "text-to-video",
      "first-frame-to-video",
      "last-frame-to-video",
      "first-last-frame-to-video",
    ].includes(mode)
  ) {
    return runtime.workflowPath;
  }
  throw new Error(`Runtime Profile 不支持生成模式：${mode}`);
}

export function createProvider(config) {
  return new CompShareProvider({
    credentialProfile: config.provider.credentialProfile,
  });
}

export function validateRuntime(status, runtime) {
  const expected = runtime.expectedImage;
  const mismatches = [];

  if (expected?.id && status.image.id !== expected.id) {
    mismatches.push(`镜像 ID ${status.image.id} != ${expected.id}`);
  }
  if (expected?.type && status.image.type !== expected.type) {
    mismatches.push(`镜像类型 ${status.image.type} != ${expected.type}`);
  }
  if (expected?.version && status.image.version !== expected.version) {
    mismatches.push(`镜像版本 ${status.image.version} != ${expected.version}`);
  }
  if (
    runtime.minimumSystemMemoryMb &&
    status.state !== "stopped" &&
    status.memoryMb < runtime.minimumSystemMemoryMb
  ) {
    mismatches.push(
      `系统内存 ${status.memoryMb}MB < ${runtime.minimumSystemMemoryMb}MB`,
    );
  }

  if (mismatches.length > 0) {
    throw new Error(`实例与 Runtime Profile 不兼容：${mismatches.join("；")}`);
  }
}
