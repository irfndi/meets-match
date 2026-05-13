import { Effect } from "effect";
import type { Fetcher } from "@cloudflare/workers-types";
import {
  type SendNotificationRequest,
  type SendNotificationResponse,
  type EnqueueNotificationRequest,
  type EnqueueNotificationResponse,
  type GetNotificationRequest,
  type GetNotificationResponse,
  type GetDLQStatsRequest,
  type GetDLQStatsResponse,
  type ReplayDLQRequest,
  type ReplayDLQResponse,
  type GetQueueStatsRequest,
  type GetQueueStatsResponse,
  type GetReengagementCandidatesRequest,
  type GetReengagementCandidatesResponse,
  type LogNotificationResultRequest,
  type LogNotificationResultResponse,
  NotificationService as INotificationService,
} from "@meetsmatch/cf-shared";

export class BotServiceClient implements INotificationService {
  constructor(private readonly binding: Fetcher) {}

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

  async enqueueNotification(_req: EnqueueNotificationRequest): Promise<EnqueueNotificationResponse> {
    throw new Error("Not implemented");
  }
  async getNotification(_req: GetNotificationRequest): Promise<GetNotificationResponse> {
    throw new Error("Not implemented");
  }
  async getDLQStats(_req: GetDLQStatsRequest): Promise<GetDLQStatsResponse> {
    throw new Error("Not implemented");
  }
  async replayDLQ(_req: ReplayDLQRequest): Promise<ReplayDLQResponse> {
    throw new Error("Not implemented");
  }
  async getQueueStats(_req: GetQueueStatsRequest): Promise<GetQueueStatsResponse> {
    throw new Error("Not implemented");
  }
  async getReengagementCandidates(_req: GetReengagementCandidatesRequest): Promise<GetReengagementCandidatesResponse> {
    throw new Error("Not implemented");
  }
  async logNotificationResult(_req: LogNotificationResultRequest): Promise<LogNotificationResultResponse> {
    throw new Error("Not implemented");
  }
}
