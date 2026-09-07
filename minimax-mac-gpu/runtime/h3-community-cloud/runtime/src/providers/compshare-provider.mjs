import { runCompShareCli } from "../compshare-cli.mjs";
import {
  decodeCompSharePassword,
  openSshTunnel,
  parseSshLoginCommand,
} from "../ssh-tunnel.mjs";
import {
  buildRuntimePreparePayload,
  encodeRuntimePreparePayload,
  parseRuntimePrepareResult,
  RUNTIME_PREPARE_PYTHON,
} from "../runtime-prepare.mjs";

const STATE_MAP = Object.freeze({
  Running: "running",
  Stopped: "stopped",
  Starting: "starting",
  Stopping: "stopping",
  Install: "starting",
  Rebooting: "starting",
});

function firstInstance(data, resourceId) {
  const instance = data?.UHostSet?.[0];
  if (!instance) throw new Error(`优云没有返回实例：${resourceId}`);
  return instance;
}

function requireFields(value, fields, label) {
  for (const field of fields) {
    if (value?.[field] === undefined || value[field] === null || value[field] === "") {
      throw new Error(`${label} 缺少字段：${field}`);
    }
  }
}

function createArgs(spec, { dryRun, wait, timeoutSeconds }) {
  requireFields(
    spec,
    [
      "gpu",
      "cpu",
      "memoryGiB",
      "imageId",
      "region",
      "zone",
      "diskGiB",
      "name",
      "maxHourlyPrice",
    ],
    "创建规格",
  );

  const args = [
    "instance",
    "create",
    "--gpu",
    spec.gpu,
    "--count",
    String(spec.count ?? 1),
    "--cpu",
    String(spec.cpu),
    "--memory",
    `${spec.memoryGiB}GiB`,
    "--image",
    spec.imageId,
    "--image-source",
    spec.imageSource ?? "platform",
    "--region",
    spec.region,
    "--zone",
    spec.zone,
    "--disk",
    `${spec.diskGiB}GiB`,
    "--disk-type",
    spec.diskType ?? "CLOUD_SSD",
    "--charge",
    spec.chargeType ?? "Postpay",
    "--name",
    spec.name,
    "--platform",
    spec.cpuPlatform ?? "Auto",
    "--max-count",
    "1",
    "--max-price",
    String(spec.maxHourlyPrice),
    "--yes",
  ];

  if (dryRun) args.push("--dry-run", "--no-wait");
  else args.push(wait ? "--wait" : "--no-wait", "--timeout", String(timeoutSeconds));
  return args;
}

function priceTotal(lineItem) {
  return ["Instance", "Disks", "SystemDisks", "CompShareImage"].reduce(
    (sum, key) => sum + (Number(lineItem?.[key]) || 0),
    0,
  );
}

function quoteRemoteArgument(value) {
  return `'${String(value).replaceAll("'", `'"'"'`)}'`;
}

function remoteShellCommand(command) {
  return command.map(quoteRemoteArgument).join(" ");
}

const RETRYABLE_REMOTE_CONNECTION_ERRORS = new Set([
  "connection_timeout",
  "connection_refused",
  "network_unreachable",
  "dns_resolution_failed",
  "ssh_failed",
]);

const NON_RETRYABLE_SSH_PATTERNS = [
  /permission denied/i,
  /authentication failed/i,
  /host key verification failed/i,
  /remote host identification has changed/i,
  /invalid password/i,
];

function isRetryableRemoteConnectionError(error) {
  if (!RETRYABLE_REMOTE_CONNECTION_ERRORS.has(error?.code)) return false;
  const message = error?.message ?? "";
  return !NON_RETRYABLE_SSH_PATTERNS.some((pattern) => pattern.test(message));
}

