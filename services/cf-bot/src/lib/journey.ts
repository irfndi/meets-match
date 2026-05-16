import type { Env } from "../index.js";
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

function safeJsonParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export async function getJourney(
  kv: KVNamespace,
  userId: string,
): Promise<UserJourney> {
  const raw = await kv.get(`journey:${userId}`);
  return safeJsonParse(raw, { events: [] });
}

export async function recordJourneyEvent(
  kv: KVNamespace,
  userId: string,
  event: Omit<JourneyEvent, "ts">,
): Promise<void> {
  try {
    const journey = await getJourney(kv, userId);
    journey.events.push({ ts: new Date().toISOString(), ...event });
    if (journey.events.length > JOURNEY_MAX_EVENTS) {
      journey.events = journey.events.slice(-JOURNEY_MAX_EVENTS);
    }
    await kv.put(`journey:${userId}`, JSON.stringify(journey), {
      expirationTtl: JOURNEY_TTL_SECONDS,
    });
  } catch (error) {
    log.error("recordJourneyEvent", "Failed to record journey", { userId }, error);
  }
}

export async function recordJourneyError(
  kv: KVNamespace,
  userId: string,
  traceId: string,
): Promise<void> {
  try {
    const journey = await getJourney(kv, userId);
    journey.lastErrorAt = new Date().toISOString();
    journey.lastErrorTrace = traceId;
    await kv.put(`journey:${userId}`, JSON.stringify(journey), {
      expirationTtl: JOURNEY_TTL_SECONDS,
    });
  } catch (error) {
    log.error("recordJourneyError", "Failed to record error", { userId }, error);
  }
}

export function formatJourneyForReport(journey: UserJourney): string {
  if (!journey.events.length) return "No recent activity recorded.";
  const lines = journey.events.slice(-10).map((e) => {
    const time = new Date(e.ts).toISOString().slice(11, 19);
    const detail = e.detail ? ` (${e.detail})` : "";
    const target = e.targetId ? ` → ${e.targetId}` : "";
    return `${time} ${e.action}${detail}${target}`;
  });
  return lines.join("\n");
}

export function generateTraceId(): string {
  const hex = () => Math.floor(Math.random() * 16).toString(16);
  return Array.from({ length: 8 }, hex).join("").toUpperCase();
}
