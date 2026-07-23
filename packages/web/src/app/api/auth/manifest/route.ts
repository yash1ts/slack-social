import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const FALLBACK_MANIFEST = {
  display_information: {
    name: "Slack Social UI",
    description: "Instagram feed UI for Slack",
    background_color: "#0a0a0a",
  },
  features: {
    bot_user: {
      display_name: "Slack Social",
    },
  },
  oauth_config: {
    redirect_urls: [
      "http://localhost:3000/api/auth/callback",
      "http://127.0.0.1:3000/api/auth/callback",
      "http://127.0.0.1:53682/callback",
    ],
    scopes: {
      user: [
        "channels:history",
        "channels:read",
        "reactions:read",
        "emoji:read",
        "users:read",
        "users.profile:read",
        "files:read",
        "files:write",
        "im:history",
        "im:read",
        "mpim:history",
        "mpim:read",
        "chat:write",
      ],
    },
  },
  settings: {
    org_deploy_enabled: false,
    socket_mode_enabled: false,
    token_rotation_enabled: false,
  },
};

function loadManifestText(): string {
  const cwd = process.cwd();
  const candidates = [
    join(cwd, "app-manifest.json"),
    join(cwd, "..", "app-manifest.json"),
    join(cwd, "..", "..", "app-manifest.json"),
    join(cwd, "../../app-manifest.json"),
  ];
  for (const path of candidates) {
    if (existsSync(path)) {
      return readFileSync(path, "utf8");
    }
  }
  return JSON.stringify(FALLBACK_MANIFEST, null, 2);
}

export async function GET() {
  try {
    const raw = loadManifestText();
    const parsed = JSON.parse(raw) as unknown;
    const text = JSON.stringify(parsed, null, 2);
    return NextResponse.json({ manifest: parsed, text });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Manifest unavailable" },
      { status: 500 },
    );
  }
}
