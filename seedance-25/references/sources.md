# Seedance 2.5 来源登记

核对日期：2026-09-03。动态参数和账号权限再次使用前仍需刷新。

## 官方

- [Seedance 2.5 官方发布文](https://seed.bytedance.com/en/blog/one-take-creation-flexible-referencing-introducing-seedance-2-5)：发布日期 2026-07-31；确认单次最长 30 秒、多轮延长、最多 30 图/10 视频/10 音频、时间戳级编辑、绿幕、摄像机视角、参考编辑、白模/黏土空间参考。
- [Seedance 2.5 官方模型页](https://seed.bytedance.com/zh/seedance2_5)：官方模型入口；本次中文页抓取超时，以官方发布文交叉核对，不凭超时页面补写内容。
- [Seedance 2.0 官方模型页](https://seed.bytedance.com/zh/seedance2_0)：仅用于理解共同的多模态音视频架构；不把 2.0 参数带入本 Skill。
- [即梦 AI 官方入口](https://jimeng.jianying.com/)：执行入口；当前可见功能、模型权限和参数以登录后的实际界面为准。

## 社区

- [LeonSooLab/seedance-2.5](https://github.com/LeonSooLab/seedance-2.5)：社区项目，仓库明确说明不是 ByteDance、即梦或 Dreamina 官方产品；吸收 2.5 的长叙事、延长、编辑、时间线和参考角色组织，不直接继承社区参数表。
- [Emily2040/seedance-2.0](https://github.com/Emily2040/seedance-2.0)：社区 2.0 Skill；只吸收导演意图、镜头合同、连续性状态、失败诊断和来源纪律，不将其 2.0 数字或平台表用于 2.5。
- [jeurtr/seedance-skill](https://github.com/jeurtr/seedance-skill)：社区合并版；吸收统一提示词骨架和故障排查，但该仓库混合多平台参数，不能照表执行。
- [ByteDance/agentkit-samples 的 Seedance 广告复刻 Skill](https://github.com/bytedance/agentkit-samples/blob/main/skills/byted-bp-seedance-viral-creative-rewrite-skill/SKILL.md)：ByteDance 官方组织仓库中的特定广告模板复刻示例，不是 2.5 通用手册；吸收模板结构与产品真相分离、brief 确认门和生成后检查。

## 平台边界

官方发布文的能力不等于所有接入面都开放。当前平台的比例、清晰度、时长下限、音频开关、延长/编辑入口、价格、区域和模型 ID必须当次核对。若使用 LibTV，先读取 `libtv-cli` 并查询当前 schema；本地曾验证的 `star-video2.5` 只能作为本地适配结果，不是通用官方模型 ID。本文件不保存密钥或 Cookie。
