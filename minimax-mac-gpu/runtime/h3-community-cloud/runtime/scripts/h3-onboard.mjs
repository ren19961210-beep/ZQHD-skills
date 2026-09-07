#!/usr/bin/env node

import { parseArgs } from "node:util";
import {
  createUserConfig,
  platformCatalog,
  resourceOptions,
  supportedPlatforms,
  writeUserConfig,
} from "../src/onboarding.mjs";
import { CompShareProvider } from "../src/providers/compshare-provider.mjs";
import {
  attachLivePrices,
  scanAvailableSingleGpuResources,
} from "../src/resource-catalog.mjs";
import { defaultConfigPath } from "../src/user-paths.mjs";

function usage() {
  console.log(`用法：
  h3-onboard platforms
  h3-onboard options --platform <平台> [--credential-profile <本机凭证名称>] [--all]
  h3-onboard init --platform <平台> \\
    --resource-option <配置ID> --credential-profile <本机凭证名称> \\
    [--config <隔离配置路径>]

init 不接收 API Key，只创建不含密钥和实例 ID 的本地配置。
API Key 必须由平台官方 CLI 通过隐藏输入保存。
options 展示当前配置目录中的选项；提供凭证名称时读取实时报价，--all 额外返回全部单卡库存。`);
}

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    help: { type: "boolean", short: "h" },
    platform: { type: "string" },
    "resource-option": { type: "string" },
    all: { type: "boolean", default: false },
    "confirm-platform": { type: "boolean", default: false },
    "credential-profile": { type: "string" },
    config: {
      type: "string",
      default: defaultConfigPath,
    },
  },
});

if (values.help || positionals.length !== 1) {
  usage();
  process.exit(values.help ? 0 : 1);
}

const command = positionals[0];
if (command === "platforms") {
  console.log(JSON.stringify({ platforms: supportedPlatforms() }, null, 2));
  process.exit(0);
}

if (command === "options") {
  let choices = resourceOptions(values.platform);
  let browseAll = {
    supported: true,
    requiresCredentialProfile: true,
  };
  const credentialProfile = values["credential-profile"]?.trim();
  if (values.all && !credentialProfile) {
    throw new Error("查看全部实时配置需要 --credential-profile");
  }
  if (credentialProfile) {
    if (values.platform !== "compshare") {
      throw new Error(`暂不支持平台实时扫描：${values.platform}`);
    }
    const catalog = platformCatalog(values.platform);
    const provider = new CompShareProvider({
      credentialProfile,
    });
    const liveCatalog = await scanAvailableSingleGpuResources(provider, {
      imageId: catalog.imageId,
    });
    choices = attachLivePrices(choices, liveCatalog.items);
    if (values.all) browseAll = liveCatalog;
  }
  console.log(
    JSON.stringify(
      {
        platform: values.platform,
        choices,
        browseAll,
        selectionRequired: true,
        automaticCrossChoiceFallback: false,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

if (command !== "init") {
  usage();
  throw new Error(`未知命令：${command}`);
}
const config = createUserConfig({
  platform: values.platform,
  credentialProfile: values["credential-profile"],
  resourceOption: values["resource-option"],
});
const configPath = await writeUserConfig(values.config, config);
console.log(
  JSON.stringify(
    {
      platform: values.platform,
      credentialProfile: config.provider.credentialProfile,
      resourceSelection: config.resourceSelection,
      configPath,
      containsApiKey: false,
      containsResourceId: false,
    },
    null,
    2,
  ),
);
