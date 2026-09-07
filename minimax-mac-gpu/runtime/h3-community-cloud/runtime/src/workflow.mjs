export const PRESETS = Object.freeze({
  preview: Object.freeze({ durationSeconds: 5, megapixels: 0.4, aspectRatio: "16:9" }),
  balanced: Object.freeze({ durationSeconds: 15, megapixels: 0.6, aspectRatio: "16:9" }),
  short_hq: Object.freeze({ durationSeconds: 7, megapixels: 0.8, aspectRatio: "16:9" }),
});

export const ASPECT_RATIOS = Object.freeze({
  "1:1": "1:1 (Square)",
  "2:3": "2:3 (Portrait Photo)",
  "3:2": "3:2 (Photo)",
  "3:4": "3:4 (Portrait Standard)",
  "4:3": "4:3 (Standard)",
  "9:16": "9:16 (Portrait Widescreen)",
  "16:9": "16:9 (Widescreen)",
  "21:9": "21:9 (Ultrawide)",
});

export const GENERATION_LIMITS = Object.freeze({
  durationSeconds: Object.freeze({ min: 2, max: 15 }),
  megapixels: Object.freeze({ min: 0.2, max: 1.0 }),
});

function normalizeAspectRatio(value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("缺少画幅；可选 1:1、2:3、3:2、3:4、4:3、9:16、16:9、21:9");
  }
  const trimmed = value.trim();
  const compact = trimmed.match(/^\d+\s*:\s*\d+/)?.[0]?.replaceAll(" ", "");
  const normalized = ASPECT_RATIOS[compact] ??
    Object.values(ASPECT_RATIOS).find((choice) => choice === trimmed);
  if (!normalized) {
    throw new Error(`不支持画幅：${value}；可选 ${Object.keys(ASPECT_RATIOS).join("、")}`);
  }
  return normalized;
}

export function resolveGenerationSettings({
  preset,
  durationSeconds,
  megapixels,
  aspectRatio,
} = {}) {
  const presetConfig = preset === undefined ? null : PRESETS[preset];
  if (preset !== undefined && !presetConfig) {
    throw new Error(`未知预设：${preset}；可选值为 ${Object.keys(PRESETS).join(", ")}`);
  }

  const resolvedDuration = durationSeconds ?? presetConfig?.durationSeconds;
  const resolvedMegapixels = megapixels ?? presetConfig?.megapixels;
  const resolvedAspectRatio = aspectRatio ?? presetConfig?.aspectRatio;
  const missing = [];
  if (resolvedAspectRatio === undefined) missing.push("画幅");
  if (resolvedDuration === undefined) missing.push("时长");
  if (resolvedMegapixels === undefined) missing.push("清晰度");
  if (missing.length > 0) {
    throw new Error(`缺少生成参数：${missing.join("、")}`);
  }

  if (
    !Number.isFinite(resolvedDuration) ||
    resolvedDuration < GENERATION_LIMITS.durationSeconds.min ||
    resolvedDuration > GENERATION_LIMITS.durationSeconds.max
  ) {
    throw new Error(
      `时长必须在 ${GENERATION_LIMITS.durationSeconds.min}–${GENERATION_LIMITS.durationSeconds.max} 秒之间`,
    );
  }
  if (
    !Number.isFinite(resolvedMegapixels) ||
    resolvedMegapixels < GENERATION_LIMITS.megapixels.min ||
    resolvedMegapixels > GENERATION_LIMITS.megapixels.max
  ) {
    throw new Error(
      `清晰度必须在 ${GENERATION_LIMITS.megapixels.min}–${GENERATION_LIMITS.megapixels.max}MP 之间`,
    );
  }

  return {
    durationSeconds: resolvedDuration,
    megapixels: resolvedMegapixels,
    aspectRatio: normalizeAspectRatio(resolvedAspectRatio),
  };
}

