# ZQHD Skills

这里提供两套彼此独立的中文视频 Skill：

- seedance-20：Seedance 2.0 的多模态参考、首尾帧、汽车外观/内饰一致性、镜头和连续分镜。
- seedance-25：Seedance 2.5 的长叙事、延长、时间戳编辑、绿幕、白模/黏土参考和汽车时间轴。
- h3-prompt-writing：MiniMax H3 的 T2VA/I2VA/FL2VA/L2VA/Ref2VA 通用提示词编排。
- h3-product-ad：MiniMax H3 汽车与新能源产品广告专用提示词和调用参数。

两套 Skill 不混用版本参数。文档中的官方能力、社区工作法和当前平台待核对项已分开标注。

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

## 使用

直接告诉助手：

- “使用 Seedance 2.0 Skill，帮我写……”
- “使用 Seedance 2.5 Skill，帮我做延长/编辑……”
- “使用 MiniMax H3 Skill，帮我写视频提示词……”
- “使用 H3 产品广告 Skill，帮我写汽车广告视频……”

实际生成前仍需以当前即梦、豆包、火山引擎、BytePlus、LibTV 等平台显示的模型、权限和参数为准。

## 来源说明

官方资料只用于确认模型能力；Emily2040、LeonSooLab、jeurtr 等仓库属于社区来源；ByteDance AgentKit 中的 Seedance 文件是官方组织仓库里的特定广告复刻示例，不是通用官方导演手册。
