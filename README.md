# ZQHD Skills

这里提供彼此独立的中文视频 Skill：

- seedance-20：Seedance 2.0 的多模态参考、首尾帧、汽车外观/内饰一致性、镜头和连续分镜。
- seedance-25：Seedance 2.5 的长叙事、延长、时间戳编辑、绿幕、白模/黏土参考和汽车时间轴。
- h3-prompt-writing：MiniMax H3 的 T2VA/I2VA/FL2VA/L2VA/Ref2VA 通用提示词编排。
- h3-product-ad：MiniMax H3 汽车与新能源产品广告专用提示词和调用参数。
- [minimax-mac-gpu](minimax-mac-gpu/)：在 Mac 上通过优云 H20/A800 运行 H3，包含注册接入引导、参考视频上传、本地预览、报价确认、恢复下载和自动关机；随目录附带 h3-community-cloud 0.2.1 运行器。

不同 Skill 不混用版本参数。文档中的官方能力、社区工作法和当前平台待核对项已分开标注。

## 安装到 Codex

先下载本仓库：

~~~bash
git clone https://github.com/ren19961210-beep/ZQHD-skills.git
~~~

然后将需要的整个目录复制到 Codex 的 Skill 目录：

~~~bash
mkdir -p ~/.codex/skills/seedance-20
cp -R ZQHD-skills/seedance-20/. ~/.codex/skills/seedance-20/

mkdir -p ~/.codex/skills/seedance-25
cp -R ZQHD-skills/seedance-25/. ~/.codex/skills/seedance-25/

mkdir -p ~/.codex/skills/h3-prompt-writing
cp -R ZQHD-skills/h3-prompt-writing/. ~/.codex/skills/h3-prompt-writing/

mkdir -p ~/.codex/skills/h3-product-ad
cp -R ZQHD-skills/h3-product-ad/. ~/.codex/skills/h3-product-ad/
~~~

如果使用 Claude Code，把目标目录改为 ~/.claude/skills/ 即可。

### 安装 H3 云端运行 Skill

复制整个 `minimax-mac-gpu` 文件夹（包括 references、scripts 和 runtime），不要只复制 SKILL.md。目标目录已经存在时，先自行备份再更新。

~~~bash
cp -R ZQHD-skills/minimax-mac-gpu ~/.codex/skills/
~/.codex/skills/minimax-mac-gpu/scripts/resolve-plugin.sh
~~~

依赖 Node.js 22.17+、FFmpeg/ffprobe、OpenSSH 和官方 CompShare CLI。根据 Skill 中的 setup.md，在自己的电脑通过 CLI 隐藏输入配置自己的云平台 API Key；不要把密钥发给助手或写进仓库。发布包没有 API Key、云平台凭证、私人实例绑定、生成日志或模型权重。模型使用仍需遵守相应许可证，实际云端运行会产生费用，创建前必须确认最新报价。

H20 单参考视频的简单方块动作案例已经实测通过；复杂人物/车辆、多视频混合和完整 2K 未作已验证承诺。

首次对助手说“使用 minimax-mac-gpu，帮我接入云 GPU”。Skill 会先引导你[注册优云智算](https://console.compshare.cn/)，再检查环境、引导本人在终端隐藏输入凭证，并由助手验证接通；完成接入后才进入素材、提示词、选卡和付费确认。已有账号和凭证可直接复核。

~~~bash
npm test --prefix ~/.codex/skills/minimax-mac-gpu/runtime/h3-community-cloud/runtime
~~~

## 使用

直接告诉助手：

- “使用 Seedance 2.0 Skill，帮我写……”
- “使用 Seedance 2.5 Skill，帮我做延长/编辑……”
- “使用 MiniMax H3 Skill，帮我写视频提示词……”
- “使用 H3 产品广告 Skill，帮我写汽车广告视频……”
- “使用 minimax-mac-gpu，检查我的参考视频并准备 H20 生成方案。”

实际生成前仍需以当前即梦、豆包、火山引擎、BytePlus、LibTV 等平台显示的模型、权限和参数为准。

## 来源说明

官方资料只用于确认模型能力；Emily2040、LeonSooLab、jeurtr 等仓库属于社区来源；ByteDance AgentKit 中的 Seedance 文件是官方组织仓库里的特定广告复刻示例，不是通用官方导演手册。
