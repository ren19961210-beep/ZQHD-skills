export async function openRuntimeEndpoint({ provider, resourceId, runtime }) {
  const transport = runtime.transport?.type ?? "software-url";
  if (transport === "software-url") {
    return {
      url: await provider.getSoftwareUrl(resourceId, runtime.softwareName),
      close: async () => {},
    };
  }

  if (transport === "ssh-tunnel") {
    if (typeof provider.openRuntimeTunnel !== "function") {
      throw new Error("当前 Provider 不支持 SSH 隧道");
    }
    return provider.openRuntimeTunnel(resourceId, {
      remoteHost: runtime.transport.remoteHost ?? "127.0.0.1",
      remotePort: runtime.transport.remotePort ?? 8188,
    });
  }

  throw new Error(`不支持的 Runtime transport：${transport}`);
}
