import { describe, expect, test } from "bun:test";
import {
  categorizePost,
  defaultTagForChannel,
  FEED_CONTENT_TAGS,
} from "./categorize";

describe("defaultTagForChannel", () => {
  test("maps engineering-ish channel names", () => {
    expect(defaultTagForChannel("#backend-platform")).toBe("engineering");
    expect(defaultTagForChannel("dev-tools")).toBe("engineering");
  });

  test("maps design and culture channels", () => {
    expect(defaultTagForChannel("design-system")).toBe("design");
    expect(defaultTagForChannel("watercooler")).toBe("culture");
  });

  test("returns null for unknown channels", () => {
    expect(defaultTagForChannel("general")).toBeNull();
  });
});

describe("categorizePost", () => {
  test("uses channel default as tier-1 signal", () => {
    expect(
      categorizePost({ channelName: "eng-backend", text: "hello" }),
    ).toContain("engineering");
  });

  test("honors explicit channelDefaultTag override", () => {
    expect(
      categorizePost({
        channelName: "random",
        channelDefaultTag: "wins",
        text: "shipped",
      }),
    ).toContain("wins");
  });

  test("extracts canonical hashtags and keyword tags", () => {
    const tags = categorizePost({
      text: "We shipped a pull request today #engineering #custom-tag",
    });
    expect(tags).toContain("engineering");
    expect(tags).toContain("wins");
    expect(tags).toContain("custom-tag");
  });

  test("adds emoji reaction tags", () => {
    const tags = categorizePost({
      text: "nice",
      reactionNames: ["rocket", "palette"],
    });
    expect(tags).toContain("wins");
    expect(tags).toContain("design");
  });

  test("deduplicates tags across tiers", () => {
    const tags = categorizePost({
      channelName: "eng",
      text: "deploy the api #engineering",
      reactionNames: ["python"],
    });
    expect(tags.filter((t) => t === "engineering")).toHaveLength(1);
  });

  test("canonical feed tags stay stable", () => {
    expect(FEED_CONTENT_TAGS).toContain("engineering");
    expect(FEED_CONTENT_TAGS).toContain("announcement");
  });
});
