import type { Database } from "bun:sqlite";
import type { WebClient } from "@slack/web-api";
import { upsertUser } from "../db/queries";

export type SlackProfileSnapshot = {
  id: string;
  displayName: string;
  realName: string | null;
  avatarUrl: string | null;
  title: string | null;
  email: string | null;
  about: string | null;
  phone: string | null;
  statusText: string | null;
  statusEmoji: string | null;
  isBot: boolean;
};

type SlackProfileFields = Record<
  string,
  { value?: string; alt?: string; label?: string } | undefined
>;

type TeamFieldDef = {
  id?: string;
  label?: string;
  field_name?: string;
  type?: string;
  is_hidden?: boolean;
};

const ABOUT_LABEL = /^(about(\s*me)?|bio|role description)$/i;
const PHONE_LABEL = /^phone$/i;

/** Extract plain text from Slack rich_text JSON blobs used in profile fields. */
function plainFromFieldValue(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      const chunks: string[] = [];
      const walk = (node: unknown) => {
        if (!node) return;
        if (typeof node === "string") {
          chunks.push(node);
          return;
        }
        if (Array.isArray(node)) {
          for (const child of node) walk(child);
          return;
        }
        if (typeof node === "object") {
          const obj = node as Record<string, unknown>;
          if (typeof obj.text === "string") chunks.push(obj.text);
          if (Array.isArray(obj.elements)) walk(obj.elements);
        }
      };
      walk(parsed);
      const text = chunks.join("").trim();
      return text || null;
    } catch {
      // not JSON — use as plain text
    }
  }

  return trimmed;
}

function nonempty(value: string | null | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}

async function resolveAboutAndPhoneFromFields(
  client: WebClient,
  fields: SlackProfileFields | undefined,
  fallbackPhone: string | null,
): Promise<{ about: string | null; phone: string | null }> {
  let about: string | null = null;
  let phone = fallbackPhone;

  if (!fields || Object.keys(fields).length === 0) {
    return { about, phone };
  }

  let defs: TeamFieldDef[] = [];
  try {
    const teamProfile = await client.team.profile.get();
    defs = (teamProfile.profile?.fields ?? []) as TeamFieldDef[];
  } catch {
    // team.profile.get may be unavailable — use field labels embedded on values if any
  }

  const defById = new Map(defs.map((d) => [d.id, d]));

  for (const [fieldId, entry] of Object.entries(fields)) {
    if (!entry?.value) continue;
    const def = defById.get(fieldId);
    const label = def?.label || entry.label || "";
    const fieldName = def?.field_name || "";
    const value = plainFromFieldValue(entry.value);
    if (!value) continue;

    if (!about && (ABOUT_LABEL.test(label) || ABOUT_LABEL.test(fieldName))) {
      about = value;
      continue;
    }
    if (!phone && (PHONE_LABEL.test(label) || PHONE_LABEL.test(fieldName))) {
      phone = value;
    }
  }

  // If no labeled about field, use the first long_text custom field with a value
  if (!about) {
    for (const [fieldId, entry] of Object.entries(fields)) {
      const def = defById.get(fieldId);
      if (def?.type !== "long_text" || def.is_hidden) continue;
      const value = plainFromFieldValue(entry?.value);
      if (value) {
        about = value;
        break;
      }
    }
  }

  return { about, phone };
}

/**
 * Fetch a Slack user profile via users.info (+ optional users.profile.get)
 * and cache into SQLite. Returns null if Slack rejects / user missing.
 */
export async function fetchAndCacheSlackProfile(
  client: WebClient,
  db: Database,
  userId: string,
): Promise<SlackProfileSnapshot | null> {
  try {
    const res = await client.users.info({ user: userId });
    const u = res.user;
    if (!u?.id) return null;

    let title = nonempty(u.profile?.title);
    let statusText = nonempty(u.profile?.status_text);
    let statusEmoji = nonempty(u.profile?.status_emoji);
    let email = nonempty(u.profile?.email);
    let phone = nonempty(u.profile?.phone);
    let fields = ((u.profile as { fields?: SlackProfileFields } | undefined)?.fields ??
      undefined) as SlackProfileFields | undefined;

    try {
      const profileRes = await client.users.profile.get({ user: userId });
      const p = profileRes.profile;
      if (p) {
        title = nonempty(p.title) ?? title;
        statusText = nonempty(p.status_text) ?? statusText;
        statusEmoji = nonempty(p.status_emoji) ?? statusEmoji;
        email = nonempty(p.email) ?? email;
        phone = nonempty(p.phone) ?? phone;
        if (p.fields && Object.keys(p.fields).length > 0) {
          fields = p.fields as SlackProfileFields;
        }
      }
    } catch {
      // users.profile.get may fail for some token kinds — users.info is enough
    }

    const { about, phone: phoneFromFields } = await resolveAboutAndPhoneFromFields(
      client,
      fields,
      phone,
    );
    phone = phoneFromFields;

    const displayName =
      u.profile?.display_name || u.real_name || u.name || u.id;

    upsertUser(db, {
      id: u.id,
      displayName,
      realName: u.real_name ?? null,
      avatarUrl: u.profile?.image_192 || u.profile?.image_72 || null,
      title,
      email,
      about,
      phone,
      isBot: Boolean(u.is_bot),
    });

    return {
      id: u.id,
      displayName,
      realName: u.real_name ?? null,
      avatarUrl: u.profile?.image_192 || u.profile?.image_72 || null,
      title,
      email,
      about,
      phone,
      statusText,
      statusEmoji,
      isBot: Boolean(u.is_bot),
    };
  } catch (err) {
    const code =
      err && typeof err === "object" && "data" in err
        ? String((err as { data?: { error?: string } }).data?.error ?? "")
        : "";
    if (code === "invalid_auth" || code === "token_revoked" || code === "not_authed") {
      // Common for expired browser sessions (xoxc) — UI falls back to SQLite.
      console.warn(
        "Slack session expired or invalid while loading a profile. " +
          "Re-login in the UI, or run: slack-social auth",
      );
    } else {
      console.warn("fetchAndCacheSlackProfile failed:", err);
    }
    return null;
  }
}
