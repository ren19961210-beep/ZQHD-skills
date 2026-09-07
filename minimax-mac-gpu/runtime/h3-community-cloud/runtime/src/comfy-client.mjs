import { openAsBlob } from "node:fs";
import { basename, extname } from "node:path";

export class ComfyHttpError extends Error {
  constructor(method, path, status, body) {
    super(`${method} ${path} 返回 HTTP ${status}: ${body.slice(0, 240)}`);
    this.name = "ComfyHttpError";
    this.code = `COMFY_HTTP_${status}`;
    this.status = status;
  }
}

export class ComfyClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  async request(path, { method = "GET", json, body, timeoutMs = 15_000 } = {}) {
    if (json !== undefined && body !== undefined) {
      throw new Error("ComfyUI 请求不能同时传入 json 和 body");
    }
    const headers = {};
    if (json !== undefined) headers["content-type"] = "application/json";

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: json === undefined ? body : JSON.stringify(json),
      signal: AbortSignal.timeout(timeoutMs),
    });

    const responseBody = await response.text();
    if (!response.ok) {
      throw new ComfyHttpError(method, path, response.status, responseBody);
    }

    try {
      return JSON.parse(responseBody);
    } catch {
      throw new Error(`${method} ${path} 没有返回 JSON`);
    }
  }

  health() {
    return this.request("/system_stats");
  }

  objectInfo() {
    return this.request("/object_info", { timeoutMs: 60_000 });
  }

  async uploadImage(filePath, { subfolder = "codex-h3" } = {}) {
    const contentTypes = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
    };
    const filename = basename(filePath);
    const form = new FormData();
    form.append(
      "image",
      await openAsBlob(filePath, {
        type: contentTypes[extname(filePath).toLowerCase()] ?? "application/octet-stream",
      }),
      filename,
    );
    form.append("type", "input");
    form.append("subfolder", subfolder);
    form.append("overwrite", "false");

    const result = await this.request("/upload/image", {
      method: "POST",
      body: form,
      timeoutMs: 120_000,
    });
    if (!result?.name) {
      throw new Error(`ComfyUI 上传图片未返回文件名：${JSON.stringify(result)}`);
    }

    return {
      name: result.name,
      subfolder: result.subfolder ?? "",
      type: result.type ?? "input",
    };
  }

  async uploadVideo(filePath, { subfolder = "codex-h3" } = {}) {
    const contentTypes = { ".mp4": "video/mp4", ".mov": "video/quicktime" };
    const filename = basename(filePath);
    const form = new FormData();
    form.append(
      "image",
      await openAsBlob(filePath, {
        type: contentTypes[extname(filePath).toLowerCase()] ?? "application/octet-stream",
      }),
      filename,
    );
    form.append("type", "input");
    form.append("subfolder", subfolder);
    form.append("overwrite", "false");

    const result = await this.request("/upload/image", {
      method: "POST",
      body: form,
      timeoutMs: 180_000,
    });
    if (!result?.name) {
      throw new Error(`ComfyUI 上传视频未返回文件名：${JSON.stringify(result)}`);
    }
    return { name: result.name, subfolder: result.subfolder ?? "", type: result.type ?? "input" };
  }

  async submit(workflow, clientId) {
    const result = await this.request("/prompt", {
      method: "POST",
      json: { prompt: workflow, client_id: clientId },
      timeoutMs: 30_000,
    });

    if (!result.prompt_id) {
      throw new Error(`ComfyUI 未返回 prompt_id: ${JSON.stringify(result)}`);
    }

    return result.prompt_id;
  }

  history(promptId) {
    return this.request(`/history/${encodeURIComponent(promptId)}`);
  }

  queue() {
    return this.request("/queue");
  }

  async download(artifact) {
    const query = new URLSearchParams({
      filename: artifact.filename,
      subfolder: artifact.subfolder,
      type: artifact.type,
    });
    const response = await fetch(`${this.baseUrl}/view?${query}`, {
      signal: AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
      throw new Error(`下载视频返回 HTTP ${response.status}`);
    }

    return Buffer.from(await response.arrayBuffer());
  }
}
