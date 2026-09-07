# MiniMax H3 通用提示词流程

本流程融入用户指定的 [h3-prompt-writing](https://github.com/ren19961210-beep/ZQHD-skills/tree/main/h3-prompt-writing)，只负责云端执行前的提示词生成。它不得查询 GPU、计算费用、创建或启动实例、提交生成任务、下载视频或清理资源。完整提示词规则已随本 Skill 保存：

- T2VA / I2VA / FL2VA / L2VA：[prompt-writing/base-en.txt](prompt-writing/base-en.txt)
- Ref2VA：[prompt-writing/ref-en.txt](prompt-writing/ref-en.txt)

## 先判断模式

- T2VA：只有文字，从零建立完整声画时间线。
- I2VA：首帧图作为 0.00 秒画面，从该构图向后发展。
- FL2VA：首尾两张图，描述可见、连续的中间运动路径。
- L2VA：尾帧图，推导合理前序并逐渐收敛到该画面。
- Ref2VA：参考图用于人物、主体、场景、动作或风格一致性，不要求成为首尾帧。

增强版提供文生视频、首帧、尾帧、首尾帧、1–9 张参考图和 1–3 段参考视频输入；上传接线与成片语义分别验收。参考音频输入未实现。执行以实际解析版本和本地预览为准；回退旧版时不能继续传视频参数。

## 基础模式固定结构

I2VA、FL2VA、L2VA 先写对应的关键帧对齐指令；T2VA 不写。随后字段顺序固定：

```text
integrated_multimodal_description: [Shot 1] ...

overall_soundscape: ...

non_diegetic_music: ...
```

提示词主体遵循源 Skill 的英文格式；台词、歌词和画面内文字保留用户原文语言。与用户沟通、模式说明和参数说明仍使用中文。用户明确要求中文提示词正文时服从用户要求，但保留字段名、标签、镜头编号和时间格式。

## 时间线与镜头

- `[Shot 1]` 不写时间戳，先建立风格、构图、人物或主体、场景和光线。
- 后续镜头使用严格递增且落在视频时长内的 `[Shot N] At MM:SS.mmm, ...`。
- 每个镜头写清景别、主体位置、动作、状态变化、运镜和同步声音。
- 运镜用“类型 + 必要时的幅度 + 必要时的速度”，写成自然句子；微小视角变化优先运镜而非切镜。
- 总时间线必须贴合请求时长，不能在结束时间之后继续写动作或台词。

## 台词、文字与声音

- 发声者按实际首次发声顺序使用稳定 `(S1)`、`(S2)`；不发声者不编号。
- 台词只写在 `<d>[语言] 原文</d>` 内，逐字保留。旁白使用 `says in an off-screen voiceover`，并说明画面人物嘴唇保持闭合。
- 可见文字用英文双引号包裹，保留原文和标点。
- `overall_soundscape` 只汇总环境声、物理动作声和非语言人声；全静音才写 `N/A`。
- `non_diegetic_music` 写观众才能听到的配乐，包含乐器、速度、节奏和动态；无配乐写 `N/A`。

## Ref2VA 固定六段

Ref2VA 必须按以下顺序输出：

1. `subject_definitions`
2. `summary`
3. `retention_analysis`
4. `detailed_description`
5. `overall_soundscape`
6. `non_diegetic_music`

参考标签 `<Subject N>`、`<Picture N>`、`<Video N>`、`<Audio N>` 一经定义，在六段中含义保持一致。增强版按实际素材顺序处理 `<Picture N>` 和 `<Video N>`；纯视频任务不添加没有对应图片的 Picture 标签。默认不复用视频原音轨，不凭空定义 Audio 标签。

`retention_analysis` 的可见内容关系只用 `fully_preserved`、`partially_preserved`、`attribute_transfer`、`weak_reference`。不要把剧情新增内容误判为参考保真度损失。

## 交给云端生成前检查

- 模式与实际输入参数一致。
- 人物身份、产品特征、服装、颜色、材质、Logo 和空间关系都有明确锚点。
- 动作可见、连续且能在目标时长完成。
- 背景稳定、禁止项明确，但不要堆砌互相矛盾的要求。
- 所有时间戳、参考标签、发声者编号和原文文字一致。
- 将最终提示词写入 UTF-8 临时文件并结束前期阶段。后期阶段重新读取用户确认的画幅、时长、清晰度和素材映射，再进入 `generate-and-cleanup.md` 的费用确认与生成流程。

## 用户修改机会

首次输出必须是完整的 MiniMax H3 格式，不能只输出提纲或简化版。输出后给用户一次集中修改机会：用户可以一次性提出对剧情、镜头、动作、主体一致性、声音、配乐或参数建议。收到修改后，按本文件对应模式重新生成完整提示词，并保留所有必需字段与素材标签；不要只返回局部替换片段。

第 2 版视为提示词定稿候选。提示词是否进入付费流程仍需用户明确确认；如果用户继续提出重大方向变化，应重新判断模式和素材，并重新完成审查，而不是无限叠加修改。
