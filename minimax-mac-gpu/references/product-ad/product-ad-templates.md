# 产品广告提示词模板库

模板覆盖四种主流场景，字段名与格式已按官方规格整理。使用时把 `[...]` 替换成实际内容，遵守各指南里的红线（新能源无烟火、文字原文、台词原文）。

## 模板 A：T2VA 纯文案汽车广告（10s，16:9）

```text
integrated_multimodal_description: [Shot 1] Live-action, cinematic product commercial, a wide shot frames [车型] on a minimalist studio turntable with soft gradient lighting. The camera arcs around the vehicle with large amplitude at slow speed, revealing its [外观特征：颜色/线条/比例]. [Shot 2] At 00:03.000, the camera cuts to a close-up of [卖点1：例如 LED 灯组] as it lights up cleanly, with no haze or flicker. [Shot 3] At 00:06.000, the shot cuts to a close-up of [卖点2：例如内饰/中控屏]，the display reading "[屏幕文字原文]". [Shot 4] At 00:08.000, the camera cuts to a static wide shot of the vehicle as the lighting dims and the word "[品牌/Logo 原文]" appears centered on screen.

overall_soundscape: Quiet studio room tone, the low electric hum of the drivetrain, and soft mechanical clicks as [细节动作声].

non_diegetic_music: A minimal piano motif at a slow tempo joined by sustained strings, building gently toward the logo reveal, then fading out.
```

## 模板 B：I2VA 首帧产品渲染图广告（8s）

首帧图 = 产品官方渲染图/主视觉。

```text
For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.

integrated_multimodal_description: [Shot 1] Live-action, cinematic product commercial, the [产品] shown in <Picture 1> remains centered with its exact [颜色/材质/构图] preserved. The camera [运镜] as [卖点1 动作化，例如车灯依次亮起，光柱干净无烟]. [持续发展：场景变化，例如背景幕布拉开露出城市天际线]. [结果/反应：例如车辆缓缓向前驶出].

overall_soundscape: [环境声，如展厅空调声 → 电机声 → 轮胎压地声].

non_diegetic_music: [配乐：乐器+速度+起伏，如渐进合成器音垫].
```

## 模板 C：FL2VA 首尾帧广告（首帧=静态展示，尾帧=功能完成/使用场景）

```text
How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot 1) aligns with the [S.SS]-second mark of the target video.

integrated_multimodal_description: [Shot 1] Live-action, cinematic product commercial, the [产品] begins in the position and framing established by Picture 1, [起始状态]. The camera [运镜] as [中间变化：动作、对象状态、构图演变]. [功能完成/场景落地，干净无烟火]. The [产品] settles into the pose, spacing, and composition established by Picture 2 at the end of the shot.

overall_soundscape: [过程声音：插入/启动/完成提示音].

non_diegetic_music: N/A 或 [配乐描述].
```

## 模板 D：Ref2VA 全参考广告（有参考视频/音频/图）

```text
subject_definitions:
<Subject 1> is the [产品/主体] in <Picture 1>, with its exact [外观特征].
<Video 1> is the source video for the target commercial's [节奏/运镜/结构].
<Audio 1> is the voice-timbre reference for the narrator (S1), [音色描述].

summary:
[reference generation + audio reference] The target video is a product commercial showing <Subject 1> through [场景概览], using <Audio 1> as the narrator's voice-timbre reference.

retention_analysis:
<Subject 1> (appears in [Shot 1], [Shot 2]): fully_preserved - the [产品] keeps its exact [特征] in every shot.
<Video 1> (shot rhythm): weak_reference - the commercial follows <Video 1>'s pacing without copying its footage.
<Audio 1>: reference - the narrator follows <Audio 1>'s warm voice timbre without copying the original signal.

detailed_description:
The target video is in a cinematic [行业/品牌] commercial style with [光线/调色].
[Shot 1] A [景别] shot establishes <Subject 1>, the [产品全称]，[位置与动作]. The narrator (S1) says in an off-screen voiceover: <d>[语言] [台词原文]。</d> while no lips are visible on screen. [Shot 2] At [MM:SS.mmm], the camera cuts to [镜头2内容]. [Shot 3] At [MM:SS.mmm], the shot ends on [尾板/Logo 呈现，屏幕文字用双引号原文].

overall_soundscape:
[环境声与物理声汇总].

non_diegetic_music:
[配乐：乐器+速度+起伏；无则 N/A].
```

## 快速替换清单

写之前先确定：

1. 车型/产品全称与型号（唯一称谓，全文一致）
2. 三个最核心卖点，按重要性排序（视觉化：灯、线条、屏、加速、空间…）
3. 外观锚点：颜色、材质、线条、logo 位置（每拍保持）
4. 屏幕文字/台词原文（不翻译）
5. 时长与比例（决定几拍、每拍几秒）
6. 发布平台（横屏 16:9 / 竖屏 9:16）
