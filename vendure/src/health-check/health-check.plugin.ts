import {
  PluginCommonModule,
  TransactionalConnection,
  VendurePlugin,
} from "@vendure/core";
import { Controller, Get, Res, ServiceUnavailableException } from "@nestjs/common";
import type { DataSource } from "typeorm";
import { Response, Request } from 'express';

/**
 * Shared runtime context for standalone health checks.
 */
export interface StandaloneHealthCheckContext {
  dataSource: DataSource;
}

/**
 * Strategy contract for standalone health checks.
 * Implementations resolve when healthy and throw when unhealthy.
 */
export interface StandaloneHealthCheckStrategy {
  key: string;
  check(context: StandaloneHealthCheckContext): Promise<void>;
}

/**
 * Plugin options for standalone health checks.
 */
export interface StandaloneHealthPluginOptions {
  strategies: StandaloneHealthCheckStrategy[];
}

@Controller("health-check")
class HealthController {
  constructor(private connection: TransactionalConnection) {}

  /**
   * Returns empty 200 when healthy, otherwise 503 with error message.
   */
  @Get()
  async getHealth(@Res() res: Response): Promise<void> {
    await this.check().catch((error: Error) => {
      throw new ServiceUnavailableException(error.message);
    });
    res.send(200);
  }
  /**
   * Runs all configured checks and throws on failure.
   */
  async check(): Promise<void> {
    const dataSource = this.connection.rawConnection;
    const checkResults = await Promise.allSettled(
      HealthCheckPlugin.options.strategies.map(async (strategy) => {
        await strategy.check({ dataSource });
      }),
    );

    const errorMessages: string[] = [];
    checkResults.forEach((result, index) => {
      if (result.status === "fulfilled") {
        return;
      }

      const strategy = HealthCheckPlugin.options.strategies[index];
      const message = this.getErrorMessage(result.reason);
      errorMessages.push(`${strategy.key}: ${message}`);
    });

    if (errorMessages.length > 0) {
      throw new Error(`Health check failed: ${errorMessages.join("; ")}`);
    }
  }

  /**
   * Normalizes thrown values to a readable message.
   */
  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }
}

/**
 * Custom health check plugin, because the built in Vendure Healthcheck is deprecated
 */
@VendurePlugin({
  imports: [PluginCommonModule],
  controllers: [HealthController],
  compatibility: "^3.0.0",
})
export class HealthCheckPlugin {
  static options: StandaloneHealthPluginOptions;

  /**
   * Registers plugin options.
   */
  static init(
    options: StandaloneHealthPluginOptions,
  ): typeof HealthCheckPlugin {
    this.options = options;
    return HealthCheckPlugin;
  }
}
