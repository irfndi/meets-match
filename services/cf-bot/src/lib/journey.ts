import { Schema } from "effect";
import { createLogger } from "@meetsmatch/cf-shared";

const log = createLogger("cf-bot");

const JOURNEY_TTL_SECONDS = 60 * 60 * 24 * 2; // 2 days
const JOURNEY_MAX_EVENTS = 20;

export interface JourneyEvent {
  ts: string;
  action: string;
  detail?: string;
  targetId?: string;
}

export interface UserJourney {
  events: JourneyEvent[];
  lastErrorAt?: string;
  lastErrorTrace?: string;
}

const JourneyEventSchema = Schema.Struct({
  ts: Schema.String,
  action: Schema.String,
  detail: Schema.optional(Schema.String),
  targetId: Schema.optional(Schema.String),
});

const UserJourneySchema = Schema.Struct({
  events: Schema.optional(Schema.Array(JourneyEventSchema)),
  lastErrorAt: Schema.optional(Schema.String),
  lastErrorTrace: Schema.optional(Schema.String),
});

export async function getJourney(
  kv: KVNamespace,
  userId: string,
): Promise<UserJourney> {
  const raw = await kv.get(`journey:${userId}`);
  if (!raw) return { events: [] };
  try {
    const option = Schema.decodeUnknownOption(UserJourneySchema)(
      JSON.parse(raw),
    );
    if (option._tag !== "Some") return { events: [] };
    const value = option.value;
    return {
      events: value.events ? [...value.events] : [],
      lastErrorAt: value.lastErrorAt,
      lastErrorTrace: value.lastErrorTrace,
    };
  } catch {
    return { events: [] };
  }
}

export async function recordJourneyEvent(
  kv: KVNamespace,
  userId: string,
  event: Omit<JourneyEvent, "ts">,
): Promise<void> {
  try {
    // Note: KV is eventually consistent; concurrent events may race.
    // Journey data is best-effort telemetry, not critical state.
    const journey = await getJourney(kv, userId);
    journey.events.push({ ts: new Date().toISOString(), ...event });
    if (journey.events.length > JOURNEY_MAX_EVENTS) {
      journey.events = journey.events.slice(-JOURNEY_MAX_EVENTS);
    }
    await kv.put(`journey:${userId}`, JSON.stringify(journey), {
      expirationTtl: JOURNEY_TTL_SECONDS,
    });
  } catch (error) {
    log.error(
      "recordJourneyEvent",
      "Failed to record journey",
      { userId },
      error,
    );
  }
}

export async function recordJourneyError(
  kv: KVNamespace,
  userId: string,
  traceId: string,
): Promise<void> {
  try {
    // Note: KV read-modify-write race possible. Best-effort telemetry.
    const journey = await getJourney(kv, userId);
    journey.lastErrorAt = new Date().toISOString();
    journey.lastErrorTrace = traceId;
    await kv.put(`journey:${userId}`, JSON.stringify(journey), {
      expirationTtl: JOURNEY_TTL_SECONDS,
    });
  } catch (error) {
    log.error(
      "recordJourneyError",
      "Failed to record error",
      { userId },
      error,
    );
  }
}

export function formatJourneyForReport(journey: UserJourney): string {
  if (!journey.events.length) return "No recent activity recorded.";
  const lines = journey.events.slice(-10).map((e) => {
    const tsValid = !Number.isNaN(Date.parse(e.ts));
    const time = tsValid
      ? new Date(e.ts).toISOString().slice(11, 19)
      : "invalid time";
    const detail = e.detail ? ` (${e.detail})` : "";
    const target = e.targetId ? ` → ${e.targetId}` : "";
    return `${time} ${e.action}${detail}${target}`;
  });
  return lines.join("\n");
}

export function generateTraceId(): string {
  return crypto.randomUUID().slice(0, 8).toUpperCase();
}
