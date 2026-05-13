import { Effect } from "effect";
import type { ServiceBinding } from "@cloudflare/workers-types";
import {
  type SendNotificationRequest,
  type SendNotificationResponse,
  NotificationService as INotificationService,
} from "@meetsmatch/cf-shared";

export class BotServiceClient implements INotificationService {
  constructor(private readonly binding: ServiceBinding) {}

  async sendNotification(req: SendNotificationRequest): Promise<SendNotificationResponse> {
    const response = await this.binding.fetch(new Request("http://bot/send-notification", {
      method: "POST",
      body: JSON.stringify(req),
      headers: { "Content-Type": "application/json" },
    }));

    if (!response.ok) {
      throw new Error(`Bot service error: ${response.status}`);
    }

    return (await response.json()) as SendNotificationResponse;
  }

  // Stub methods - not used in Service Binding context
  async enqueueNotification() { throw new Error("Not implemented"); }
  async getNotification() { throw new Error("Not implemented"); }
  async getDLQStats() { throw new Error("Not implemented"); }
  async replayDLQ() { throw new Error("Not implemented"); }
  async getQueueStats() { throw new Error("Not implemented"); }
  async getReengagementCandidates() { throw new Error("Not implemented"); }
  async logNotificationResult() { throw new Error("Not implemented"); }
}
