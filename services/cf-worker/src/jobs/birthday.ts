import { Cause, Effect, Exit } from "effect";
import type { Env } from "../index.js";
import { computeAgeFromBirthDate, createLogger } from "@meetsmatch/cf-shared";
import {
  NotificationQueueProducer,
  persistAndEnqueue,
} from "../notifications/queue.js";

const log = createLogger("cf-worker.birthday");

function escapeMd(text: string): string {
  return text.replace(/[_*\[\]`\.!#+\-={}|~()><\\]/g, "\\$&");
}

const isLeapYear = (y: number) =>
  (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

export async function runBirthdayJob(env: Env): Promise<void> {
  log.info("runBirthdayJob", "Starting birthday notification job");

  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const producer = new NotificationQueueProducer(env.NOTIFICATION_QUEUE);

  const effect = Effect.gen(function* () {
    const { results } = yield* Effect.tryPromise({
      try: () =>
        env.DB.prepare(
          `SELECT id, first_name, birth_date FROM users
           WHERE is_active = 1
           AND birth_date IS NOT NULL
           AND substr(birth_date, 6, 5) = ?`,
        )
          .bind(`${month}-${day}`)
          .all(),
      catch: (error) => new Error(`fetchBirthdays: ${String(error)}`),
    });

    const birthdayUsers = (results ?? []) as Array<Record<string, unknown>>;
    log.info(
      "runBirthdayJob",
      `Found ${birthdayUsers.length} birthday(s) today`,
    );

    let leapDayUsers: Array<Record<string, unknown>> = [];
    if (month === "02" && day === "28" && !isLeapYear(now.getFullYear())) {
      const { results: leapResults } = yield* Effect.tryPromise({
        try: () =>
          env.DB.prepare(
            `SELECT id, first_name, birth_date FROM users
             WHERE is_active = 1
             AND birth_date IS NOT NULL
             AND substr(birth_date, 6, 5) = ?`,
          )
            .bind("02-29")
            .all(),
        catch: (error) => new Error(`fetchLeapBirthdays: ${String(error)}`),
      });
      leapDayUsers = (leapResults ?? []) as Array<Record<string, unknown>>;
      log.info(
        "runBirthdayJob",
        `Found ${leapDayUsers.length} leap-day user(s) to refresh`,
      );
    }

    const ageRefreshUsers = [...birthdayUsers, ...leapDayUsers];
    yield* Effect.forEach(
      ageRefreshUsers,
      (user) => refreshAge(env, user, now),
      { concurrency: 1, discard: true },
    );

    yield* Effect.forEach(
      birthdayUsers,
      (user) => notifyMatches(env, producer, user),
      { concurrency: 1, discard: true },
    );
  });

  const exit = await Effect.runPromiseExit(effect);
  if (Exit.isFailure(exit)) {
    const failure = Cause.failureOption(exit.cause);
    if (failure._tag === "Some") {
      log.error("runBirthdayJob", "Job failed", undefined, failure.value);
    } else {
      log.error("runBirthdayJob", "Job failed (defect)", undefined, exit.cause);
    }
  } else {
    log.info("runBirthdayJob", "Job complete");
  }
}

function refreshAge(
  env: Env,
  user: Record<string, unknown>,
  today: Date,
): Effect.Effect<void, never, never> {
  return Effect.gen(function* () {
    const userId = String(user.id);
    const birthDate = String(user.birth_date);
    let age = computeAgeFromBirthDate(birthDate);
    if (age == null) return;

    const birthMonth = parseInt(birthDate.slice(5, 7), 10);
    const birthDay = parseInt(birthDate.slice(8, 10), 10);
    const isLeapDayBirth = birthMonth === 2 && birthDay === 29;
    const isFeb28NonLeap =
      today.getMonth() === 1 &&
      today.getDate() === 28 &&
      !isLeapYear(today.getFullYear());
    if (isLeapDayBirth && isFeb28NonLeap) age++;

    const exit = yield* Effect.either(
      Effect.tryPromise({
        try: () =>
          env.DB.prepare("UPDATE users SET age = ? WHERE id = ?")
            .bind(age, userId)
            .run(),
        catch: (error) => new Error(`updateAge ${userId}: ${String(error)}`),
      }),
    );
    if (exit._tag === "Right") {
      log.info("refreshAge", `Updated age to ${age} for ${userId}`);
    } else {
      log.error(
        "refreshAge",
        `Failed to update age for ${userId}`,
        undefined,
        exit.left,
      );
    }
  });
}

function notifyMatches(
  env: Env,
  producer: NotificationQueueProducer,
  user: Record<string, unknown>,
): Effect.Effect<void, never, never> {
  return Effect.gen(function* () {
    const birthdayUserId = String(user.id);
    const firstName = String(user.first_name || "Someone");

    const { results: matches } = yield* Effect.tryPromise({
      try: () =>
        env.DB.prepare(
          `SELECT
            CASE
              WHEN m.user1_id = ? THEN m.user2_id
              ELSE m.user1_id
            END as match_user_id
          FROM matches m
          JOIN users u ON u.id = CASE
            WHEN m.user1_id = ? THEN m.user2_id
            ELSE m.user1_id
          END
          WHERE m.status = 'matched'
          AND (m.user1_id = ? OR m.user2_id = ?)
          AND u.is_active = 1
          AND (u.is_sleeping = 0 OR u.is_sleeping IS NULL)`,
        )
          .bind(birthdayUserId, birthdayUserId, birthdayUserId, birthdayUserId)
          .all(),
      catch: (error) =>
        new Error(`fetchMatches ${birthdayUserId}: ${String(error)}`),
    }).pipe(Effect.orElseSucceed(() => ({ results: [] as Array<unknown> })));

    const matchIds = ((matches ?? []) as Array<Record<string, unknown>>).map(
      (m) => String(m.match_user_id),
    );
    log.info(
      "notifyMatches",
      `${firstName} has ${matchIds.length} mutual match(es)`,
    );

    const safeName = escapeMd(firstName);

    yield* Effect.forEach(
      matchIds,
      (matchUserId) =>
        Effect.gen(function* () {
          const exit = yield* Effect.either(
            persistAndEnqueue(env.DB, producer, {
              notificationId: crypto.randomUUID(),
              userId: matchUserId,
              type: "BIRTHDAY",
              payload: JSON.stringify({
                message: `🎂 *It's ${safeName}'s birthday today!*\n\nSend them a message and make their day special! 💕`,
              }),
            }),
          );
          if (exit._tag === "Right") {
            log.info(
              "notifyMatches",
              `Notified ${matchUserId} about ${firstName}'s birthday`,
            );
          } else {
            log.error(
              "notifyMatches",
              `Failed to notify ${matchUserId}`,
              undefined,
              exit.left,
            );
          }
        }),
      { concurrency: 1, discard: true },
    );
  });
}
