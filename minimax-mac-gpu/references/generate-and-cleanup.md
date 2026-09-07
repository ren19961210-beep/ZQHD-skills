# 生成、恢复、验收与清理

## 选择生成模式

生成前先检查当前插件输入能力：

```bash
"$H3_PLUGIN_ROOT/scripts/h3-cloud" generate --help
```

官方 H3 Ref2VA 支持参考视频，但只有当本地插件帮助、Runtime Profile 和上传日志都确认支持视频时，才能传入 MP4。若帮助中只有 `--reference-image`，则不得伪造 `--reference-video`；应回到素材审查流程抽帧，或切换到明确支持官方 Ref2VA 视频输入的执行层，并重新进行费用确认。

先按内容读取 `prompt-authoring.md`；如果是产品、汽车或新能源广告，同时读取 `product-ad-authoring.md`。先完成提示词，再进入本文件的付费与执行步骤。

- 无图片且无视频参考：文生视频。
- 视频用于动作或场景参考：增强版重复传 `--reference-video`，上传接线与成片语义分别验收。
- 图片必须成为开头：`--first-frame-image`。
- 图片必须成为结尾：`--last-frame-image`。
- 同时指定开始和结束：同时传首帧和尾帧。
- 图片只用于保持人物、主体或风格：每张使用一次 `--reference-image`，最多 9 张。

关键帧与参考素材（图片、视频）模式互斥。用户只说“参考图”且用途无法判断时才询问；“把这张图生成视频”通常按首帧图生视频处理，并明确该假设。

## 参数与付费确认

先执行主 Skill 的“选卡和费用确认前：分辨率选择与画面比例确认”：展示实际可执行的分辨率档位，确认画幅和预计宽×高，再选卡报价。已明确的参数沿用；不把 1MP 宣称为 2K，不静默降档。

收齐画幅、时长和清晰度。当前插件支持 2–15 秒、0.2–1.0MP，以及 `1:1`、`2:3`、`3:2`、`3:4`、`4:3`、`9:16`、`16:9`、`21:9`。平台工作流按像素桶取整，因此 1:1 的 0.6MP 可能输出 800×800；用户要求精确 768×768 时，保留模型原片并用本机 `ffmpeg` 另导出 768×768 交付版。

创建前再次运行 `h3-provision plan`。付费确认只包含：生成模式、画幅、时长、清晰度、最新总小时价、预计云端占用时间和预计本次费用。估算必须标明不等于最终账单；可同时给出 30 分钟兜底关机的保守上限。

只有用户明确确认这一次费用后，才能执行：

```bash
"$H3_PLUGIN_ROOT/scripts/h3-provision" create --yes \
  --config "$HOME/.config/h3-community-cloud/config.json"
```

创建结果的实际小时价不得超过用户已确认的报价上限；超出时停止并重新确认。

## 生成

先在拟运行命令后追加 `--dry-run`，检查本地素材、提示词、种子、工作流与引用数。预览不上传、不查询 GPU，也不证明云端节点兼容；通过后再创建或启动已获费用授权的实例。

把画面提示词写入 UTF-8 临时文件。提示词描述动作、镜头、声音、主体一致性、背景稳定和需避免的异常；画幅、时长和 MP 只作为命令参数，不混入提示词。

```bash
"$H3_PLUGIN_ROOT/scripts/h3-cloud" generate \
  --config "$HOME/.config/h3-community-cloud/config.json" \
  --aspect-ratio '<画幅>' \
  --duration-seconds '<秒数>' \
  --megapixels '<MP>' \
  --prompt-file '<提示词绝对路径>' \
  --first-frame-image '<图片绝对路径>' \
  --output-dir '<本地输出目录>'
```

根据模式替换素材参数；参考视频可重复 1–3 次 `--reference-video`，默认不复用音轨，不能将视频路径传给图片参数。不要提前单独启动实例；`generate` 会处理启动、兜底关机、Runtime Prepare、上传、生成、下载和关机。

## 故障恢复

异常时先检查输出目录中本次 job 的 `manifest.json`：

- 已有 `prompt_id`：只恢复原任务的查询与下载，不得重新提交。
- 没有 `prompt_id`：尚未确认提交成功；若提交请求超时或响应丢失，先查云端队列和历史，不能直接认定没提交。先确认实例已停止、修复本机或连接问题，再继续同一次授权任务；不创建第二台实例。
- 退出前实例仍为 running：执行插件 `h3-cloud stop --yes` 并再次查询状态。

已见过的 macOS 故障：`PasswordAutomationUnavailable`。检查 `compshare-ssh-askpass` 是否和 `compshare` 一样位于 PATH；补齐官方虚拟环境自带入口后再试，不修改插件源码。

## 验收

生成结束后依次：

1. `h3-cloud status` 确认 `stopped`。
2. `ffprobe` 检查 MP4 的实际时长、尺寸、帧率、视频流和音频流。
3. 用 `ffmpeg` 抽取多个时间点拼成联系表，检查主体确实运动、身份和背景稳定、无明显畸变、无平台或 AI 水印。
4. 若需精确尺寸，使用本机转码另存新文件，保留模型原片。
5. 在聊天中用本地 MP4 绝对路径直接显示播放器并提供下载链接。
6. 参考视频核对 manifest 的 reference_video_filenames 非空、mode=reference-media-to-video，以及 workflow.json 的解码接线；上传成功与动作语义通过分开记录。报告 timings_ms 时说明 queue_and_generation 含排队和轮询，client_total 不含外层启动、缓存准备及关机。

status 的 missing/unconfigured 分别表示当前凭证范围内绑定缺失或未配置，不能据此宣称账号所有资源已清理。

## 每次生成后的删除询问

GPU 停止不代表所有费用归零。查询实例的 billing 和 disks，明确关机后仍计费的系统盘、数据盘或镜像项目及小时价格，然后主动询问：是否删除本次实例及关联磁盘。

用户明确确认后才执行：

```bash
compshare --profile minimax-h3 --json instance delete '<实例ID>' \
  --release-disk --yes --wait --timeout 600
```

删除前必须确认目标是本次 H3 实例、状态为 stopped、磁盘范围和本机成片已存在。删除后验证实例查询为空或实例列表不再包含该 ID；再把 `~/.config/minimax-h3-cloud/config.json` 中 `provider.resourceId` 精确清空。不得删除凭证、默认 GPU 选择、本地视频、提示词或测试项目。

如果用户选择保留，报告持续费率和平台自动释放时间，不重复追问。
