import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export class CompShareCliError extends Error {
  constructor(message, { code = "COMPSHARE_CLI_ERROR", details } = {}) {
    super(message);
    this.name = "CompShareCliError";
    this.code = code;
    this.details = details;
  }
}
function parseEnvelope(stdout) {
  let envelope;
  try {
    envelope = JSON.parse(stdout);
  } catch {
    throw new CompShareCliError("compshare-cli 没有返回有效 JSON", {
      code: "COMPSHARE_INVALID_JSON",
    });
  }

  if (!envelope?.ok) {
    throw new CompShareCliError(
      envelope?.error?.message ?? "compshare-cli 请求失败",
      {
        code: envelope?.error?.code ?? "COMPSHARE_API_ERROR",
        details: envelope?.error?.details,
      },
    );
  }

  return envelope.data;
}

export async function runCompShareCli(args, { timeoutMs = 620_000 } = {}) {
  try {
    const { stdout } = await execFileAsync("compshare", args, {
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
      timeout: timeoutMs,
    });
    return parseEnvelope(stdout);
  } catch (error) {
    if (error instanceof CompShareCliError) throw error;

    if (typeof error?.stdout === "string" && error.stdout.trim()) {
      return parseEnvelope(error.stdout);
    }

    throw new CompShareCliError(error?.message ?? String(error), {
      code: error?.code ?? "COMPSHARE_PROCESS_ERROR",
    });
  }
}
