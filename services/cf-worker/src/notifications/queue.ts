import { Effect } from "effect";
import type { Queue, ServiceBinding } from "@cloudflare/workers-types";

export interface NotificationMessage {
  notificationId: string;
  userId: string;
  type: string;
  payload?: string;
}

export class NotificationQueueProducer {
  constructor(private readonly queue: Queue) {}

  enqueue(message: NotificationMessage): Effect.Effect<void, Error, never> {
    return Effect.tryPromise({
      try: async () => {
        await this.queue.send(JSON.stringify(message));
      },
      catch: (error) => (error instanceof Error ? error : new Error(String(error))),
    });
  }
}

export class NotificationQueueConsumer {
  constructor(
    private readonly db: D1Database,
    private readonly botService: ServiceBinding
  ) {}

  async processBatch(batch: MessageBatch): Promise<void> {
    for (const message of batch.messages) {
      const body = JSON.parse(message.body as string) as NotificationMessage;
      try {
        await this.processMessage(body);
        message.ack();
      } catch (error) {
        console.error(`Failed to process notification ${body.notificationId}:`, error);
        message.retry();
      }
    }
  }

  private async processMessage(msg: NotificationMessage): Promise<void> {
    const notification = await this.db.prepare("SELECT * FROM notifications WHERE id = ?").bind(msg.notificationId).first();
    if (!notification) return;

    const status = String((notification as Record<string, unknown>).status);
    if (status === "delivered" || status === "dlq") return;

    await this.db.prepare("UPDATE notifications SET status = 'processing', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(msg.notificationId).run();

    try {
      const response = await this.botService.fetch(new Request("http://bot/send-notification", {
        method: "POST",
        body: JSON.stringify({ userId: msg.userId, type: msg.type, payload: msg.payload }),
        headers: { "Content-Type": "application/json" },
      }));

      if (response.ok) {
        await this.db.prepare("UPDATE notifications SET status = 'delivered', delivered_at = CURRENT_TIMESTAMP WHERE id = ?").bind(msg.notificationId).run();
      } else {
        const errorText = await response.text();
        await this.db.prepare("UPDATE notifications SET status = 'failed', last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(errorText, msg.notificationId).run();
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.db.prepare("UPDATE notifications SET status = 'failed', last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(errorMessage, msg.notificationId).run();
    }
  }
}
