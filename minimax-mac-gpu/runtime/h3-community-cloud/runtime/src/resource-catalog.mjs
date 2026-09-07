function gpuTypeMap(data) {
  return new Map(
    (data?.AvailableInstanceTypes ?? []).map((type) => [type.Name, type]),
  );
}

export function availableSingleGpuOptions(data, placement) {
  const types = gpuTypeMap(data);
  return Object.entries(data?.Inventory ?? {}).flatMap(([gpu, entries]) =>
    entries
      .filter((entry) => entry.Gpu === 1 && entry.ResourceEnough === true)
      .map((entry) => ({
        id: `${placement.zone}:${gpu}:${entry.Cpu}:${entry.Mem}`,
        region: placement.region,
        zone: placement.zone,
        zoneLabel: placement.label,
        gpu,
        gpuMemoryGiB: types.get(gpu)?.GraphicsMemory?.Value ?? null,
        cpu: entry.Cpu,
        systemMemoryGiB: entry.Mem,
      })),
  );
}

export async function scanAvailableSingleGpuResources(
  provider,
  { imageId, diskGiB = 100 },
) {
  const credentials = await provider.validateCredentials();
  const zoneResults = await Promise.all(
    credentials.zones.map(async (zone) => {
      const placement = {
        region: zone.Region,
        zone: zone.Zone,
        label: zone.Describe ?? zone.Zone,
      };
      try {
        const availability = await provider.searchAvailability({
          imageId,
          region: placement.region,
          zone: placement.zone,
          diskGiB,
        });
        return {
          placement,
          items: availableSingleGpuOptions(availability, placement),
          error: null,
        };
      } catch (error) {
        return { placement, items: [], error: error.message };
      }
    }),
  );

  const items = zoneResults.flatMap((result) => result.items);
  const quoted = await Promise.all(
    items.map(async (item) => {
      try {
        const quote = await provider.quote({
          gpu: item.gpu,
          count: 1,
          cpu: item.cpu,
          memoryGiB: item.systemMemoryGiB,
          imageId,
          region: item.region,
          zone: item.zone,
          diskGiB,
          diskType: "CLOUD_SSD",
          chargeType: "Postpay",
        });
        return {
          ...item,
          hourlyPrice: quote.maximumHourly,
          priceLineItem: quote.lineItem,
        };
      } catch (error) {
        return { ...item, hourlyPrice: null, priceError: error.message };
      }
    }),
  );

  quoted.sort((left, right) => {
    const leftPrice = left.hourlyPrice ?? Number.POSITIVE_INFINITY;
    const rightPrice = right.hourlyPrice ?? Number.POSITIVE_INFINITY;
    return leftPrice - rightPrice || left.gpu.localeCompare(right.gpu);
  });

  return {
    scannedAt: new Date().toISOString(),
    imageId,
    items: quoted,
    zoneErrors: zoneResults
      .filter((result) => result.error)
      .map((result) => ({ ...result.placement, error: result.error })),
  };
}

export function attachLivePrices(choices, items) {
  return choices.map((choice) => {
    const matches = items
      .filter(
        (item) =>
          item.gpu === choice.hardware.gpu &&
          item.cpu === choice.hardware.cpu &&
          item.systemMemoryGiB === choice.hardware.systemMemoryGiB &&
          Number.isFinite(item.hourlyPrice),
      )
      .sort((left, right) => left.hourlyPrice - right.hourlyPrice);
    const match = matches[0];
    if (!match) return { ...choice };
    return {
      ...choice,
      priceDisplay: `¥${match.hourlyPrice.toFixed(2)}/小时`,
      priceSource: "live",
    };
  });
}
