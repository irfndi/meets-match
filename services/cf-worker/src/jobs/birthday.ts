import type { Env } from "../index.js";

export async function runBirthdayJob(env: Env): Promise<void> {
  console.log("[birthday] Starting birthday notification job");

  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  try {
    // Find all users whose birthday is today
    // birth_date is stored as YYYY-MM-DD, so we match MM-DD suffix
    const { results } = await env.DB.prepare(
      `SELECT id, first_name, birth_date FROM users
       WHERE is_active = 1
       AND birth_date IS NOT NULL
       AND substr(birth_date, 6, 5) = ?`,
    )
      .bind(`${month}-${day}`)
      .all();

    const birthdayUsers = results ?? [];
    console.log(`[birthday] Found ${birthdayUsers.length} birthday(s) today`);

    // Update age column for birthday users so cached ages stay current
    for (const user of birthdayUsers) {
      const birthdayUserId = String((user as Record<string, unknown>).id);
      const birthDate = String((user as Record<string, unknown>).birth_date);
      const birthYear = parseInt(birthDate.slice(0, 4), 10);
      const birthMonth = parseInt(birthDate.slice(5, 7), 10);
      const birthDay = parseInt(birthDate.slice(8, 10), 10);
      const today = new Date();
      let age = today.getFullYear() - birthYear;
      const m = today.getMonth() + 1 - birthMonth;
      if (m < 0 || (m === 0 && today.getDate() < birthDay)) {
        age--;
      }
      try {
        await env.DB.prepare("UPDATE users SET age = ? WHERE id = ?")
          .bind(age, birthdayUserId)
          .run();
        console.log(`[birthday] Updated age to ${age} for ${birthdayUserId}`);
      } catch (error) {
        console.error(`[birthday] Failed to update age for ${birthdayUserId}:`, error);
      }
    }

    for (const user of birthdayUsers) {
      const birthdayUserId = String((user as Record<string, unknown>).id);
      const firstName = String(
        (user as Record<string, unknown>).first_name || "Someone",
      );

      try {
        // Find mutual matches for this user (only active, non-sleeping users)
        const { results: matches } = await env.DB.prepare(
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
          .all();

        const matchIds = (matches ?? []).map((m) =>
          String((m as Record<string, unknown>).match_user_id),
        );
        console.log(
          `[birthday] ${firstName} has ${matchIds.length} mutual match(es)`,
        );

        // Notify each match
        for (const matchUserId of matchIds) {
          try {
            const safeName = firstName.replace(
              /[_*\[\]`\.!#+\-={}|~()><\\]/g,
              "\\$&",
            );
            const response = await env.API_SERVICE.fetch(
              new Request("http://api/notifications", {
                method: "POST",
                body: JSON.stringify({
                  userId: matchUserId,
                  type: "BIRTHDAY",
                  channel: "TELEGRAM",
                  payload: JSON.stringify({
                    message: `🎂 *It's ${safeName}'s birthday today!*\n\nSend them a message and make their day special! 💕`,
                  }),
                }),
                headers: { "Content-Type": "application/json" },
              }),
            );

            if (response.ok) {
              console.log(
                `[birthday] Notified ${matchUserId} about ${firstName}'s birthday`,
              );
            } else {
              console.error(
                `[birthday] Failed to notify ${matchUserId}: ${response.status}`,
              );
            }
          } catch (error) {
            console.error(`[birthday] Error notifying ${matchUserId}:`, error);
          }
        }
      } catch (error) {
        console.error(`[birthday] Error processing ${birthdayUserId}:`, error);
      }
    }

    console.log("[birthday] Job complete");
  } catch (error) {
    console.error("[birthday] Job failed:", error);
  }
}
