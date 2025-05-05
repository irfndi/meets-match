import { relations, sql } from "drizzle-orm";
import {
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  telegramId: integer("telegram_id").notNull().unique(),
  telegramUsername: text("telegram_username"), // Can be null if user hides it
  status: text("status", { enum: ["active", "inactive", "banned", "deleted"] })
    .notNull()
    .default("active"),
  // Use SQLite specific function for default timestamp in milliseconds
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(cast(strftime('%s', 'now') as integer) * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(cast(strftime('%s', 'now') as integer) * 1000)`)
    .$onUpdate(() => new Date()),
});

export const profiles = sqliteTable("profiles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" })
    .unique(),
  name: text("name").notNull(),
  gender: text("gender", { enum: ["male", "female"] }).notNull(),
  preferenceGender: text("preference_gender", {
    enum: ["male", "female", "both"],
  }).notNull(),
  age: integer("age").notNull(),
  bio: text("bio"),
  city: text("city"),
  country: text("country"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  interests: text("interests"), // Store as comma-separated string or JSON
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(cast(strftime('%s', 'now') as integer) * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(cast(strftime('%s', 'now') as integer) * 1000)`)
    .$onUpdate(() => new Date()),
});

export const media = sqliteTable("media", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  profileId: integer("profile_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  fileId: text("file_id").notNull(), // Telegram file ID or storage key (e.g., R2)
  fileType: text("file_type", { enum: ["photo", "video"] }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(cast(strftime('%s', 'now') as integer) * 1000)`),
  deleteAt: integer("delete_at", { mode: "timestamp_ms" }), // For scheduled deletion 180 days later
});

export const interactions = sqliteTable("interactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  actorUserId: integer("actor_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  targetUserId: integer("target_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: text("type", { enum: ["like", "dislike", "report"] }).notNull(),
  reportReason: text("report_reason"), // Only applicable if type is 'report'
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(cast(strftime('%s', 'now') as integer) * 1000)`),
});

export const matches = sqliteTable(
  "matches",
  {
    user1Id: integer("user1_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    user2Id: integer("user2_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(cast(strftime('%s', 'now') as integer) * 1000)`),
  },
  (table) => {
    return {
      // Ensure user1Id < user2Id to prevent duplicate pairs (userA, userB) and (userB, userA)
      pk: primaryKey({ columns: [table.user1Id, table.user2Id] }),
      // We might need a check constraint or handle this logic application-side
    };
  }
);

// --- Relations ---

export const usersRelations = relations(users, ({ one, many }) => ({
  profile: one(profiles, {
    fields: [users.id],
    references: [profiles.userId],
  }),
  initiatedInteractions: many(interactions, { relationName: "actor" }),
  receivedInteractions: many(interactions, { relationName: "target" }),
  matchesAsUser1: many(matches, { relationName: "user1" }),
  matchesAsUser2: many(matches, { relationName: "user2" }),
}));

export const profilesRelations = relations(profiles, ({ one, many }) => ({
  user: one(users, {
    fields: [profiles.userId],
    references: [users.id],
  }),
  media: many(media),
}));

export const mediaRelations = relations(media, ({ one }) => ({
  profile: one(profiles, {
    fields: [media.profileId],
    references: [profiles.id],
  }),
}));

export const interactionsRelations = relations(interactions, ({ one }) => ({
  actor: one(users, {
    fields: [interactions.actorUserId],
    references: [users.id],
    relationName: "actor",
  }),
  target: one(users, {
    fields: [interactions.targetUserId],
    references: [users.id],
    relationName: "target",
  }),
}));

export const matchesRelations = relations(matches, ({ one }) => ({
  user1: one(users, {
    fields: [matches.user1Id],
    references: [users.id],
    relationName: "user1",
  }),
  user2: one(users, {
    fields: [matches.user2Id],
    references: [users.id],
    relationName: "user2",
  }),
}));

// --- Types ---

export type User = typeof users.$inferSelect; // return type when queried
export type NewUser = typeof users.$inferInsert; // insert type

export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;

export type Media = typeof media.$inferSelect;
export type NewMedia = typeof media.$inferInsert;

export type Interaction = typeof interactions.$inferSelect;
export type NewInteraction = typeof interactions.$inferInsert;

export type Match = typeof matches.$inferSelect;
export type NewMatch = typeof matches.$inferInsert;
