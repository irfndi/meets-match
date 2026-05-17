import type { Env } from "../index.js";

export async function runSubscriptionExpiryJob(env: Env): Promise<void> {
  console.log("[subscription-expiry] Starting expiry check");

  try {
    const response = await env.API_SERVICE.fetch(
      new Request("http://api/cron/downgrade-expired-subscriptions", {
        method: "POST",
      }),
    );

    if (response.ok) {
      const data = (await response.json()) as {
        downgraded?: number;
      };
      console.log(
        `[subscription-expiry] Downgraded ${data.downgraded ?? 0} expired subscriptions`,
      );
    } else {
      console.error(
        `[subscription-expiry] API returned ${response.status}: ${await response.text()}`,
      );
    }
  } catch (error) {
    console.error("[subscription-expiry] Job failed:", error);
    throw error;
  }
}
