function requireValue(value, label) {
  if (value === undefined || value === null || value === "") {
    throw new Error(`Deployment Binding 缺少${label}`);
  }
  return value;
}

export function placementCandidates(binding) {
  const configured = binding.placementCandidates;
  if (Array.isArray(configured) && configured.length > 0) {
    return configured.map((candidate) => ({
      region: requireValue(candidate.region, " placement region"),
      zone: requireValue(candidate.zone, " placement zone"),
    }));
  }

  return [
    {
      region: requireValue(binding.compute?.region, " compute.region"),
      zone: requireValue(binding.compute?.zone, " compute.zone"),
    },
  ];
}

export function bindingToSpec(binding, placement) {
  const compute = binding.compute ?? {};
  return {
    gpu: compute.gpu,
    count: compute.count ?? 1,
    cpu: compute.cpu,
    memoryGiB: compute.memoryGiB,
    imageId: binding.image?.id,
    imageSource: binding.image?.source ?? "platform",
    region: placement.region,
    zone: placement.zone,
    diskGiB: compute.diskGiB,
    diskType: compute.diskType ?? "CLOUD_SSD",
    chargeType: compute.chargeType ?? "Postpay",
    name: binding.instanceName,
    cpuPlatform: compute.cpuPlatform ?? "Auto",
    maxHourlyPrice: binding.maximumHourlyPrice,
  };
}

function imageSummary(image) {
  return {
    id: image.CompShareImageId ?? image.ImageId ?? image.ID ?? null,
    name: image.Name ?? image.CompShareImageName ?? null,
    type: image.ImageType ?? image.Type ?? null,
    version: image.VersionName ?? image.Version ?? null,
    size: image.ActualSize ?? image.Size ?? null,
    cuda: image.CudaVersion ?? image.CUDA ?? null,
    python: image.PythonVersion ?? image.Python ?? null,
    comfyui: image.ComfyuiVersion ?? image.ComfyUIVersion ?? null,
  };
}

export function availabilitySummary(data, spec) {
  const candidates = data?.AvailableInstanceTypes ?? [];
  const inventory = data?.Inventory?.[spec.gpu] ?? [];
  const exactInventory = inventory.find(
    (item) =>
      item.Cpu === spec.cpu &&
      item.Gpu === (spec.count ?? 1) &&
      item.Mem === spec.memoryGiB,
  );
  return {
    available: exactInventory
      ? Boolean(exactInventory.ResourceEnough)
      : inventory.length === 0 &&
        candidates.some((candidate) => candidate.Status === "Normal"),
    candidateCount: candidates.length,
  };
}

function rejectedPlacement(placement, reason) {
  return {
    ...placement,
    compatible: false,
    reason,
  };
}

function requiredModelCaches(binding) {
  const sources = binding.modelCache?.sources;
  if (sources && Object.keys(sources).length > 0) {
    return Object.entries(sources).map(([id, cache]) => ({
      id,
      name: requireValue(cache.name, ` modelCache.sources.${id}.name`),
      path: requireValue(cache.path, ` modelCache.sources.${id}.path`),
    }));
  }

  return [
    {
      id: "default",
      name: requireValue(binding.modelCache?.name, " modelCache.name"),
      path: requireValue(binding.modelCache?.path, " modelCache.path"),
    },
  ];
}

