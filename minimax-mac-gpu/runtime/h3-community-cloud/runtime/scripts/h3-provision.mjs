#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { CompShareProvider } from "../src/providers/compshare-provider.mjs";
import { buildProvisionPlan } from "../src/deployment-planner.mjs";
import { updateConfigResourceId } from "../src/config-store.mjs";
import { defaultConfigPath, projectRoot } from "../src/project-config.mjs";

const defaultBindingPath = resolve(
  projectRoot,
  "deployments/compshare/official-comfyui-033-5090-turbo.json",
);

function usage() {
  console.log(`用法：
  h3-provision plan [--binding <Deployment Binding>] [--config <本地配置>]
  h3-provision create --yes [--binding <Deployment Binding>] [--config <本地配置>]

plan 只验证凭证、镜像、库存、报价和创建参数，不创建计费资源。
create 会再次执行 plan，创建一台实例，立即设置兜底关机，并复核实际账单。`);
}

async function readJson(path) {
  return JSON.parse(await readFile(resolve(path), "utf8"));
}

async function waitForRunning(provider, resourceId, timeoutMs = 600_000) {
  const deadline = Date.now() + timeoutMs;
  let lastStatus;

  while (Date.now() < deadline) {
    lastStatus = await provider.getStatus(resourceId);
    if (lastStatus.state === "running") return lastStatus;
    if (lastStatus.state === "stopped") {
      throw new Error(`新实例意外停止：${lastStatus.providerState}`);
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 5_000));
  }

  throw new Error(
    `等待实例运行超时：${lastStatus?.providerState ?? "尚未取得状态"}`,
  );
}

async function stopAfterProvisionFailure(provider, resourceId) {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const status = await provider.getStatus(resourceId);
    if (status.state === "stopped") return status;
    if (status.state === "running") return provider.stop(resourceId);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 5_000));
  }
  throw new Error("实例创建失败后仍未进入可关机状态");
}

function actualHourlyTotal(status) {
  return [
    status.billing?.instanceHourly,
    status.billing?.imageHourly,
    status.billing?.diskHourly,
  ].reduce((sum, value) => sum + (Number(value) || 0), 0);
}

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    help: { type: "boolean", short: "h" },
    yes: { type: "boolean", default: false },
    binding: { type: "string" },
    config: { type: "string", default: defaultConfigPath },
  },
});

if (values.help || positionals.length !== 1) {
  usage();
  process.exit(values.help ? 0 : 1);
}

const command = positionals[0];
const config = await readJson(values.config);
const bindingPath = values.binding
  ? resolve(values.binding)
  : config.deploymentBinding
    ? resolve(projectRoot, config.deploymentBinding)
    : defaultBindingPath;
const binding = await readJson(bindingPath);
if (config.provider?.type !== "compshare") {
  throw new Error(`本地配置 Provider 不受支持：${config.provider?.type}`);
}

const provider = new CompShareProvider({
  credentialProfile: config.provider.credentialProfile,
});

if (command === "plan") {
  const { result } = await buildProvisionPlan(provider, binding);
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

if (command !== "create") {
  usage();
  throw new Error(`未知命令：${command}`);
}
if (!values.yes) throw new Error("创建计费实例需要显式传入 --yes");

const { spec, result: plan } = await buildProvisionPlan(provider, binding);
let resourceId;
try {
  const created = await provider.create(spec, { wait: false });
  [resourceId] = created.resourceIds;
  await updateConfigResourceId(values.config, config, resourceId);

  const scheduleStopAfter = binding.safety?.scheduleStopAfter;
  if (!scheduleStopAfter) throw new Error("Deployment Binding 缺少兜底关机策略");
  await provider.scheduleStop(resourceId, scheduleStopAfter);

  const status = await waitForRunning(provider, resourceId);
  const actualHourly = actualHourlyTotal(status);
  if (actualHourly > spec.maxHourlyPrice) {
    const error = new Error(
      `实例实际费用 ${actualHourly} 元/小时超过已确认上限 ${spec.maxHourlyPrice} 元/小时`,
    );
    error.code = "COMPSHARE_ACTUAL_PRICE_EXCEEDED";
    throw error;
  }
  console.log(
    JSON.stringify(
      {
        plan,
        created: {
          resourceId,
          status,
          actualHourly,
          scheduleStopAfter,
          configUpdated: resolve(values.config),
        },
      },
      null,
      2,
    ),
  );
} catch (error) {
  if (resourceId) {
    try {
      const cleanup = await stopAfterProvisionFailure(provider, resourceId);
      console.error(`创建流程失败，实例已清理为：${cleanup.state}`);
    } catch (cleanupError) {
      console.error(
        `紧急警告：实例 ${resourceId} 自动清理失败：${cleanupError.message}`,
      );
    }
  }
  throw error;
}
