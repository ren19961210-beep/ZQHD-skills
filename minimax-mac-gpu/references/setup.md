# 安装与首次配置

## 首次顺序

先引导使用者到[优云智算](https://console.compshare.cn/)注册或登录，确认完成后由助手检查下列依赖和运行器，再指导本人在交互式终端隐藏输入 API Key，由助手验证接通。首次不要求租卡、充值或准备素材；已有账号和有效凭证可直接复核。h3-user 只是示例凭证名称，不属于发布者账号。


## 环境检查

检查 macOS、Node.js 22.17+、Python 3.9+、pip、OpenSSH、`ffprobe`、Codex 插件命令和 `compshare`。缺失项才安装，不改系统 Python。

```bash
uname -sm
sw_vers
node --version
python3 --version
pip3 --version
ssh -V
ffprobe -version
codex --version
codex plugin --help
compshare --version
```

## CompShare CLI

优先把 CLI 装进独立虚拟环境：

```bash
python3 -m venv "$HOME/.local/share/compshare-cli/venv"
"$HOME/.local/share/compshare-cli/venv/bin/python" -m pip install --upgrade 'compshare-cli>=0.3.5'
mkdir -p "$HOME/.local/bin"
ln -s "$HOME/.local/share/compshare-cli/venv/bin/compshare" "$HOME/.local/bin/compshare"
ln -s "$HOME/.local/share/compshare-cli/venv/bin/compshare-ssh-askpass" "$HOME/.local/bin/compshare-ssh-askpass"
```

若目标链接已存在，先检查它是否指向同一虚拟环境；不要盲目覆盖。两个入口必须同时可执行，否则远程任务会在 `PasswordAutomationUnavailable` 处失败。

当前已验证组合为 CompShare CLI 0.4.1、Typer 0.16.0、Click 8.2.1。只有出现 `typer._click.exceptions` 的 `Abort` 兼容错误时，才在该虚拟环境中固定版本：

```bash
"$HOME/.local/share/compshare-cli/venv/bin/python" -m pip install 'typer==0.16.0' 'click==8.2.1'
```

随后验证 `compshare --version`、`pip check` 和两个入口，不把兼容修复写进系统 Python。

## 增强版入口与原版回退

公开版附带 `runtime/h3-community-cloud/`，通过 `scripts/resolve-plugin.sh` 相对解析。必须复制完整 Skill 文件夹。使用解析出的 `scripts/h3-cloud --help` 和本地 `generate --dry-run` 验证；无需原作者路径，也不等于已经注册到 Codex 插件市场。每位使用者自行配置凭证，包内不包含可运行的私人云端绑定。

原社区插件保留为显式回退：`H3_USE_LEGACY=1 scripts/resolve-plugin.sh`，它不支持增强版视频参数。需要安装旧版时才执行：

```bash
codex plugin marketplace add Sac-Y/MiniMax-H3-Cloud --ref main
codex plugin add minimax-h3-cloud@sac-y-minimax-h3
codex plugin list --marketplace sac-y-minimax-h3 --json
```

仓库地址：<https://github.com/Sac-Y/MiniMax-H3-Cloud>。插件是社区项目，不是 MiniMax 官方项目。

## 凭证

只提供官方入口：[注册或登录](https://console.compshare.cn/) 和 [创建或管理 API Key](https://console.compshare.cn/uaccount/api_manage)。让用户在自己的终端运行：

```bash
compshare config set --name h3-user --no-activate
```

使用者本人在交互式终端通过隐藏输入完成凭证配置，不把密钥发到对话或放入命令行参数。完成后只回复“已完成”，再由助手验证：

```bash
compshare --profile h3-user --json doctor
```

`Signature VerifyAC Error` 通常表示公私钥不匹配、已撤销或录入错误；请用户在官网重新生成一对并本机录入。不要查看凭证文件内容，也不要使用 `--show-sensitive`。

## 实时选卡与默认配置

具体视频生成任务进入本节前，先完成主 Skill 的分辨率选项与画面比例确认，再据此选卡和估算费用。纯安装或查看库存任务无需虚构视频参数。

先取得插件根目录：

```bash
H3_PLUGIN_ROOT="$(scripts/resolve-plugin.sh)"
```

查询实时配置和库存：

```bash
"$H3_PLUGIN_ROOT/scripts/h3-onboard" options --platform compshare --credential-profile h3-user
```

需要 H20 时使用 `h20-96gb`（96GB 显存、240GiB 系统内存）；无法修复真实兼容性故障时向使用者说明 A800 80GB 备用方案和当前价格，得到对应授权后切换。记录实际库存、显存、实例类型、CUDA/PyTorch/镜像、费率及证据状态。已指定 H20 时不重复选卡；5090 两档 96GB/64GB 指系统内存。用户要求更多时加 `--all`。初始化示例：

```bash
"$H3_PLUGIN_ROOT/scripts/h3-onboard" init \
  --platform compshare \
  --resource-option '<选择ID>' \
  --credential-profile h3-user \
  --config "$HOME/.config/h3-community-cloud/config.json"
```

默认配置若已存在，先读取非敏感字段并确认复用，不覆盖。必须验证配置文件权限为 `0600`、不含 API Key、`resourceId` 为空或指向用户明确复用的实例，并包含：

```json
{
  "safety": {
    "scheduleStopAfter": "30m",
    "stopAfterJob": true
  }
}
```

最后运行只读部署计划：

```bash
"$H3_PLUGIN_ROOT/scripts/h3-provision" plan \
  --config "$HOME/.config/h3-community-cloud/config.json"
```

计划需要同时通过凭证、镜像、模型缓存、库存、区域和报价检查。不得以历史参考价代替当前报价，不执行 `create` 即不会创建收费实例。创建后复核实际总费率，不把配置中较宽松的 maximumHourlyPrice 当作用户授权；历史上计划与实际价格曾有差异。