async function buildSingleProvisionPlan(provider, binding) {
  if (binding.provider !== "compshare") {
    throw new Error(`Deployment Binding Provider 不受支持：${binding.provider}`);
  }
  if (binding.modelCache?.copyToSystemDisk !== false) {
    throw new Error("Deployment Binding 必须使用零复制平台模型缓存");
  }

  const credentials = await provider.validateCredentials();
  const cacheRequirements = requiredModelCaches(binding);
  const evaluations = [];
  const compatible = [];

  for (const placement of placementCandidates(binding)) {
    const spec = bindingToSpec(binding, placement);
    try {
      const cacheResults = await Promise.all(
        cacheRequirements.map(async (requirement) => {
          const models = await provider.listModels({
            name: requirement.name,
            region: placement.region,
            zone: placement.zone,
          });
          const cache = models.find((model) => model.Path === requirement.path);
          return { requirement, cache };
        }),
      );
      const missingCaches = cacheResults.filter(({ cache }) => !cache);
      if (missingCaches.length > 0) {
        evaluations.push(
          rejectedPlacement(
            placement,
            `缺少平台模型缓存：${missingCaches
              .map(({ requirement }) => requirement.name)
              .join(", ")}`,
          ),
        );
        continue;
      }

      const caches = Object.fromEntries(
        cacheResults.map(({ requirement, cache }) => [
          requirement.id,
          {
            name: cache.Name ?? requirement.name,
            path: cache.Path,
          },
        ]),
      );
      const primaryCache = caches[cacheRequirements[0].id];

      const [image, availability, quote] = await Promise.all([
        provider.getImage(spec.imageId, {
          source: spec.imageSource,
          region: spec.region,
          zone: spec.zone,
        }),
        provider.searchAvailability(spec),
        provider.quote(spec),
      ]);
      const summarizedAvailability = availabilitySummary(availability, spec);
      if (!summarizedAvailability.available) {
        evaluations.push(rejectedPlacement(placement, "目标 GPU/CPU/内存组合无库存"));
        continue;
      }
      if (quote.maximumHourly > spec.maxHourlyPrice) {
        evaluations.push(
          rejectedPlacement(
            placement,
            `保守报价 ${quote.maximumHourly} 元/小时超过上限 ${spec.maxHourlyPrice}`,
          ),
        );
        continue;
      }

      const accepted = {
        placement,
        spec,
        cache: primaryCache,
        caches,
        image: imageSummary(image),
        availability: summarizedAvailability,
        quote,
      };
      compatible.push(accepted);
      evaluations.push({
        ...placement,
        compatible: true,
        cachePaths: Object.values(caches).map((cache) => cache.path),
        available: true,
        maximumHourly: quote.maximumHourly,
      });
    } catch (error) {
      evaluations.push(rejectedPlacement(placement, error.message));
    }
  }

  if (compatible.length === 0) {
    const error = new Error(
      `没有同时满足完整 H3 缓存、镜像、库存和价格的区域：${evaluations
        .map((item) => `${item.zone}=${item.reason}`)
        .join("；")}`,
    );
    error.code = "COMPSHARE_NO_COMPATIBLE_PLACEMENT";
    throw error;
  }

  if (binding.placementStrategy === "lowest-price-compatible") {
    compatible.sort((left, right) =>
      left.quote.maximumHourly - right.quote.maximumHourly,
    );
  }

  let selected;
  let dryRun;
  for (const candidate of compatible) {
    try {
      dryRun = await provider.create(candidate.spec, { dryRun: true });
      selected = candidate;
      break;
    } catch (error) {
      const evaluation = evaluations.find(
        (item) => item.zone === candidate.placement.zone,
      );
      Object.assign(evaluation, {
        compatible: false,
        reason: `dry-run 失败：${error.message}`,
      });
    }
  }

  if (!selected) {
    const error = new Error("所有候选区域均未通过实例创建 dry-run");
    error.code = "COMPSHARE_NO_CREATABLE_PLACEMENT";
    throw error;
  }

  return {
    spec: selected.spec,
    result: {
      binding: binding.id,
      credentials: {
        valid: credentials.valid,
        visibleZoneCount: credentials.zones.length,
      },
      placement: {
        strategy: binding.placementStrategy ?? "first-compatible",
        selected: selected.placement,
        candidates: evaluations,
      },
      modelCache: selected.cache,
      modelCaches: selected.caches,
      image: selected.image,
      availability: selected.availability,
      quote: {
        chargeType: selected.quote.chargeType,
        maximumHourly: selected.quote.maximumHourly,
        ceiling: selected.spec.maxHourlyPrice,
        lineItem: selected.quote.lineItem,
      },
      dryRun: {
        accepted: dryRun.dryRun,
        selection: dryRun.plan?.selection ?? null,
        capacity: dryRun.plan?.capacity ?? null,
      },
      safety: {
        scheduleStopAfter: binding.safety?.scheduleStopAfter ?? null,
      },
    },
  };
}

function orderedResourceCandidates(binding) {
  if (binding.resourceCandidates === undefined) return null;
  if (
    !Array.isArray(binding.resourceCandidates) ||
    binding.resourceCandidates.length === 0
  ) {
    throw new Error("Deployment Binding resourceCandidates 必须是非空数组");
  }

  return binding.resourceCandidates.map((candidate, index) => ({
    ...candidate,
    id: requireValue(candidate.id, ` resourceCandidates[${index}].id`),
    compute: requireValue(
      candidate.compute,
      ` resourceCandidates[${index}].compute`,
    ),
  }));
}

function bindingForResourceCandidate(binding, candidate) {
  const { resourceCandidates: _resourceCandidates, ...base } = binding;
  return {
    ...base,
    compute: {
      ...(binding.compute ?? {}),
      ...candidate.compute,
    },
    placementCandidates:
      candidate.placementCandidates ?? binding.placementCandidates,
    placementStrategy:
      candidate.placementStrategy ?? binding.placementStrategy,
    maximumHourlyPrice:
      candidate.maximumHourlyPrice ?? binding.maximumHourlyPrice,
    instanceName: candidate.instanceName ?? binding.instanceName,
  };
}

export async function buildProvisionPlan(provider, binding) {
  const candidates = orderedResourceCandidates(binding);
  if (!candidates) return buildSingleProvisionPlan(provider, binding);

  if ((binding.resourceStrategy ?? "ordered") !== "ordered") {
    throw new Error(
      `Deployment Binding 资源策略不受支持：${binding.resourceStrategy}`,
    );
  }

  const evaluations = [];
  const fallbackCodes = new Set([
    "COMPSHARE_NO_COMPATIBLE_PLACEMENT",
    "COMPSHARE_NO_CREATABLE_PLACEMENT",
  ]);

  for (const [index, candidate] of candidates.entries()) {
    try {
      const plan = await buildSingleProvisionPlan(
        provider,
        bindingForResourceCandidate(binding, candidate),
      );
      const selected = {
        id: candidate.id,
        priority: index + 1,
        memoryGiB: plan.spec.memoryGiB,
        cpu: plan.spec.cpu,
      };
      return {
        ...plan,
        result: {
          ...plan.result,
          resource: {
            strategy: "ordered",
            selected,
            candidates: [
              ...evaluations,
              {
                ...selected,
                compatible: true,
              },
            ],
          },
        },
      };
    } catch (error) {
      if (!fallbackCodes.has(error.code)) throw error;
      evaluations.push({
        id: candidate.id,
        priority: index + 1,
        memoryGiB: candidate.compute.memoryGiB,
        cpu: candidate.compute.cpu,
        compatible: false,
        code: error.code,
        reason: error.message,
      });
    }
  }

  const error = new Error(
    `所有有序资源候选均不可用：${evaluations
      .map((candidate) => `${candidate.id}=${candidate.reason}`)
      .join("；")}`,
  );
  error.code = "COMPSHARE_NO_COMPATIBLE_RESOURCE";
  error.candidates = evaluations;
  throw error;
}
