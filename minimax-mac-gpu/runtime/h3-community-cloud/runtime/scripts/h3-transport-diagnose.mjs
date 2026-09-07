#!/usr/bin/env node

import { parseArgs } from "node:util";
import {
  createProvider,
  defaultConfigPath,
  loadProjectConfig,
} from "../src/project-config.mjs";

const { values } = parseArgs({
  options: {
    config: { type: "string", default: defaultConfigPath },
  },
});

const { config } = await loadProjectConfig(values.config);
const provider = createProvider(config);
const resourceId = config.provider.resourceId;
let taskError;

try {
  const before = await provider.getStatus(resourceId);
  if (before.state !== "stopped") {
    throw new Error(`诊断前实例必须已关机；当前为 ${before.providerState}`);
  }

  console.log("正在启动优云无卡 A 档（约 ¥0.15/小时，最多 10 分钟）……");
  const running = await provider.start(resourceId, { withoutGpu: "A" });
  await provider.scheduleStop(resourceId, "10m");
  console.log(
    `已设置 10 分钟兜底关机；平台启动时间：${running.providerStartedAt ?? "未返回"}`,
  );

  const ready = await provider.waitForRuntimeTransport(resourceId, {
    onAttempt(event) {
      const elapsedSeconds = Math.round(event.elapsedMs / 1000);
      console.log(
        event.state === "ready"
          ? `SSH 探针 ${event.attempt} 成功（${elapsedSeconds} 秒）`
          : `SSH 探针 ${event.attempt} 未就绪：${event.errorCode}（${elapsedSeconds} 秒）`,
      );
    },
  });
  console.log(`Runtime Transport READY，共 ${ready.attempts} 次探测。`);

  const diagnostics = await provider.runRemoteCommand(
    resourceId,
    [
      "sh",
      "-lc",
      [
        "echo '=== uptime ==='",
        "uptime",
        "echo '=== ssh processes ==='",
        "ps -eo pid,comm,args | grep '[s]shd' || true",
        "echo '=== listening ports ==='",
        "ss -lntp 2>/dev/null | grep -E '(:22|:23|:8188)' || true",
        "echo '=== ssh service ==='",
        "(systemctl is-active ssh 2>/dev/null || systemctl is-active sshd 2>/dev/null || true)",
        "echo '=== recent ssh logs ==='",
        "(journalctl -u ssh -u sshd -n 40 --no-pager 2>/dev/null || tail -n 40 /var/log/auth.log 2>/dev/null || true)",
      ].join("; "),
    ],
    {
      attempts: 1,
      connectTimeoutSeconds: 10,
      noCache: true,
      timeoutMs: 30_000,
    },
  );
  process.stdout.write(diagnostics.stdout);
  if (diagnostics.stderr) process.stderr.write(diagnostics.stderr);
} catch (error) {
  taskError = error;
} finally {
  try {
    console.log("正在结束无卡诊断并关机……");
    const stopped = await provider.stop(resourceId);
    console.log(`实例最终状态：${stopped.state}`);
  } catch (cleanupError) {
    if (taskError) {
      console.error(`警告：诊断失败后主动关机也失败：${cleanupError.message}`);
    } else {
      taskError = cleanupError;
    }
  }
}

if (taskError) throw taskError;
