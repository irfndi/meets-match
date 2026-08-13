interface Env {
  ANALYTICS?: AnalyticsEngineDataset;
}

interface TailResponse {
  status?: number;
}

interface TailRequest {
  url?: string;
  method?: string;
}

interface TailEventInfo {
  request?: TailRequest;
  response?: TailResponse;
}

export default {
  async tail(
    events: TraceItem[],
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    if (!env.ANALYTICS) return;

    const now = Date.now();
    const MAX_URL_LEN = 512;

    for (const event of events) {
      try {
        let url = "";
        let method = "";
        let responseStatus: number | null = null;

        const eventInfo = event.event as TailEventInfo | undefined;
        if (eventInfo) {
          const request = eventInfo.request;
          if (request) {
            url = String(request.url ?? "")
              .split("?")[0]
              .slice(0, MAX_URL_LEN);
            method = String(request.method ?? "");
          }
          const response = eventInfo.response;
          responseStatus = response?.status ?? null;
        }

        env.ANALYTICS.writeDataPoint({
          blobs: [
            event.scriptName ?? "",
            event.outcome,
            url,
            method,
            responseStatus != null ? String(responseStatus) : "",
          ],
          doubles: [1, event.eventTimestamp ?? now],
          indexes: [],
        });
      } catch {
        // Skip malformed events, continue processing batch
      }
    }
  },

  async fetch(): Promise<Response> {
    return new Response("Not Found", { status: 404 });
  },
};
