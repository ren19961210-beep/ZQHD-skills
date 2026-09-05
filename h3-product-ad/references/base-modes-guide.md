# 基础模式提示词规格蒸馏（T2VA / I2VA / FL2VA / L2VA）

来源：MiniMax H3 官方 `h3-prompt-writing` 技能 `references/base-en.txt`，已按产品广告场景蒸馏。字段名、段顺序、标签与时间写法必须严格保留官方格式。

## 1. 四种模式速判

| 模式 | 输入 | 产品广告典型用法 |
|---|---|---|
| T2VA | 仅文字 | 纯文案广告片、概念预告片 |
| I2VA | 文字 + 1 张首帧图 | 用产品主视觉/渲染图开头，往后展开动态 |
| FL2VA | 文字 + 首尾 2 张图 | 产品从「静态展示」到「使用场景/功能完成」的过渡 |
| L2VA | 文字 + 1 张尾帧图 | 结尾定格在 logo 板/产品特写，前面倒推过程 |

## 2. 最终提示词结构

### 2.1 第一部分：对齐指令（仅关键帧模式）

必须是提示词第一行，后面空一行再接核心字段：

- **I2VA**（首帧图即 0.00 秒画面）：
  ```text
  For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.
  ```
- **FL2VA**（两张图锚定首尾）：
  ```text
  How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot N) aligns with the S.SS-second mark of the target video.
  ```
- **L2VA**（一张图锚定结尾，S.SS 为实际视频时长、两位小数）：
  ```text
  How the reference pictures align with the target video — <Picture 1> (from [Shot N]) aligns with the S.SS-second mark of the target video.
  ```

T2VA 没有对齐指令，直接从核心字段开始。

### 2.2 第二部分：三个核心字段（顺序固定）

```text
integrated_multimodal_description: [Shot 1] ...

overall_soundscape: ...

non_diegetic_music: ...
```

- `integrated_multimodal_description`：沿时间线写视觉、动作、镜头、说话人、台词、画面内声音。产品广告的主战场。
- `overall_soundscape`：1–4 句英文段落，汇总全片环境音与物理动作声（风声、脚步、开关门、机械声、轮胎声）。台词/演唱/画面内音乐不在此重复。全静音才写 `N/A`。
- `non_diegetic_music`：1–3 句英文，写观众才能听到的配乐：乐器、速度、节奏、动态起伏。禁止抽象情绪词（如"cinematic""beautiful"）。无配乐写 `N/A`。

## 3. 镜头与分镜（产品广告核心）

### 3.1 镜头编号与时间戳

- `[Shot 1]` 开头镜头**不写时间戳**，先写风格与初始构图：
  ```text
  [Shot 1] Live-action, cinematic, a medium-wide shot frames ...
  ```
- 后续镜头：`[Shot 2] At 00:03.500, the camera cuts to ...`，时间戳严格递增且落在视频时长内。
- 常用风格词：`Cinematic`、`live-action`、`3D CG`、`claymation`、`vintage film`、`product commercial`、`studio lighting`。

### 3.2 运镜三要素：类型 + 幅度 + 速度

| 维度 | 可用表达 |
|---|---|
| 类型 | `Zoom In/Out`（变焦不动机身）、`Push In/Pull Out`（机身进退）、`Pan Left/Right`（原地转镜）、`Truck Left/Right`（横移）、`Tilt Up/Down`（俯仰）、`Pedestal Up/Down`（升降）、`Arc Shot`（环绕）、`Tracking Shot`（跟拍）、`Static Shot`（静止）、`Shake Slightly/Strongly`（晃动）、`POV`（主观）、`Roll Clockwise/Counterclockwise`（滚转） |
| 幅度 | `with small amplitude` / `with large amplitude`（中等通常省略） |
| 速度 | `at slow speed` / `at fast speed`（正常通常省略） |

运镜写成自然英文动作，不要堆标签：
```text
The camera arcs around the vehicle with large amplitude at slow speed, revealing the full body line.
The camera pushes in with small amplitude at slow speed toward the glowing logo.
```

### 3.3 切镜规则

- 用 `the camera cuts to`、`the shot cuts to`、`the shot transitions to`、`the shot changes to`、`the shot switches to`。
- 只有距离或角度微变时，优先运镜而不是切镜。
- 一个镜头尽量一个主要动作 + 一个主要运镜。

## 4. 说话人、台词与屏幕文字

### 4.1 说话人 ID

