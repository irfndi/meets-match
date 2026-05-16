#!/usr/bin/env tsx
/**
 * Seed the dev D1 database with test user profiles for local/testing.
 * Run: npx tsx scripts/seed-dev-db.ts [count] [db_name] [env]
 * Example: npx tsx scripts/seed-dev-db.ts 100 meetsmatch-dev dev
 */

import { execSync } from "child_process";
import { writeFileSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const GENDERS = ["male", "female", "non-binary", "other", "prefer_not_to_say"] as const;
const INTERESTS_POOL = [
  "hiking", "photography", "cooking", "gaming", "reading", "travel", "music",
  "fitness", "yoga", "movies", "technology", "art", "dancing", "pets", "coffee",
  "writing", "sports", "meditation", "fashion", "foodie", "board_games", "nature",
  "coding", "startup", "investing", "crypto", "ai", "design", "marketing",
];

const FIRST_NAMES: Record<string, string[]> = {
  male: ["Ahmad", "Budi", "Dedi", "Eko", "Fajar", "Hadi", "Irfan", "Joko", "Kevin", "Lukman", "Michael", "Niko", "Oscar", "Rizal", "Surya", "Teguh", "Umar", "Vino", "Wahyu", "Yusuf", "Zain", "Adi", "Benny", "Candra", "Dani", "Fahri", "Gilang", "Hendra", "Ivan", "Jefri"],
  female: ["Alya", "Bella", "Citra", "Dewi", "Eva", "Fani", "Gita", "Hana", "Indah", "Jasmine", "Kartika", "Lestari", "Maya", "Nadia", "Olivia", "Putri", "Rina", "Sari", "Tina", "Ulfa", "Vania", "Wulan", "Yuni", "Zahra", "Anisa", "Dina", "Eka", "Fitri", "Intan", "Kirana"],
  "non-binary": ["Alex", "Riley", "Jordan", "Casey", "Avery", "Quinn", "Skyler", "Dakota", "Reese", "Morgan", "Taylor", "Sage", "Rowan", "Emerson", "River", "Phoenix", "Eden", "Remi", "Frankie", "Kai"],
  other: ["Sam", "Jamie", "Robin", "Charlie", "Pat", "Chris", "Drew", "Kris", "Leslie", "Terry"],
  "prefer_not_to_say": ["User", "Person", "Human", "Someone", "Friend"],
};

const LAST_NAMES = ["Santoso", "Wijaya", "Putra", "Dewi", "Kusuma", "Pratama", "Sari", "Hidayat", "Nugroho", "Lestari", "Ramadhan", "Setiawan", "Saputra", "Anggraini", "Purnama", ""];

const BIOS = [
  "Coffee addict ☕ | Weekend hiker 🥾 | Dog lover 🐕",
  "Software engineer by day, musician by night 🎸",
  "Foodie exploring Jakarta's best street food 🍜",
  "Yoga enthusiast 🧘 | Plant mom 🌿 | Bookworm 📚",
  "Digital nomad | Currently in Bali 🏝️",
  "Gamer 🎮 | Anime fan | Looking for player 2",
  "Fitness coach 💪 | Healthy lifestyle advocate",
  "Travel photographer 📸 | 20 countries and counting",
  "Startup founder | AI enthusiast 🤖",
  "Home cook 👨‍🍳 | Always experimenting in the kitchen",
  "Nature lover 🌲 | Camping under the stars ⛺",
  "Art director | Minimalist aesthetic 🎨",
  "Cat person 🐈 | Introvert | Tea over coffee",
  "Dancer 💃 | Salsa & bachata | Let's groove",
  "Investor 📈 | Crypto curious | Financial freedom",
  "Movie buff 🎬 | Marvel fan | Cinema every weekend",
  "Meditation practitioner 🧘‍♂️ | Mindfulness coach",
  "Sports fanatic ⚽ | Playing futsal every Sunday",
  "Fashion designer 👗 | Sustainable fashion advocate",
  "Board game geek 🎲 | D&D player | Strategy games",
];

interface SeedUser {
  id: string;
  username: string;
  first_name: string;
  last_name: string;
  bio: string;
  age: number;
  birth_date: string;
  gender: string;
  interests: string[];
  media_urls: string[];
  location: { latitude: number; longitude: number };
  preferences: {
    minAge: number;
    maxAge: number;
    maxDistance: number;
    genderPreference: string[];
  };
  is_active: number;
  is_profile_complete: number;
  subscription_tier: string;
}

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickN<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, n);
}

