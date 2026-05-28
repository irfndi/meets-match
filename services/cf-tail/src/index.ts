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
      const eventInfo = event.event;
      const url =
        eventInfo != null && "request" in eventInfo
          ? (eventInfo as TraceItemFetchEventInfo).request.url
          : "";
      const method =
        eventInfo != null && "request" in eventInfo
          ? (eventInfo as TraceItemFetchEventInfo).request.method
          : "";
      const responseStatus =
        eventInfo != null &&
        "response" in eventInfo &&
        eventInfo.response != null
          ? eventInfo.response.status
          : null;

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
