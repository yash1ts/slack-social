import emojiMap from "./emoji-map.json";

const STANDARD_EMOJI_UNICODE = emojiMap as Record<string, string>;

const SKIN_TONES: Record<string, string> = {
  "skin-tone-2": "🏻",
  "skin-tone-3": "🏼",
  "skin-tone-4": "🏽",
  "skin-tone-5": "🏾",
  "skin-tone-6": "🏿",
};

/** Strip Slack skin-tone suffix: thumbsup::skin-tone-2 → thumbsup */
export function baseEmojiName(name: string): string {
  return name.split("::")[0]?.toLowerCase() ?? name.toLowerCase();
}

function skinToneFor(name: string): string | null {
  const parts = name.toLowerCase().split("::");
  for (const part of parts.slice(1)) {
    if (SKIN_TONES[part]) return SKIN_TONES[part];
  }
  return null;
}

export function unicodeForEmoji(name: string): string | null {
  const base = baseEmojiName(name);
  const glyph = STANDARD_EMOJI_UNICODE[base] ?? STANDARD_EMOJI_UNICODE[name] ?? null;
  if (!glyph) return null;
  const tone = skinToneFor(name);
  // Only append skin tone when the base emoji is a single modifier-base glyph
  // (most hand/person emoji). Multi-codepoint ZWJ sequences usually already
  // include tone or shouldn't be modified naively.
  if (tone && [...glyph].length <= 2) return `${glyph}${tone}`;
  return glyph;
}

/** Full short-name → unicode catalog (for debugging / tooling). */
export { STANDARD_EMOJI_UNICODE };