- 发声者用稳定 ID `(S1)`、`(S2)`，跨镜头不换；多人同时发声用 `(S1,S2)`；不发声的角色不给 ID。
- 首次出现时给足辨识信息（角色类型、年龄、是否入画、音色、语速等）。
- 身份描述与动作放在 `<d>` 外；`<d>` 内只放语言标签 + 原文字：
  ```text
  The narrator with a calm, resonant voice (S1) says in an off-screen voiceover: <d>[Chinese] 新一代纯电旗舰，从这里出发。</d> while his lips remain completely closed.
  ```
- 旁白用固定句式 `says in an off-screen voiceover`，且必须在 `<d>` 后补一句"嘴部完全闭合"。
- 台词跨切镜：两端都用 `<scenetrans>` 并说明声音跨切持续；片尾被截断用 `<cutoff>`。

### 4.2 屏幕文字（产品广告最常见翻车点）

凡画面上真实可见的文字（logo、车名、口号、尾板、字幕），一律用英文双引号括起，**保留原文逐字**：
```text
A red neon sign reading "蔚来" glows above the showroom entrance.
The tail plate shows "换电，比加油更快" in bold white letters.
```

## 5. 产品广告时间线写法（T2VA 示例骨架）

```text
integrated_multimodal_description: [Shot 1] Live-action, cinematic product commercial, a wide shot frames the vehicle in a minimalist studio with soft gradient lighting. The camera arcs around the car with large amplitude at slow speed, revealing its silhouette and paint finish. [Shot 2] At 00:03.500, the camera cuts to a close-up of the headlamp as it lights up, the beam cutting cleanly through the air without any haze. [Shot 3] At 00:06.000, the shot cuts to the interior, the camera trucks right with small amplitude at slow speed past the dashboard as the display reads "欢迎回家". [Shot 4] At 00:09.000, the camera cuts to a tracking shot following the car driving along a coastal road at golden hour. [Shot 5] At 00:12.500, the shot cuts to a static shot of the vehicle turning slightly, the sunlight glinting off the body, before the final frame holds on the word "NIO" centered on screen.

overall_soundscape: A quiet studio room tone gives way to the low electric hum of the powertrain, wind rushing past the side mirrors during the drive, and the soft click of the door closing.

non_diegetic_music: A minimal piano motif at a slow tempo joined by sustained strings, building gently until the final logo reveal, then fading out.
```

## 6. 关键帧模式的正文写法

- **I2VA**：先立住首帧里的风格、主体、构图、场景锚点，再写后续动作。结构：**首帧锚点 → 动作起始 → 连续发展 → 结果/反应**。
- **FL2VA**：不要复述两张静态图，写中间的运动路径。结构：**首帧状态 → 可见中间变化 → 差异逐步收窄 → 尾帧状态**。默认单镜头。
- **L2VA**：推断一个合理的前序状态，再逐步收敛到尾帧。结构：**合理前序 → 明确动作与转场路径 → 尾段渐进靠拢 → 尾帧落地**。

### 6.1 I2VA 产品广告示例（首帧=产品渲染图）

```text
For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.

integrated_multimodal_description: [Shot 1] Live-action, cinematic product commercial, the vehicle shown in <Picture 1> remains centered with its exact color, body line, and showroom lighting preserved. The camera pushes in with small amplitude at slow speed as the headlights ignite one by one, their clean beams cutting through the air with no haze. The scene develops as the showroom doors open behind the car, revealing a sunlit coastal road ahead, and the car begins to roll forward smoothly.

overall_soundscape: Showroom air-conditioning hum gives way to the low electric whir of the motors as the car starts moving, then the sound of tires rolling onto asphalt.

non_diegetic_music: A rising synth pad at a moderate tempo, joined by a soft percussion pulse, ending on a resolved chord.
```

### 6.2 FL2VA 产品广告示例（首帧=外观，尾帧=功能完成）

```text
How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot 1) aligns with the 8.00-second mark of the target video.

integrated_multimodal_description: [Shot 1] Live-action, cinematic product commercial, the vehicle begins in the position and framing established by Picture 1, parked beside a charging station. The camera holds a static shot as the charging connector is lifted and inserted, a soft blue ring lighting up around the port with no sparks or smoke. The display inside shows the battery level rising from 20% to 80%, and the car settles into the pose, spacing, and composition established by Picture 2 at the end of the shot.

overall_soundscape: Low ambient hum of the charging station, the soft click of the connector locking in, and a gentle beep when charging completes.

non_diegetic_music: N/A
```

## 7. 时长匹配铁律

- 总描述的时间线必须贴住请求时长（4–15 秒整数），不能写到时长之外。
- 画面文字、台词时长与镜头匹配；长台词要预留够拍摄时间。
