#!/bin/sh
set -eu

skill_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
if [ "${H3_USE_LEGACY:-0}" = "1" ]; then
  codex_root="${CODEX_HOME:-${HOME}/.codex}"
  cache_root="$codex_root/plugins/cache/sac-y-minimax-h3/minimax-h3-cloud"
  if [ ! -d "$cache_root" ]; then
    printf '%s\n' '未找到原社区插件，请按 setup.md 安装。' >&2
    exit 1
  fi
  plugin_root=$(ls -1dt "$cache_root"/* 2>/dev/null | head -n 1)
else
  plugin_root="$skill_root/runtime/h3-community-cloud"
fi
if [ ! -x "$plugin_root/scripts/h3-cloud" ] || [ ! -f "$plugin_root/.codex-plugin/plugin.json" ]; then
  printf '%s\n' '未找到完整运行器，请复制整个 minimax-mac-gpu 目录；不会静默回退。' >&2
  exit 1
fi
if [ "${H3_USE_LEGACY:-0}" != "1" ]; then
  node -e 'const fs=require("node:fs");const m=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));if(m.name!=="h3-community-cloud")throw new Error("运行器标识不匹配");' "$plugin_root/.codex-plugin/plugin.json"
fi
printf '%s\n' "$plugin_root"
