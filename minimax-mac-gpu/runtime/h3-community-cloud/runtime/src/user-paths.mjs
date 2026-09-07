import { homedir } from "node:os";
import { join, resolve } from "node:path";

function configuredRoot(value, fallback) {
  return value?.trim() ? resolve(value) : fallback;
}

export function resolveUserConfigDir({ env = process.env, home = homedir() } = {}) {
  const root = configuredRoot(env.XDG_CONFIG_HOME, join(home, ".config"));
  return join(root, "h3-community-cloud");
}

export function resolveUserDataDir({ env = process.env, home = homedir() } = {}) {
  const root = configuredRoot(env.XDG_DATA_HOME, join(home, ".local", "share"));
  return join(root, "h3-community-cloud");
}

export const defaultConfigPath = join(resolveUserConfigDir(), "config.json");
export const defaultOutputDir = join(resolveUserDataDir(), "outputs");