function findUniqueNode(workflow, classType, title) {
  const matches = Object.entries(workflow).filter(([, node]) => {
    if (node.class_type !== classType) return false;
    return title === undefined || node._meta?.title === title;
  });

  if (matches.length !== 1) {
    throw new Error(
      `工作流需要且只能有一个 ${title ?? classType} 节点，实际找到 ${matches.length} 个`,
    );
  }

  return matches[0];
}

function findGenerationNode(workflow) {
  const matches = Object.entries(workflow).filter(([, node]) =>
    ["MiniMaxH3ImageToVideo", "MiniMaxH3ReferenceToVideo"].includes(
      node.class_type,
    ),
  );

  if (matches.length !== 1) {
    throw new Error(
      `工作流需要且只能有一个 MiniMax H3 生成节点，实际找到 ${matches.length} 个`,
    );
  }

  return matches[0];
}

function addUploadedImageNode(workflow, { nodeId, image, title }) {
  if (typeof image !== "string" || image.trim() === "") {
    throw new Error(`${title}不能为空`);
  }
  if (Object.hasOwn(workflow, nodeId)) {
    throw new Error(`工作流已存在保留节点：${nodeId}`);
  }

  workflow[nodeId] = {
    inputs: { image },
    class_type: "LoadImage",
    _meta: { title },
  };
  return [nodeId, 0];
}

function addUploadedVideoNodes(workflow, { index, video }) {
  if (typeof video !== "string" || !video.trim()) {
    throw new Error("参考视频路径不能为空");
  }
  const loadId = `codex_reference_video_${index}`;
  const componentsId = `codex_reference_video_components_${index}`;
  if (Object.hasOwn(workflow, loadId) || Object.hasOwn(workflow, componentsId)) {
    throw new Error(`工作流已存在参考视频保留节点：${index}`);
  }
  workflow[loadId] = {
    inputs: { file: video },
    class_type: "LoadVideo",
    _meta: { title: `Codex Reference Video ${index + 1}` },
  };
  workflow[componentsId] = {
    inputs: { video: [loadId, 0] },
    class_type: "GetVideoComponents",
    _meta: { title: `Codex Reference Video Components ${index + 1}` },
  };
  return [componentsId, 0];
}

function normalizeReferencePrompt(prompt, imageCount, videoCount = 0) {
  const withoutTags = prompt.trim();
  for (const [, kind, number] of withoutTags.matchAll(/<(Picture|Video)\s+(\d+)>/g)) {
    const count = kind === "Picture" ? imageCount : videoCount;
    if (Number(number) < 1 || Number(number) > count) {
      throw new Error(`提示词引用了不存在的素材：<${kind} ${number}>`);
    }
  }
  const pictureTags = Array.from(
    { length: imageCount },
    (_, index) => `<Picture ${index + 1}>`,
  );
  const videoTags = Array.from(
    { length: videoCount },
    (_, index) => `<Video ${index + 1}>`,
  );
  const tags = [...pictureTags, ...videoTags].filter(tag => !withoutTags.includes(tag)).join(" ");
  return [tags, withoutTags].filter(Boolean).join(" ");
}

