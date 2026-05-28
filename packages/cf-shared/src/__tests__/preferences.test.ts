import { describe, it, expect } from "vitest";
import {
  computeDefaultPreferences,
  computeAgeFromBirthDate,
} from "../preferences.js";

describe("computeAgeFromBirthDate", () => {
  it("computes age from ISO birthDate", () => {
    const birthYear = new Date().getFullYear() - 25;
    const age = computeAgeFromBirthDate(`${birthYear}-01-01`);
    expect(age).toBe(25);
  });

  it("computes age from DD.MM.YYYY birthDate", () => {
    const birthYear = new Date().getFullYear() - 30;
    const age = computeAgeFromBirthDate(`15.01.${birthYear}`);
    expect(age).toBe(30);
  });

  it("returns undefined for invalid format", () => {
    expect(computeAgeFromBirthDate("not-a-date")).toBeUndefined();
  });

  it("returns undefined for out-of-range ages", () => {
    const tooOld = `${new Date().getFullYear() - 100}-01-01`;
    expect(computeAgeFromBirthDate(tooOld)).toBeUndefined();
  });
});

describe("computeDefaultPreferences", () => {
  it("returns opposite-sex preference for male users", () => {
    const result = computeDefaultPreferences({ gender: "male", age: 25 });
    expect(result.genderPreference).toEqual(["female"]);
    expect(result.minAge).toBe(18);
    expect(result.maxAge).toBe(32);
    expect(result.maxDistance).toBe(25);
  });

  it("returns opposite-sex preference for female users", () => {
    const result = computeDefaultPreferences({ gender: "female", age: 30 });
    expect(result.genderPreference).toEqual(["male"]);
    expect(result.minAge).toBe(23);
    expect(result.maxAge).toBe(37);
  });

  it("returns all-genders for 'other' gender", () => {
    const result = computeDefaultPreferences({ gender: "other", age: 28 });
    expect(result.genderPreference).toEqual([
      "male",
      "female",
      "other",
      "prefer_not_to_say",
    ]);
  });

  it("returns all-genders for 'prefer_not_to_say' gender", () => {
    const result = computeDefaultPreferences({
      gender: "prefer_not_to_say",
      age: 28,
    });
    expect(result.genderPreference).toEqual([
      "male",
      "female",
      "other",
      "prefer_not_to_say",
    ]);
  });

  it("clamps age bounds to 12–80", () => {
    const young = computeDefaultPreferences({ gender: "male", age: 15 });
    expect(young.minAge).toBe(12);
    expect(young.maxAge).toBe(22);

    const old = computeDefaultPreferences({ gender: "male", age: 78 });
    expect(old.minAge).toBe(71);
    expect(old.maxAge).toBe(80);
  });

  it("falls back to birthDate when age is missing", () => {
    const birthYear = new Date().getFullYear() - 25;
    const result = computeDefaultPreferences({
      gender: "male",
      birthDate: `${birthYear}-01-01`,
    });
    expect(result.minAge).toBe(18);
    expect(result.maxAge).toBe(32);
  });

  it("returns only maxDistance when neither age nor gender is present", () => {
    const result = computeDefaultPreferences({});
    expect(result.genderPreference).toBeUndefined();
    expect(result.minAge).toBeUndefined();
    expect(result.maxAge).toBeUndefined();
    expect(result.maxDistance).toBe(25);
  });

  it("clamps minAge at 12 for very young users", () => {
    const result = computeDefaultPreferences({ gender: "male", age: 12 });
    expect(result.minAge).toBe(12);
  });

  it("clamps maxAge at 80 for very old users", () => {
    const result = computeDefaultPreferences({ gender: "female", age: 80 });
    expect(result.maxAge).toBe(80);
  });
});

describe("computeAgeFromBirthDate — edge cases", () => {
  it("returns undefined for invalid ISO date like 2023-02-30", () => {
    expect(computeAgeFromBirthDate("2023-02-30")).toBeUndefined();
  });

  it("returns undefined for invalid DD.MM.YYYY date like 31.02.2000", () => {
    expect(computeAgeFromBirthDate("31.02.2000")).toBeUndefined();
  });

  it("returns undefined when age would be less than 12", () => {
    const futureYear = new Date().getFullYear() - 10;
    expect(computeAgeFromBirthDate(`${futureYear}-01-01`)).toBeUndefined();
  });

  it("returns undefined when age would be greater than 80", () => {
    const oldYear = new Date().getFullYear() - 90;
    expect(computeAgeFromBirthDate(`${oldYear}-01-01`)).toBeUndefined();
  });

  it("computes exact boundary age 12", () => {
    const birthYear = new Date().getFullYear() - 12;
    const age = computeAgeFromBirthDate(`${birthYear}-01-01`);
    expect(age).toBe(12);
  });

  it("computes exact boundary age 80", () => {
    const birthYear = new Date().getFullYear() - 80;
    const age = computeAgeFromBirthDate(`${birthYear}-01-01`);
    expect(age).toBe(80);
  });

  it("returns undefined for empty string", () => {
    expect(computeAgeFromBirthDate("")).toBeUndefined();
  });

  it("returns undefined for only whitespace", () => {
    expect(computeAgeFromBirthDate("   ")).toBeUndefined();
  });

  it("returns undefined for DD.MM.YYYY where DD or MM is single-digit", () => {
    const birthYear = new Date().getFullYear() - 25;
    expect(computeAgeFromBirthDate(`1.1.${birthYear}`)).toBeUndefined();
    expect(computeAgeFromBirthDate(`01.1.${birthYear}`)).toBeUndefined();
    expect(computeAgeFromBirthDate(`1.01.${birthYear}`)).toBeUndefined();
  });

  it("computes age from DD.MM.YYYY with spaces around it", () => {
    const birthYear = new Date().getFullYear() - 30;
    const age = computeAgeFromBirthDate(` 15.01.${birthYear} `);
    expect(age).toBe(30);
  });

  it("returns undefined for DD.MM.YYYY with out-of-bounds month", () => {
    const birthYear = new Date().getFullYear() - 25;
    expect(computeAgeFromBirthDate(`15.13.${birthYear}`)).toBeUndefined();
  });

  it("returns undefined for DD.MM.YYYY with out-of-bounds day", () => {
    const birthYear = new Date().getFullYear() - 25;
    expect(computeAgeFromBirthDate(`32.01.${birthYear}`)).toBeUndefined();
  });
});

describe("computeDefaultPreferences — with birthDate", () => {
  it("uses birthDate when age is missing for female", () => {
    const birthYear = new Date().getFullYear() - 28;
    const result = computeDefaultPreferences({
      gender: "female",
      birthDate: `${birthYear}-01-01`,
    });
    expect(result.genderPreference).toEqual(["male"]);
    expect(result.minAge).toBe(21);
    expect(result.maxAge).toBe(35);
  });

  it("uses birthDate when age is missing for other gender", () => {
    const birthYear = new Date().getFullYear() - 22;
    const result = computeDefaultPreferences({
      gender: "other",
      birthDate: `${birthYear}-01-01`,
    });
    expect(result.genderPreference).toEqual([
      "male",
      "female",
      "other",
      "prefer_not_to_say",
    ]);
    expect(result.minAge).toBe(15);
    expect(result.maxAge).toBe(29);
  });

  it("prefers explicit age over birthDate", () => {
    const birthYear = new Date().getFullYear() - 25;
    const result = computeDefaultPreferences({
      gender: "male",
      age: 40,
      birthDate: `${birthYear}-01-01`,
    });
    expect(result.minAge).toBe(33);
    expect(result.maxAge).toBe(47);
  });
});
