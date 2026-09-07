# H3 社区增强版

版本：0.2.1。公开版相对路径打包，新增先注册再安全接入的外层引导。基于 Sac-Y/MiniMax-H3-Cloud 的独立衍生插件，非 MiniMax 官方发布。H20 96GB 显存、240GB 系统内存的单参考视频方块平移案例已经完整出片、验收和关机。详见 VALIDATION.md。

## 运行要求与入口

需要 Node.js 22.17 或更新版本、ffprobe（运行）、ffmpeg（测试），以及已配置的 CompShare CLI（云端操作）。使用 `scripts/h3-cloud --help` 查看命令；包内运行 `npm test --prefix runtime` 执行本地回归，测试只使用本机模拟服务和临时媒体。

配置默认位于 `~/.config/h3-community-cloud/config.json`，结果位于 `~/.local/share/h3-community-cloud/outputs/`。原插件配置保留在原位置；需要复用时用 `--config` 明确选择。不要把本机密钥、资源 ID 或个人媒体加入发布包。

## 生成前预览

已有本地配置时，在实际生成命令上加 `--dry-run`：

```sh
./scripts/h3-cloud generate --config /绝对路径/配置.json --reference-video /绝对路径/参考.mp4 --aspect-ratio 16:9 --duration-seconds 5 --megapixels 0.2 --dry-run
```

此命令校验媒体和提示词，输出工作流及转发参数，不访问云端。输出中的本地路径仅用于预览；真实提交会使用云端上传后的路径。创建实例和生成之前仍需核对实时报价及本次费用授权。成功、失败后检查 GPU 停止；保留云盘可能持续计费，删除需明确授权。

## 本版本的改进

- 修复纯参考视频错误添加图片标签；拒绝引用不存在的素材。
- 上传使用文件支持的 Blob，避免提前把整个文件读入 Buffer 再复制到 Blob。
- 保存实际提交的 workflow.json，并记录上传、预检、提交、排队及生成、下载耗时。
- 原子更新 manifest，降低中断时任务记录损坏的风险。
- 实例缺失经过只读清单复核后返回 missing；认证和网络失败仍保留错误。
- 与原社区插件隔离配置和输出目录。

## 验证边界

本地测试通过不等于所有云端场景已验证。当前只有 H20 单参考视频方块平移案例通过完整 Ref2VA 验收；多视频、多图混合、复杂人物/车辆、长视频与完整 2K 三阶段流水线仍待实机验证。耗时字段 queue_and_generation 包含排队与轮询，不能用来声称纯 GPU 加速。文件支持的 Blob 优化上传准备内存，不代表网络更快或模型更快。

本包不包含模型权重。LICENSE、NOTICE、THIRD_PARTY_NOTICES.md 保留上游版权与模型声明。当前是本地可用插件包，尚未发布社区市场。