export function configureWorkflow(
  source,
  {
    preset,
    durationSeconds,
    megapixels,
    aspectRatio,
    prompt,
    seed,
    filenamePrefix,
    firstFrameImage,
    lastFrameImage,
    referenceImage,
    referenceImages,
    referenceVideos,
  },
) {
  const settings = resolveGenerationSettings({
    preset,
    durationSeconds,
    megapixels,
    aspectRatio,
  });

  if (!Number.isSafeInteger(seed) || seed < 0) {
    throw new Error("seed 必须是非负安全整数");
  }

  if (referenceImage !== undefined && referenceImages !== undefined) {
    throw new Error("referenceImage 与 referenceImages 不能同时使用");
  }
  const resolvedReferenceImages = referenceImages ??
    (referenceImage === undefined ? [] : [referenceImage]);
  const resolvedReferenceVideos = referenceVideos ?? [];
  if (!Array.isArray(resolvedReferenceImages)) {
    throw new Error("referenceImages 必须是数组");
  }
  if (resolvedReferenceImages.length > 9) {
    throw new Error("参考图最多支持 9 张");
  }
  if (!Array.isArray(resolvedReferenceVideos) || resolvedReferenceVideos.length > 3) {
    throw new Error("参考视频必须是最多 3 段的数组");
  }
  if (
    (resolvedReferenceImages.length > 0 || resolvedReferenceVideos.length > 0) &&
    (firstFrameImage !== undefined || lastFrameImage !== undefined)
  ) {
    throw new Error("关键帧模式和参考素材模式不能同时使用");
  }

  const workflow = structuredClone(source);
  const [, generationNode] = findGenerationNode(workflow);
  const [, seedNode] = findUniqueNode(workflow, "RandomNoise");
  const [, resolutionNode] = findUniqueNode(workflow, "ResolutionSelector");
  const [, durationNode] = findUniqueNode(workflow, "PrimitiveFloat", "Float (duration)");
  const [, saveNode] = findUniqueNode(workflow, "SaveVideo");
  if (generationNode.class_type === "MiniMaxH3ReferenceToVideo" &&
      resolvedReferenceImages.length + resolvedReferenceVideos.length === 0) {
    throw new Error("参考素材工作流至少需要一张图片或一段视频");
  }

  if (prompt !== undefined) {
    if (typeof prompt !== "string" || prompt.trim() === "") {
      throw new Error("prompt 不能为空");
    }
    generationNode.inputs.prompt =
      generationNode.class_type === "MiniMaxH3ReferenceToVideo"
        ? normalizeReferencePrompt(
            prompt,
            resolvedReferenceImages.length,
            resolvedReferenceVideos.length,
          )
        : prompt;
  }

  if (firstFrameImage !== undefined) {
    if (generationNode.class_type !== "MiniMaxH3ImageToVideo") {
      throw new Error("当前工作流不支持首帧关键帧");
    }
    generationNode.inputs.first_frame = addUploadedImageNode(workflow, {
      nodeId: "codex_first_frame",
      image: firstFrameImage,
      title: "Codex First Frame",
    });
  }

  if (lastFrameImage !== undefined) {
    if (generationNode.class_type !== "MiniMaxH3ImageToVideo") {
      throw new Error("当前工作流不支持尾帧关键帧");
    }
    generationNode.inputs.last_frame = addUploadedImageNode(workflow, {
      nodeId: "codex_last_frame",
      image: lastFrameImage,
      title: "Codex Last Frame",
    });
  }

  if (resolvedReferenceImages.length > 0) {
    if (generationNode.class_type !== "MiniMaxH3ReferenceToVideo") {
      throw new Error("当前工作流不支持参考图模式");
    }
    resolvedReferenceImages.forEach((image, index) => {
      generationNode.inputs[`ref_images.ref_image_${index}`] =
        addUploadedImageNode(workflow, {
          nodeId: `codex_reference_image_${index}`,
          image,
          title: `Codex Reference Image ${index + 1}`,
        });
    });
    generationNode.inputs.prompt = normalizeReferencePrompt(
      generationNode.inputs.prompt,
      resolvedReferenceImages.length,
      resolvedReferenceVideos.length,
    );
  }

  if (resolvedReferenceVideos.length > 0) {
    if (generationNode.class_type !== "MiniMaxH3ReferenceToVideo") {
      throw new Error("当前工作流不支持参考视频模式");
    }
    resolvedReferenceVideos.forEach((video, index) => {
      generationNode.inputs[`ref_videos.ref_video_${index}`] =
        addUploadedVideoNodes(workflow, { index, video });
    });
    generationNode.inputs.prompt = normalizeReferencePrompt(
      generationNode.inputs.prompt,
      resolvedReferenceImages.length,
      resolvedReferenceVideos.length,
    );
  }

  seedNode.inputs.noise_seed = seed;
  resolutionNode.inputs.aspect_ratio = settings.aspectRatio;
  resolutionNode.inputs.megapixels = settings.megapixels;
  durationNode.inputs.value = settings.durationSeconds;
  saveNode.inputs.filename_prefix = filenamePrefix;
  delete saveNode.inputs["video-preview"];

  return workflow;
}