export class CompShareProvider {
  constructor({
    credentialProfile,
    runner = runCompShareCli,
    tunnelOpener = openSshTunnel,
    sleeper = (milliseconds) =>
      new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)),
    now = () => Date.now(),
  }) {
    if (!credentialProfile) throw new Error("缺少优云 credentialProfile");
    this.credentialProfile = credentialProfile;
    this.runner = runner;
    this.tunnelOpener = tunnelOpener;
    this.sleeper = sleeper;
    this.now = now;
  }

  args(...parts) {
    return ["--json", "--profile", this.credentialProfile, ...parts];
  }

  async validateCredentials() {
    const data = await this.runner(this.args("instance", "zones"));
    return {
      valid: true,
      zones: data?.items ?? [],
    };
  }

  async getImage(imageId, { source = "platform", region, zone } = {}) {
    if (!imageId) throw new Error("缺少镜像 ID");
    const args = ["image", "show", imageId, "--source", source];
    if (region) args.push("--region", region);
    if (zone) args.push("--zone", zone);
    const data = await this.runner(this.args(...args));
    if (!data?.image) throw new Error(`优云没有返回镜像：${imageId}`);
    return data.image;
  }

  async searchAvailability(spec) {
    requireFields(spec, ["imageId", "region", "zone"], "库存查询规格");
    const args = [
      "instance",
      "search",
      "--image",
      spec.imageId,
      "--available",
      "--region",
      spec.region,
      "--zone",
      spec.zone,
      "--disk",
      `${spec.diskGiB ?? 100}GiB`,
    ];
    if (spec.gpu) args.push("--gpu", spec.gpu);
    return this.runner(this.args(...args));
  }

  async listModels({ name, region, zone }) {
    requireFields({ region }, ["region"], "模型库查询");
    const args = ["instance", "models", "--region", region];
    if (zone) args.push("--zone", zone);
    if (name) args.push("--name", name);
    const data = await this.runner(this.args(...args));
    return data?.items ?? [];
  }

  async quote(spec) {
    requireFields(
      spec,
      ["gpu", "cpu", "memoryGiB", "region", "zone", "diskGiB"],
      "报价规格",
    );
    const args = [
      "instance",
      "price",
      "--gpu",
      spec.gpu,
      "--count",
      String(spec.count ?? 1),
      "--cpu",
      String(spec.cpu),
      "--memory",
      `${spec.memoryGiB}GiB`,
      "--charge",
      spec.chargeType ?? "Postpay",
      "--disk",
      `${spec.diskGiB}GiB`,
      "--disk-type",
      spec.diskType ?? "CLOUD_SSD",
      "--region",
      spec.region,
      "--zone",
      spec.zone,
    ];
    if (spec.imageId) args.push("--image", spec.imageId);

    const data = await this.runner(this.args(...args));
    const lineItem = data?.items?.[0];
    if (!lineItem) throw new Error("优云没有返回报价");
    return {
      chargeType: lineItem.ChargeType ?? spec.chargeType ?? "Postpay",
      lineItem,
      maximumHourly: priceTotal(lineItem),
    };
  }

  async create(spec, { dryRun = false, wait = true, timeoutSeconds = 600 } = {}) {
    let data;
    try {
      data = await this.runner(
        this.args(...createArgs(spec, { dryRun, wait, timeoutSeconds })),
        { timeoutMs: (timeoutSeconds + 20) * 1000 },
      );
    } catch (error) {
      if (/lack of balance|insufficient balance/i.test(error?.message ?? "")) {
        const balanceError = new Error("优云账户余额不足，无法创建计费实例");
        balanceError.code = "COMPSHARE_INSUFFICIENT_BALANCE";
        balanceError.cause = error;
        throw balanceError;
      }
      throw error;
    }
    if (dryRun) return { dryRun: true, plan: data };

    const ids = data?.instance?.UHostIds ?? data?.instance?.UHostId ?? [];
    const resourceIds = Array.isArray(ids) ? ids : [ids];
    if (resourceIds.length === 0 || !resourceIds[0]) {
      throw new Error("优云创建成功响应中没有实例 ID");
    }
    return {
      dryRun: false,
      resourceIds,
      plan: data,
    };
  }

  async getStatus(resourceId, { allowMissing = false } = {}) {
    if (!resourceId) {
      if (allowMissing) return { provider: "compshare", resourceId: null, state: "unconfigured" };
      throw new Error("尚未绑定实例，请先完成部署计划与创建步骤");
    }
    let data;
    try {
      data = await this.runner(
      this.args(
        "instance",
        "show",
        resourceId,
        "--status",
        "--spec",
        "--billing",
        "--image",
      ),
      );
    } catch (error) {
      // 仅对 CLI 的明确缺失提示复核，认证、网络和权限错误不能当作资源已删除。
      if (!allowMissing || error.code !== "invalid_usage" || !error.message.includes(`未找到实例 ${resourceId}`)) throw error;
      const result = await this.runner(this.args("instance", "list", "--id", resourceId, "--all"));
      if (!Array.isArray(result?.items) || result.items.length !== 0) throw error;
      return { provider: "compshare", resourceId, state: "missing", message: "当前凭证可见范围内未找到绑定实例，请重新制定部署计划" };
    }
    const instance = firstInstance(data, resourceId);

    return {
      provider: "compshare",
      resourceId: instance.UHostId,
      name: instance.Name,
      state: STATE_MAP[instance.State] ?? "unknown",
      providerState: instance.State,
      region: instance.Region,
      zone: instance.Zone,
      gpu: {
        type: instance.GpuType,
        count: instance.GPU,
        vramGb: instance.GraphicsMemory?.Value ?? null,
      },
      cpu: instance.CPU,
      memoryMb: instance.Memory,
      image: {
        id: instance.CompShareImageId,
        name: instance.CompShareImageName,
        type: instance.CompShareImageType,
        version: instance.CompShareImageVersionName,
      },
      billing: {
        chargeType: instance.ChargeType,
        instanceHourly: instance.InstancePrice ?? null,
        imageHourly: instance.CompShareImagePrice ?? null,
        diskHourly: instance.DiskPrice ?? null,
      },
      providerStartedAt: instance.StartTime ?? null,
      providerStoppedAt: instance.StopTime ?? null,
      scheduledStopAt: instance.SchedulerStopTime ?? null,
    };
  }

  async start(resourceId, { timeoutSeconds = 600, withoutGpu } = {}) {
    const current = await this.getStatus(resourceId);
    if (current.state === "running") return current;
    if (current.state !== "stopped") {
      throw new Error(`实例当前为 ${current.providerState}，不能启动`);
    }

    if (withoutGpu && !["A", "B"].includes(withoutGpu)) {
      throw new Error(`不支持的无卡规格：${withoutGpu}`);
    }
    const startArgs = ["instance", "start", resourceId];
    if (withoutGpu) startArgs.push("--without-gpu", withoutGpu);
    startArgs.push("--wait", "--timeout", String(timeoutSeconds));

    await this.runner(
      this.args(...startArgs),
      { timeoutMs: (timeoutSeconds + 20) * 1000 },
    );
    return this.getStatus(resourceId);
  }

  async stop(resourceId, { timeoutSeconds = 600 } = {}) {
    let current = await this.getStatus(resourceId);
    if (current.state === "stopped") return current;
    if (["starting", "stopping"].includes(current.state)) {
      const deadline = Date.now() + Math.min(timeoutSeconds, 120) * 1000;
      while (Date.now() < deadline) {
        await this.sleeper(3_000);
        current = await this.getStatus(resourceId);
        if (["running", "stopped"].includes(current.state)) break;
      }
      if (current.state === "stopped") return current;
    }
    if (current.state !== "running") {
      throw new Error(
        `实例当前为 ${current.providerState}，等待后仍不能关机；兜底定时关机保持有效`,
      );
    }

    await this.runner(
      this.args(
        "instance",
        "stop",
        resourceId,
        "--yes",
        "--wait",
        "--timeout",
        String(timeoutSeconds),
      ),
      { timeoutMs: (timeoutSeconds + 20) * 1000 },
    );
    return this.getStatus(resourceId);
  }

  async getSoftwareUrl(resourceId, softwareName) {
    const data = await this.runner([
      "--json",
      "--show-sensitive",
      "--profile",
      this.credentialProfile,
      "instance",
      "show",
      resourceId,
      "--softwares",
    ]);
    const instance = firstInstance(data, resourceId);
    const software = instance.Softwares?.find(
      (candidate) => candidate.Name === softwareName,
    );
    if (!software?.URL) {
      throw new Error(`实例没有提供软件入口：${softwareName}`);
    }
    return software.URL;
  }

  async openRuntimeTunnel(resourceId, options = {}) {
    const data = await this.runner([
      "--json",
      "--show-sensitive",
      "--profile",
      this.credentialProfile,
      "instance",
      "show",
      resourceId,
    ]);
    const instance = firstInstance(data, resourceId);
    if (!instance.Password) {
      throw new Error(`实例没有返回 SSH 密码：${resourceId}`);
    }
    const access = parseSshLoginCommand(instance.SshLoginCommand);
    return this.tunnelOpener({
      ...access,
      password: decodeCompSharePassword(String(instance.Password)),
      resourceId,
      ...options,
    });
  }

  async runRemoteCommand(
    resourceId,
    command,
    {
      timeoutMs = 620_000,
      attempts = 1,
      retryDelayMs = 10_000,
      connectTimeoutSeconds = 30,
      noCache = false,
    } = {},
  ) {
    if (!Array.isArray(command) || command.length === 0) {
      throw new Error("远程命令不能为空");
    }
    if (!Number.isInteger(attempts) || attempts < 1) {
      throw new Error("远程命令尝试次数必须是正整数");
    }

    let result;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const sshArgs = ["instance", "ssh", "--refresh"];
        if (noCache) sshArgs.push("--no-cache");
        sshArgs.push(
          "--connect-timeout",
          String(connectTimeoutSeconds),
          resourceId,
          "--",
          remoteShellCommand(command),
        );
        result = await this.runner(
          this.args(...sshArgs),
          { timeoutMs },
        );
        break;
      } catch (error) {
        if (
          attempt === attempts ||
          !isRetryableRemoteConnectionError(error)
        ) {
          throw error;
        }
        await this.sleeper(retryDelayMs);
      }
    }

    if (result?.exit_code !== 0) {
      const error = new Error(
        result?.error?.message || result?.stderr?.trim() || "优云远程命令失败",
      );
      error.code = "COMPSHARE_REMOTE_COMMAND_FAILED";
      throw error;
    }
    return result;
  }

  async waitForRuntimeTransport(
    resourceId,
    {
      initialDelayMs = 30_000,
      timeoutMs = 300_000,
      intervalMs = 15_000,
      connectTimeoutSeconds = 10,
      onAttempt = () => {},
    } = {},
  ) {
    const startedAtMs = this.now();
    if (initialDelayMs > 0) await this.sleeper(initialDelayMs);

    let attempts = 0;
    let lastError;
    while (true) {
      attempts += 1;
      const elapsedMs = this.now() - startedAtMs;
      try {
        const result = await this.runRemoteCommand(
          resourceId,
          ["printf", "READY"],
          {
            attempts: 1,
            connectTimeoutSeconds,
            noCache: true,
            timeoutMs: (connectTimeoutSeconds + 10) * 1000,
          },
        );
        if (result.stdout?.trim() !== "READY") {
          const outputError = new Error("Runtime Transport 探针没有返回 READY");
          outputError.code = "COMPSHARE_RUNTIME_TRANSPORT_UNEXPECTED_OUTPUT";
          throw outputError;
        }
        onAttempt({ attempt: attempts, elapsedMs, state: "ready" });
        return { ready: true, attempts, elapsedMs };
      } catch (error) {
        lastError = error;
        onAttempt({
          attempt: attempts,
          elapsedMs,
          state: "error",
          errorCode: error?.code ?? "unknown",
          message: error?.message ?? String(error),
        });
        if (!isRetryableRemoteConnectionError(error)) throw error;

        const afterAttemptElapsedMs = this.now() - startedAtMs;
        if (afterAttemptElapsedMs >= timeoutMs) break;
        await this.sleeper(
          Math.min(intervalMs, timeoutMs - afterAttemptElapsedMs),
        );
      }
    }

    const timeoutError = new Error(
      `Runtime Transport 在 ${Math.ceil(timeoutMs / 1000)} 秒内未就绪`,
    );
    timeoutError.code = "COMPSHARE_RUNTIME_TRANSPORT_TIMEOUT";
    timeoutError.attempts = attempts;
    timeoutError.elapsedMs = this.now() - startedAtMs;
    timeoutError.cause = lastError;
    throw timeoutError;
  }

  async prepareRuntime(resourceId, { binding, runtimeSpec }) {
    const payload = buildRuntimePreparePayload(binding, runtimeSpec);
    const result = await this.runRemoteCommand(
      resourceId,
      [
        "python3",
        "-c",
        RUNTIME_PREPARE_PYTHON,
        encodeRuntimePreparePayload(payload),
      ],
      { timeoutMs: 620_000 },
    );
    return parseRuntimePrepareResult(result.stdout);
  }

  async scheduleStop(resourceId, after) {
    if (!after) throw new Error("缺少兜底关机时间");
    await this.runner(
      this.args(
        "instance",
        "schedule",
        "set",
        resourceId,
        "--at",
        after,
      ),
    );
  }
}
