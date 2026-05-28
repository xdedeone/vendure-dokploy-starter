import { StandaloneHealthCheckContext, StandaloneHealthCheckStrategy } from "../health-check.plugin";

export interface HttpHealthCheckStrategyOptions {
  key: string;
  url: string;
  timeoutMs?: number;
}

/**
 * Checks an arbitrary HTTP endpoint.
 */
export class HttpHealthCheckStrategy implements StandaloneHealthCheckStrategy {
  key: string;
  private url: string;
  private timeoutMs: number;

  constructor(options: HttpHealthCheckStrategyOptions) {
    this.key = options.key;
    this.url = options.url;
    this.timeoutMs = options.timeoutMs ?? 5000;
  }

  async check(_context: StandaloneHealthCheckContext): Promise<void> {
    const timeoutController = new AbortController();
    const timeout = setTimeout(() => {
      timeoutController.abort();
    }, this.timeoutMs);

    try {
      const response = await fetch(this.url, {
        signal: timeoutController.signal,
      });

      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`timeout after ${this.timeoutMs}ms`);
      }

      if (error instanceof Error) {
        throw new Error(error.message);
      }

      throw new Error(String(error));
    } finally {
      clearTimeout(timeout);
    }
  }
}