export function describeWorkflow(workflow) {
  const [generationId, generationNode] = findGenerationNode(workflow);
  const [seedId] = findUniqueNode(workflow, "RandomNoise");
  const [resolutionId] = findUniqueNode(workflow, "ResolutionSelector");
  const [durationId] = findUniqueNode(workflow, "PrimitiveFloat", "Float (duration)");
  const [saveId] = findUniqueNode(workflow, "SaveVideo");

  return {
    node_count: Object.keys(workflow).length,
    parameter_nodes: {
      prompt: generationId,
      seed: seedId,
      resolution: resolutionId,
      duration: durationId,
      output: saveId,
    },
    defaults: {
      prompt_chars: generationNode.inputs.prompt.length,
    },
    mode:
      generationNode.class_type === "MiniMaxH3ReferenceToVideo"
        ? "reference-media-to-video"
        : "text-or-keyframe-to-video",
  };
}

export function findVideoArtifact(historyEntry) {
  const matches = [];

  function visit(value) {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }

    if (!value || typeof value !== "object") return;

    if (
      typeof value.filename === "string" &&
      /\.(mp4|mov|webm)$/i.test(value.filename)
    ) {
      matches.push({
        filename: value.filename,
        subfolder: value.subfolder ?? "",
        type: value.type ?? "output",
      });
    }

    for (const nested of Object.values(value)) visit(nested);
  }

  visit(historyEntry?.outputs);
  return matches[0] ?? null;
}

export function inspectWorkflowCompatibility(workflow, objectInfo) {
  const missingClasses = new Set();
  const missingInputs = [];
  const unavailableChoices = [];

  for (const [nodeId, node] of Object.entries(workflow)) {
    const definition = objectInfo?.[node.class_type];
    if (!definition) {
      missingClasses.add(node.class_type);
      continue;
    }

    const inputGroups = definition.input ?? {};
    const inputDefinitions = {
      ...(inputGroups.required ?? {}),
      ...(inputGroups.optional ?? {}),
      ...(inputGroups.hidden ?? {}),
    };

    for (const [name, value] of Object.entries(node.inputs ?? {})) {
      const dynamicRoot = name.includes(".") ? name.split(".", 1)[0] : null;
      const dynamicDefinition = dynamicRoot
        ? inputDefinitions[dynamicRoot]
        : undefined;
      const isDynamicInput = [
        "COMFY_AUTOGROW_V3",
        "COMFY_DYNAMICCOMBO_V3",
        "COMFY_DYNAMICSLOT_V3",
      ].includes(dynamicDefinition?.[0]);
      const isFrontendOnlyVideoPreview =
        node.class_type === "SaveVideo" && name === "video-preview";
      const inputDefinition = inputDefinitions[name] ?? dynamicDefinition;
      if (!inputDefinition) {
        if (isFrontendOnlyVideoPreview) continue;
        missingInputs.push({ node_id: nodeId, class_type: node.class_type, input: name });
        continue;
      }

      if (isDynamicInput) continue;

      const choices = inputDefinition?.[0];
      const isConnection =
        Array.isArray(value) &&
        value.length === 2 &&
        (typeof value[0] === "string" || typeof value[0] === "number") &&
        Number.isInteger(value[1]);
      const isUploadedImage =
        nodeId.startsWith("codex_") &&
        node.class_type === "LoadImage" &&
        name === "image";
      if (
        Array.isArray(choices) &&
        !isConnection &&
        !isUploadedImage &&
        !choices.some((choice) => Object.is(choice, value))
      ) {
        unavailableChoices.push({
          node_id: nodeId,
          class_type: node.class_type,
          input: name,
          value,
        });
      }
    }
  }

  return {
    compatible:
      missingClasses.size === 0 &&
      missingInputs.length === 0 &&
      unavailableChoices.length === 0,
    required_class_count: new Set(
      Object.values(workflow).map((node) => node.class_type),
    ).size,
    missing_classes: [...missingClasses].sort(),
    missing_inputs: missingInputs,
    unavailable_choices: unavailableChoices,
  };
}
