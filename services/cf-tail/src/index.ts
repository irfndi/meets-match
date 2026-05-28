interface Env {
  ANALYTICS: AnalyticsEngineDataset;
}

export default {
  async tail(
    events: TraceItem[],
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    const now = Date.now();

    for (const event of events) {
      let url = "";
      let method = "";
      let responseStatus: number | null = null;

      try {
        const eventInfo = event.event as Record<string, unknown> | undefined;
        if (eventInfo) {
          const request = eventInfo.request as Record<string, unknown> | undefined;
          if (request) {
            url = String(request.url ?? "");
            method = String(request.method ?? "");
          }
          const response = eventInfo.response as Record<string, unknown> | undefined;
          if (response && typeof response.status === "number") {
            responseStatus = response.status;
          }
        }
      } catch {
        // Ignore parse errors, use empty values
      }

      env.ANALYTICS.writeDataPoint({
        blobs: [
          event.scriptName ?? "",
          event.outcome,
          url,
          method,
          responseStatus != null ? String(responseStatus) : "",
        ],
        doubles: [1, event.eventTimestamp ?? now, now],
        indexes: [],
      });
    }

    ctx.waitUntil(Promise.resolve());
  },
};
