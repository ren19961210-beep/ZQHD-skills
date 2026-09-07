# 第三方许可说明

本候选版是 Sac-Y/MiniMax-H3-Cloud 0.1.0 的社区衍生版本，标识为 h3-community-cloud；不代表 MiniMax 或 Sac-Y 官方发布。原始 MIT 许可证及版权声明完整保留在 LICENSE 中，本项目新增编排代码采用相同 MIT 许可证。原项目来源：https://github.com/Sac-Y/MiniMax-H3-Cloud 。模型权重与模型许可证不随插件改名而改变。

本仓库的 MIT 许可证只覆盖 Sac-Y 编写的插件与编排代码。以下模型、模板、工具和云服务不随本仓库重新授权。

## MiniMax H3

- 上游：[MiniMaxAI/MiniMax-H3](https://huggingface.co/MiniMaxAI/MiniMax-H3)
- 许可证：[MiniMax H3 Community License Agreement](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/LICENSE)
- 本仓库不包含、复制或分发 MiniMax H3 模型权重。
- 用户和 Runtime 提供方必须分别确保模型访问、运行、输出和服务方式符合该协议，包括其适用地域和可接受使用限制。

MiniMax 要求的模型声明：

> MiniMax H3 is licensed under the MiniMax H3 Community License Agreement, Copyright © 2026 MiniMax. All Rights Reserved.

## MiniMax H3 Turbo

- 上游：[ModelTC/Minimax-H3-Turbo](https://github.com/ModelTC/Minimax-H3-Turbo)
- 模型仓库：[lightx2v/Minimax-h3-Turbo](https://huggingface.co/lightx2v/Minimax-h3-Turbo)
- 上游标注为 Apache-2.0；本仓库不包含其模型权重。
- Turbo LoRA 基于 MiniMax H3，使用时仍需同时检查基础模型许可。

## Comfy Org 工作流模板

本仓库中的 API 工作流由 Comfy Org 的 MiniMax H3 工作流模板改造而来：

- 上游：[Comfy-Org/workflow_templates](https://github.com/Comfy-Org/workflow_templates)
- 许可证：MIT

```text
MIT License

Copyright (c) 2023-present Comfy Org

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## ComfyUI、CompShare CLI 与优云智算

- ComfyUI、平台官方镜像和镜像中预装的软件不包含在本仓库内，分别遵循各自许可证。
- CompShare CLI 不包含在本仓库内，用户独立安装并遵循其 Apache-2.0 许可证。
- 优云智算账号、API 与 GPU 资源受平台服务条款和计费规则约束。