function generateBirthDate(age: number): string {
  const now = new Date();
  const year = now.getFullYear() - age;
  const month = randInt(1, 12);
  const day = randInt(1, 28);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function generateLocation(baseLat: number, baseLng: number, radiusKm: number) {
  const r = radiusKm / 111;
  const u = Math.random();
  const v = Math.random();
  const w = r * Math.sqrt(u);
  const t = 2 * Math.PI * v;
  const lat = baseLat + w * Math.cos(t);
  const lng = baseLng + w * Math.sin(t) / Math.cos(baseLat * (Math.PI / 180));
  return { latitude: parseFloat(lat.toFixed(6)), longitude: parseFloat(lng.toFixed(6)) };
}

function generateUser(index: number, baseLocation: { lat: number; lng: number }): SeedUser {
  const gender = rand(GENDERS);
  const names = FIRST_NAMES[gender] ?? FIRST_NAMES.male;
  const firstName = rand(names);
  const lastName = rand(LAST_NAMES);
  const age = randInt(20, 45);

  const genderPrefMap: Record<string, string[]> = {
    male: Math.random() > 0.1 ? ["female"] : ["female", "non-binary"],
    female: Math.random() > 0.1 ? ["male"] : ["male", "non-binary"],
    "non-binary": ["male", "female", "non-binary"],
    other: ["male", "female", "non-binary", "other"],
    "prefer_not_to_say": ["male", "female"],
  };

  const location = generateLocation(baseLocation.lat, baseLocation.lng, 30);

  return {
    id: String(100000 + index),
    username: `${firstName.toLowerCase()}${randInt(10, 99)}`,
    first_name: firstName,
    last_name: lastName,
    bio: rand(BIOS),
    age,
    birth_date: generateBirthDate(age),
    gender,
    interests: pickN(INTERESTS_POOL, randInt(3, 7)),
    media_urls: [`https://meetsmatch-media.irfndi.workers.dev/avatar_${(index % 20) + 1}.jpg`],
    location,
    preferences: {
      minAge: Math.max(18, age - randInt(3, 8)),
      maxAge: Math.min(60, age + randInt(3, 8)),
      maxDistance: rand([10, 20, 30, 50, 100]),
      genderPreference: genderPrefMap[gender] ?? ["male", "female"],
    },
    is_active: 1,
    is_profile_complete: 1,
    subscription_tier: rand(["free", "free", "free", "free", "premium", "premium_plus"]),
  };
}

function userToSql(u: SeedUser): string {
  const values = [
    u.id,
    u.username,
    u.first_name,
    u.last_name,
    u.bio.replace(/'/g, "''"),
    u.age,
    u.birth_date,
    u.gender,
    JSON.stringify(u.interests),
    JSON.stringify(u.media_urls),
    JSON.stringify(u.location),
    JSON.stringify(u.preferences),
    u.is_active,
    0, // is_sleeping
    u.is_profile_complete,
    "NULL", // phone_number
    "en", // language
    "datetime('now')", // last_active
    u.subscription_tier,
    "NULL", // subscription_expires_at
    0, // hidden_from_matches
    "datetime('now')", // daily_swipes_reset_at
  ];

  return `(${values.map((v) => (typeof v === "string" && v !== "NULL" && !v.startsWith("datetime")
    ? `'${v}'`
    : v,
  )).join(", ")})`;
}

function main() {
  const count = Number(process.argv[2] ?? 100);
  const dbName = process.argv[3] ?? "meetsmatch-dev";
  const env = process.argv[4] ?? "dev";

  // Base location: Jakarta
  const baseLocation = { lat: -6.2088, lng: 106.8456 };

  const users: SeedUser[] = [];
  for (let i = 0; i < count; i++) {
    users.push(generateUser(i, baseLocation));
  }

  // Create a "test user" at a known ID that's easy to interact with
  users[0] = {
    ...users[0],
    id: "999999",
    username: "testuser",
    first_name: "Test",
    last_name: "User",
    age: 28,
    birth_date: "1997-06-15",
    gender: "male",
    bio: "Test account for dev 🧪 | Coffee + Code",
    interests: ["coding", "gaming", "coffee"],
    location: { latitude: -6.2088, longitude: 106.8456 },
    preferences: {
      minAge: 20,
      maxAge: 35,
      maxDistance: 50,
      genderPreference: ["female"],
    },
    subscription_tier: "free",
  };

  const columns = [
    "id", "username", "first_name", "last_name", "bio", "age", "birth_date",
    "gender", "interests", "media_urls", "location", "preferences", "is_active",
    "is_sleeping", "is_profile_complete", "phone_number", "language", "last_active",
    "subscription_tier", "subscription_expires_at", "hidden_from_matches", "daily_swipes_reset_at",
  ];

  const tmpDir = mkdtempSync(join(tmpdir(), "seed-"));
  const CHUNK_SIZE = 25;
  let totalInserted = 0;

  for (let i = 0; i < users.length; i += CHUNK_SIZE) {
    const chunk = users.slice(i, i + CHUNK_SIZE);
    const values = chunk.map(userToSql).join(",\n");
    const sql = `INSERT INTO users (${columns.join(", ")}) VALUES\n${values};`;

    const sqlFile = join(tmpDir, `chunk_${i}.sql`);
    writeFileSync(sqlFile, sql);

    try {
      const out = execSync(
        `cd services/cf-api && npx wrangler d1 execute ${dbName} --env ${env} --remote --file ${sqlFile}`,
        { encoding: "utf-8", timeout: 120000 },
      );
      console.log(out.trim());
      totalInserted += chunk.length;
    } catch (e: any) {
      console.error(`Chunk ${i / CHUNK_SIZE + 1} failed:`, e.stderr ?? e.message);
      rmSync(tmpDir, { recursive: true, force: true });
      process.exit(1);
    }
  }

  rmSync(tmpDir, { recursive: true, force: true });
  console.log(`\n✅ Seeded ${totalInserted} users into ${dbName} (${env})`);
}

main();
