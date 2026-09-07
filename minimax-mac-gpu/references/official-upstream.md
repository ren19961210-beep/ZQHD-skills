# MiniMax H3 官方上游校准

最后校准：2026-09-07

本 Skill 的官方能力基准是：

- 官方仓库：<https://github.com/MiniMax-AI/MiniMax-H3>
- 官方提示词 Skill：<https://github.com/MiniMax-AI/MiniMax-H3/tree/main/skills/h3-prompt-writing>
- 官方 H3 CLI Skill：<https://github.com/MiniMax-AI/cli/tree/main/skill/h3-video>

官方模型的 Ref2VA 输入限制：最多 9 张图片、3 段参考视频、3 段参考音频；每段视频/音频为 2–15 秒，视频/音频总时长不超过 15 秒，混合输入最多 12 个文件。官方 H3 支持原生音频和最高 2K 输出，但完整 2K 需要 Context-IR、Base 与 Regenerate-2K 阶段。

## 与当前 CompShare 插件的分层

本包使用社区衍生运行器 `h3-community-cloud 0.2.0`，H20 单参考视频方块平移案例已实测通过。原社区 `minimax-h3-cloud 0.1.0` 只作为显式回退，不具备相同视频输入能力。每次使用前核对实际解析版本、`generate --help` 和上传记录；官方模型能力不等于当前运行器的全部已验证能力。

## 更新规则

每次生成前：

1. 查看官方 H3 仓库当前能力和限制是否变化；
2. 查看本机插件版本、`generate --help` 和 Runtime Profile；
3. 把“官方能力”“当前插件声明”“本次实测验证”分三层写清楚；
4. 只有三层一致时，才把新的输入类型纳入付费生成流程。
