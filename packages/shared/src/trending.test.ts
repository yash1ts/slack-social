import { describe, expect, test } from "bun:test";
import {
  computeScore,
  reactionWeight,
  weightedReactionPoints,
  slackTsToMs,
  msToSlackTs,
} from "./trending";

describe("reactionWeight", () => {
  test("high-signal emojis score 3", () => {
    expect(reactionWeight("fire")).toBe(3);
    expect(reactionWeight("rocket::skin-tone-2")).toBe(3);
    expect(reactionWeight("TADA")).toBe(3);
  });

  test("low-value admin ticks score 0.35", () => {
    expect(reactionWeight("white_check_mark")).toBe(0.35);
    expect(reactionWeight("+1")).toBe(0.35);
    expect(reactionWeight("eyes")).toBe(0.35);
  });

  test("unknown reactions default to 1", () => {
    expect(reactionWeight("custom_emoji")).toBe(1);
  });
});

describe("weightedReactionPoints", () => {
  test("sums count * weight", () => {
    expect(
      weightedReactionPoints([
        { name: "fire", count: 2 },
        { name: "eyes", count: 4 },
      ]),
    ).toBeCloseTo(2 * 3 + 4 * 0.35);
  });
});

describe("computeScore", () => {
  const postedAtMs = Date.UTC(2026, 0, 1, 12, 0, 0);
  const nowMs = postedAtMs + 2 * 3_600_000; // ageHours = 2 → denominator (2+2)^1.5 = 8

  test("returns 0 when there is no engagement", () => {
    expect(
      computeScore({ replyCount: 0, hasMedia: false, postedAtMs, nowMs }),
    ).toBe(0);
  });

  test("uses weighted reactions when provided", () => {
    // points = 3 + 8 + 5 = 16 → 16 / 8 = 2
    const score = computeScore({
      reactions: [{ name: "fire", count: 1 }],
      replyCount: 1,
      hasMedia: true,
      postedAtMs,
      nowMs,
      gravity: 1.5,
    });
    expect(score).toBeCloseTo(2);
  });

  test("falls back to reactionCount when reactions empty", () => {
    // points = 4 → 4 / 8 = 0.5
    const score = computeScore({
      reactionCount: 4,
      replyCount: 0,
      hasMedia: false,
      postedAtMs,
      nowMs,
      gravity: 1.5,
    });
    expect(score).toBeCloseTo(0.5);
  });

  test("higher gravity decays older posts more", () => {
    const base = {
      reactionCount: 10,
      replyCount: 0,
      hasMedia: false,
      postedAtMs,
      nowMs,
    };
    const soft = computeScore({ ...base, gravity: 1 });
    const hard = computeScore({ ...base, gravity: 2 });
    expect(hard).toBeLessThan(soft);
  });

  test("clamps negative age to zero", () => {
    const score = computeScore({
      reactionCount: 4,
      replyCount: 0,
      hasMedia: false,
      postedAtMs: nowMs + 10_000,
      nowMs,
      gravity: 1,
    });
    // ageHours=0 → points 4 / 2^1 = 2
    expect(score).toBeCloseTo(2);
  });
});

describe("slack timestamp helpers", () => {
  test("round-trips seconds portion", () => {
    const ms = 1_700_000_000_500;
    expect(slackTsToMs(msToSlackTs(ms))).toBe(1_700_000_000_000);
  });
});
