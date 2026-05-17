import { describe, it, expect } from "vitest";
import {
  computeDefaultPreferences,
  computeAgeFromBirthDate,
} from "../preferences.js";

describe("computeAgeFromBirthDate", () => {
  it("computes age from ISO birthDate", () => {
    const birthYear = new Date().getFullYear() - 25;
    const age = computeAgeFromBirthDate(`${birthYear}-01-15`);
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
      birthDate: `${birthYear}-01-15`,
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
});
