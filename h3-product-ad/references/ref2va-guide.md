# 全参考模式（Ref2VA）提示词规格蒸馏

来源：MiniMax H3 官方 `h3-prompt-writing` 技能 `references/ref-en.txt`，已按产品广告场景蒸馏。六段顺序、标签规则、保留标记为官方固定格式，不得改动。

## 1. 六段结构（顺序固定）

| 段 | 作用 |
|---|---|
| `subject_definitions` | 定义每个参考素材与其标签 |
| `summary` | 一段话概括任务类型、目标视频与主要参考关系 |
| `retention_analysis` | 逐条说明参考内容如何保留/转移/复用 |
| `detailed_description` | 按播放顺序逐镜头写画面、动作、声音、台词 |
| `overall_soundscape` | 环境音与物理声汇总 |
| `non_diegetic_music` | 观众专属配乐 |

## 2. 参考标签规则

| 标签 | 含义 | 产品广告用法 |
|---|---|---|
| `<Subject N>` | 从参考素材中抽象出的可复用可见内容（人物/车/场景/道具/风格/动作） | 品牌车主体、产品、代言人、场景 |
| `<Picture N>` | 作为具体帧锚点的参考图（首帧/尾帧/关键帧/分镜） | 产品渲染图、尾板构图 |
| `<Video N>` | 提供剪辑源、续写起点或整体时间结构的参考视频 | 成片参考、镜头节奏参照 |
| `<Audio N>` | 被复制或参考的音频（配乐/音色/台词/节奏） | 品牌 TVC 配乐、代言人音色 |

关键规则：

- 标签一旦分配，在六段中含义保持一致。
- `<Subject N>` 是「内容单元」而非源文件；一个主体可来自多个素材，一个素材可提供多个主体：
  ```text
  <Subject 1> is the vehicle whose exterior comes from <Picture 1> and whose driving motion comes from <Video 1>.
  ```
- 图只用于定义角色/场景/配色时，不单独立 `<Picture N>`，在对应 `<Subject N>` 里引用来源即可。
- `<Video N>` 只管整片级关系（剪辑原片、续写、节奏结构）；复用其中的人/物/动作仍归 `<Subject N>`。
- `<Audio N>` 与 `<Video N>` 编号互相独立，同源不要求同编号。

## 3. `summary` 任务类型前缀

用方括号任务类型开头，多类型用 ` + ` 连接：

```text
[reference generation] ...
[video editing + audio reuse] ...
[keyframe completion] ...
```

常见类型：`keyframe completion`（图作帧锚点）、`reference generation`（提供生成指导）、`video editing`（直接改原片）、`video continuation`（续写原片）、`audio reuse`（原样复用音频）、`audio reference`（只参考风格/音色）。

## 4. `retention_analysis` 关系标记（固定英文值）

可见内容：

| 标记 | 含义 |
|---|---|
| `fully_preserved` | 完全保留 |
| `partially_preserved` | 部分保留/改了部分特征 |
| `attribute_transfer` | 特征转移到另一目标 |
| `weak_reference` | 只保留大类相似 |

音频：

| 标记 | 含义 |
|---|---|
| `fully_copy` | 完整复制为最终音轨 |
| `partially_copy` | 部分复制/复制后增删改 |
| `reference` | 只参考音色/节奏/风格 |
| `weak_reference` | 只保留氛围相似 |

每条一行，格式：
```text
<Subject 1> (appears in [Shot 1], [Shot 3]): fully_preserved - the vehicle keeps its exact color, body line, and logo.
<Audio 1>: reference - the target narrator follows <Audio 1>'s warm voice timbre without copying the original signal.
```

## 5. `detailed_description` 写法

- 正文用英文，台词/歌词/画面文字保留原语言。
- 产品广告通常 350–500 英文词；台词密集时优先完整台词语境。
- 开头先 1–2 句英文确立整体风格，再 `[Shot 1]` 开写：
  ```text
  The target video is in a cinematic, automotive-commercial style with soft studio lighting and a slightly desaturated palette.
  [Shot 1] A medium shot establishes <Subject 1>, the vehicle in its exact paint finish ...
  ```
- 标签在首次清晰出现处插入，之后沿用不再重定义。帧锚点用自然短语：`the shot begins from <Picture 1>`、`the shot ends on <Picture 2>`。
- 参考主体说话时：`<Subject 2> (S1) says ...`；纯复用原声带里的语音提示，不造 `(Sx)`。
- 台词标准：`<d>[语言] 原文</d>`，结尾用 `.`/`?`/`!`，删掉多余波浪号/emoji/重复标点；听不清写 `[unclear]`，不猜不改写。

## 6. 声音两段与参考音频

- 环境音/音效 → `overall_soundscape`；观众专属配乐 → `non_diegetic_music`。
- 参考音频的复制/参考关系，写在对应的可听层段落里：
  ```text
  overall_soundscape: The copied ambience layer from <Audio 1> continues throughout the target video.
  non_diegetic_music: <Audio 2> is directly reused as the complete audience-only score.
  ```
- 台词/歌词只在 `detailed_description` 的 `<d>` 里写全，不在这两段重复。

## 7. 产品广告 Ref2VA 迷你示例

```text
subject_definitions:
<Subject 1> is the electric SUV in <Picture 1>, with its exact midnight-blue paint, angular body line, and thin LED light strip.
<Audio 1> is the voice-timbre reference for the narrator (S1), a warm female voice.

summary:
[reference generation + audio reference] The target video is a product commercial showing <Subject 1> moving through three showcase scenes, using <Audio 1> as the narrator's voice-timbre reference.

retention_analysis:
<Subject 1> (appears in [Shot 1], [Shot 2], [Shot 3]): fully_preserved - the SUV keeps its exact paint, body line, and LED strip in every shot.
<Audio 1>: reference - the narrator follows <Audio 1>'s warm voice timbre without copying the original signal.

detailed_description:
The target video is in a cinematic automotive-commercial style with clean studio lighting.
[Shot 1] A wide shot establishes <Subject 1>, the midnight-blue electric SUV, on a rotating studio turntable. The camera arcs around it with large amplitude at slow speed. The warm female narrator (S1) says in an off-screen voiceover: <d>[Chinese] 静谧，是一种力量。</d> while no lips are visible on screen.
[Shot 2] At 00:04.000, the camera cuts to a close-up of the LED light strip as it illuminates cleanly, with no haze. [Shot 3] At 00:07.000, the shot cuts to a tracking shot of the SUV driving along a mountain road at dusk, ending on a static frame with the word "NIO" centered on screen.

overall_soundscape:
Quiet studio room tone, the low electric hum of the drivetrain, and wind rushing past the mirrors during the drive.

non_diegetic_music:
A restrained orchestral score at a slow tempo, swelling gently toward the logo reveal, then fading out.
```
