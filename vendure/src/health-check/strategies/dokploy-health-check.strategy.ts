import { StandaloneHealthCheckContext, StandaloneHealthCheckStrategy } from "../health-check.plugin";

export interface DokployHealthCheckStrategyOptions {
  key: string;
  maxDiskPercent: number;
  maxCpuPercent: number;
  maxMemoryPercent: number;
  apiKey: string;
  dokployHost: string;
}

/**
 * Checks Dokploy app resource usage thresholds.
 */
export class DokployHealthCheckStrategy implements StandaloneHealthCheckStrategy {
  key: string;
  private options: DokployHealthCheckStrategyOptions;

  constructor(options: DokployHealthCheckStrategyOptions) {
    this.key = options.key;
    this.options = options;
  }

  async check(_context: StandaloneHealthCheckContext): Promise<void> {
    const url = new URL(
      `https://${this.options.dokployHost}/api/application.readAppMonitoring?appName=dokploy`,
    );

    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "x-api-key": this.options.apiKey,
      },
    }).catch((error: Error) => {
      throw new Error(`failed to fetch metrics: ${error.message}`);
    });

    if (!response.ok) {
      throw new Error(`failed to fetch metrics (${response.status} ${response.statusText})`);
    }

    const data = (await response.json()) as DokployMetrics;
    const latestDisk = data.disk[data.disk.length - 1];
    const latestCpu = data.cpu[data.cpu.length - 1];
    const latestMemory = data.memory[data.memory.length - 1];

    if (!latestDisk || !latestCpu || !latestMemory) {
      throw new Error("missing dokploy metrics");
    }

    const diskUsed = latestDisk.value.diskUsedPercentage;
    if (diskUsed > this.options.maxDiskPercent) {
      throw new Error(
        `disk usage above ${this.options.maxDiskPercent}% (${diskUsed.toFixed(2)}%)`,
      );
    }

    const cpuUsageRaw = latestCpu.value.replace("%", "");
    const cpuUsage = parseFloat(cpuUsageRaw);
    if (!Number.isFinite(cpuUsage)) {
      throw new Error(`invalid cpu metric '${latestCpu.value}'`);
    }

    if (cpuUsage > this.options.maxCpuPercent) {
      throw new Error(
        `cpu usage above ${this.options.maxCpuPercent}% (${cpuUsage.toFixed(2)}%)`,
      );
    }

    const total = this.parseMemoryToBytes(latestMemory.value.total);
    const used = this.parseMemoryToBytes(latestMemory.value.used);
    if (total <= 0 || used < 0 || used > total) {
      throw new Error(
        `invalid memory metrics used=${latestMemory.value.used}, total=${latestMemory.value.total}`,
      );
    }

    const memoryUsedPercent = (used / total) * 100;
    if (memoryUsedPercent > this.options.maxMemoryPercent) {
      throw new Error(
        `memory usage above ${this.options.maxMemoryPercent}% (${memoryUsedPercent.toFixed(2)}%)`,
      );
    }
  }

  /**
   * Parses memory values like 1.57GiB into bytes.
   */
  private parseMemoryToBytes(value: string): number {
    const memoryRegex = /^([0-9]+(?:\.[0-9]+)?)\s*([KMGTP]?i?B)$/i;
    const match = value.trim().match(memoryRegex);

    if (!match) {
      throw new Error(`invalid memory value '${value}'`);
    }

    const amount = parseFloat(match[1]);
    const unit = match[2].toUpperCase();
    const multipliers: Record<string, number> = {
      B: 1,
      KB: 1_000,
      MB: 1_000_000,
      GB: 1_000_000_000,
      TB: 1_000_000_000_000,
      PB: 1_000_000_000_000_000,
      KIB: 1_024,
      MIB: 1_048_576,
      GIB: 1_073_741_824,
      TIB: 1_099_511_627_776,
      PIB: 1_125_899_906_842_624,
    };

    const multiplier = multipliers[unit];
    if (!multiplier) {
      throw new Error(`unsupported memory unit '${unit}'`);
    }

    return amount * multiplier;
  }
}

interface DokployMetrics {
  cpu: Array<{
    value: string;
    time: string;
  }>;
  memory: Array<{
    value: {
      used: string;
      total: string;
    };
    time: string;
  }>;
  disk: Array<{
    value: {
      diskTotal: number;
      diskUsedPercentage: number;
      diskUsage: number;
      diskFree: number;
    };
    time: string;
  }>;
}
