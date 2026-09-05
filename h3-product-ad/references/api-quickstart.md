# MiniMax H3 API 操作速查（2026-09 核对）

官方文档：<https://platform.minimax.io/docs/api-reference/video-generation-v2-create>

## 1. 端点

- 创建任务：`POST https://api.minimax.io/v2/video_generation`（国际）/ `https://api.minimaxi.com/v2/video_generation`（国内）
- 查询任务：`GET https://api.minimax.io/v2/query/video_generation/{task_id}`（国内对应 api.minimaxi.com）
- 认证：`Authorization: Bearer <API_KEY>`；请求体 `application/json`；Key 在控制台「Account Management > API Keys」

## 2. 请求体核心参数

```json
{
  "model": "MiniMax-H3",
  "content": [
    { "type": "text", "text": "<prompt>" },
    { "type": "image_url", "image_url": { "url": "<url>" }, "role": "first_frame" }
  ],
  "resolution": "2K",
  "duration": 5,
  "ratio": "16:9"
}
```

### `model`

| 模型 | 支持模式 | 分辨率 | 时长 | 用途 |
|---|---|---|---|---|
| `MiniMax-H3` | T2VA / I2VA（首/中/尾帧）/ Ref2VA 全参考 | 768P、2K | 4–15s 整数 | 产品广告首选，需要 2K 或参考素材时用 |
| `MiniMax-H3-Max` | 仅 T2VA / I2VA（首/尾帧） | 480P、768P（不支持 2K） | 5–15s 整数 | 快速出草稿、无需参考素材时用 |

### `content` 数组（多模态输入）

- 每条按 `type` 区分：`text` / `image_url` / `video_url` / `audio_url`；每条请求必须包含**至少一个非空 `text` 项**（prompt 必填）。
- 角色 `role` 取值：`first_frame` / `last_frame` / `reference_image` / `reference_video` / `reference_audio`。
- 组合规则：
  - T2VA：仅 text。
  - I2VA 首帧：text + 1 个 `role=first_frame`（或省略 role）的图。
  - I2VA 尾帧：text + 1 个 `role=last_frame` 的图。
  - FL2VA：text + 2 张图，分别 `first_frame` 与 `last_frame`。
  - Ref2VA：text + 任意 `reference_image` / `reference_video` / `reference_audio` 组合。
- **首尾帧与全参考互斥**：content 里一旦出现 `reference_*` 角色，就不能出现 `first_frame`/`last_frame`，反之亦然。
- 请求体 ≤ 64 MB；大文件用公开 URL，避免 Base64。

### 素材硬限制

| 素材 | 限制 |
|---|---|
| 图片 | JPG/JPEG/PNG/WEBP/HEIC/HEIF；单文件 ≤ 30 MB；边长 [256, 5760] px；宽高比 0.4–2.5；首帧 ≤1、尾帧 ≤1、参考图 ≤9 |
| 视频 | MP4/MOV；H.264/H.265 + AAC/MP3 音频；单文件 ≤ 50 MB；≤3 段；每段 2–15s、总时长 ≤ 15s；边长与宽高比同上；帧率 [23.976, 60] |
| 音频 | WAV/MP3；单文件 ≤ 15 MB；≤3 段；每段 2–15s、总时长 ≤ 15s；不能单独作唯一输入，须配合图/视频 |
| 混合 | 所有类型文件总数 ≤ 12 |

### `resolution` / `duration` / `ratio`

- `resolution`：`480P` / `768P` / `2K`（按模型支持）。
- `duration`：整数秒，H3 为 4–15，H3-Max 为 5–15（4 秒不支持）。
- `ratio`：`adaptive`、`21:9`、`16:9`、`4:3`、`1:1`、`3:4`、`9:16`。
  - **T2VA：ratio 必填且不能用 `adaptive`**。
  - I2VA：比例由输入图决定，`ratio` 恒为 `adaptive`（传其他值会被忽略）。
  - Ref2VA：可选，默认 `adaptive`，也可显式指定。

## 3. 流程：创建 → 轮询 → 下载

1. `POST` 创建任务，返回 `task_id`。
2. `GET /v2/query/video_generation/{task_id}` 轮询，直到 `task.status == "succeeded"`。
3. 成功视频地址：`task.content.url`（下载 mp4）。

状态值：`queued`、`running`、`succeeded`、`failed`、`cancelled`。

可选 `callback` 参数：MiniMax 先发含 `challenge` 的验证请求，3 秒内原样返回 `challenge` 即完成验证；之后每次状态变化 POST 到该 URL，推送体与查询端点响应一致。

## 4. 常见错误

| HTTP | 错误 | 处理 |
|---|---|---|
| 400 | `content must include a non-empty text item (prompt is required) (2013)` | 补非空 text 项 |
| 401 | `login fail: Please carry the API secret key ... (1004)` | 检查 Authorization Bearer |
| 402 | `insufficient balance (1008)` | 账户余额不足 |
| 422 | `video description contains sensitive content (1026)` | 提示词触发安全审核，删敏感内容 |
| 429 | `rate limit, please retry later (1002)` | 限流，稍后重试 |

## 5. 产品广告参数建议

- 发布横屏平台（B站/视频号/抖音横版）：`16:9`；竖屏信息流（抖音/小红书/视频号竖版）：`9:16`。
- 默认 `MiniMax-H3` + `2K`；先用 `768P` 出草稿验收，终稿再 2K，省额度。
- 时长：产品展示 5–8s；带叙事 10–15s。
- 提示词写法详见 base-modes-guide.md 与 ref2va-guide.md。
