import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const XOXC_RE = /xoxc-[A-Za-z0-9-]{20,}/g;

export type FoundSession = {
  token: string;
  teamId?: string;
  teamName?: string;
  userId?: string;
  source: string;
  /** LevelDB/log file mtime — newer usually means a fresher token */
  seenAt: number;
};

export type BrowserProfile = {
  name: string;
  userDataDir: string;
  profileDir: string; // e.g. Default
  leveldb: string;
  cookies: string;
};

function candidates(): BrowserProfile[] {
  const home = homedir();
  const out: BrowserProfile[] = [];

  const browsers: Array<{ name: string; root: string }> = [
    { name: "chrome", root: join(home, ".config/google-chrome") },
    { name: "chromium", root: join(home, ".config/chromium") },
    { name: "brave", root: join(home, ".config/BraveSoftware/Brave-Browser") },
    { name: "edge", root: join(home, ".config/microsoft-edge") },
    { name: "slack-desktop", root: join(home, ".config/Slack") },
    { name: "slack-flatpak", root: join(home, ".var/app/com.slack.Slack/config/Slack") },
    // macOS
    { name: "chrome-mac", root: join(home, "Library/Application Support/Google/Chrome") },
    { name: "slack-mac", root: join(home, "Library/Application Support/Slack") },
  ];

  for (const b of browsers) {
    if (!existsSync(b.root)) continue;
    const profiles = ["Default", "Profile 1", "Profile 2", "Profile 3"];
    // Slack electron often stores at root Local Storage
    const roots = [
      ...profiles.map((p) => ({ profileDir: p, base: join(b.root, p) })),
      { profileDir: ".", base: b.root },
    ];
    for (const r of roots) {
      const leveldb = join(r.base, "Local Storage", "leveldb");
      const cookies = join(r.base, "Cookies");
      if (!existsSync(leveldb)) continue;
      out.push({
        name: b.name,
        userDataDir: b.root,
        profileDir: r.profileDir,
        leveldb,
        cookies,
      });
    }
  }
  return out;
}

function scanLeveldbForTokens(leveldbPath: string, source: string): FoundSession[] {
  const found: FoundSession[] = [];
  const seen = new Set<string>();
  let files: string[] = [];
  try {
    files = readdirSync(leveldbPath).filter((f) => f.endsWith(".ldb") || f.endsWith(".log"));
  } catch {
    return found;
  }

  for (const file of files) {
    const filePath = join(leveldbPath, file);
    let buf: Buffer;
    let seenAt = 0;
    try {
      seenAt = statSync(filePath).mtimeMs;
      buf = readFileSync(filePath);
    } catch {
      continue;
    }
    const text = buf.toString("latin1");
    for (const match of text.matchAll(XOXC_RE)) {
      const token = match[0];
      if (seen.has(token)) continue;
      seen.add(token);

      // Try to recover nearby localConfig context
      const idx = match.index ?? 0;
      const window = text.slice(Math.max(0, idx - 400), idx + token.length + 400);
      const teamId = window.match(/"(T[A-Z0-9]+)"/)?.[1];
      const userId = window.match(/"user_id":"(U[A-Z0-9]+)"/)?.[1];
      const teamName = window.match(/"name":"([^"]{1,80})"/)?.[1];

      found.push({
        token,
        teamId,
        userId,
        teamName,
        source: `${source}:${file}`,
        seenAt,
      });
    }
  }
  return found;
}

export function findBrowserSessions(): FoundSession[] {
  const all: FoundSession[] = [];
  const seen = new Set<string>();
  for (const profile of candidates()) {
    for (const s of scanLeveldbForTokens(profile.leveldb, profile.name)) {
      if (seen.has(s.token)) continue;
      seen.add(s.token);
      all.push(s);
    }
  }
  // Newest first — stale LevelDB copies of the same workspace tend to be older
  all.sort((a, b) => b.seenAt - a.seenAt);
  return all;
}

/** One row per workspace for the login UI (prefer newest token). Sync — may include stale tokens. */
export function listBrowserSessionOptions(): Array<{
  id: string;
  teamId?: string;
  teamName?: string;
  userId?: string;
  source: string;
  tokenPreview: string;
}> {
  const byTeam = new Map<string, FoundSession>();
  const orphans: FoundSession[] = [];
  for (const s of findBrowserSessions()) {
    if (!s.teamId) {
      orphans.push(s);
      continue;
    }
    const prev = byTeam.get(s.teamId);
    if (!prev || s.seenAt > prev.seenAt) byTeam.set(s.teamId, s);
  }
  const preferred = [...byTeam.values(), ...orphans].sort((a, b) => b.seenAt - a.seenAt);
  return preferred.map((s) => ({
    id: sessionIdFor(s.token),
    teamId: s.teamId,
    teamName: s.teamName,
    userId: s.userId,
    source: s.source,
    tokenPreview: `${s.token.slice(0, 18)}…`,
  }));
}

function cookieValueCandidates(rawCookie: string): string[] {
  const raw = rawCookie.replace(/^d=/, "");
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    /* keep raw */
  }
  return [...new Set([raw, decoded])];
}

async function authTestToken(
  token: string,
  rawCookie: string,
): Promise<{
  ok: boolean;
  error?: string;
  userId?: string;
  teamId?: string;
  cookieVal?: string;
}> {
  let lastError = "invalid_auth";
  for (const cookieVal of cookieValueCandidates(rawCookie)) {
    try {
      const res = await fetch("https://slack.com/api/auth.test", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Cookie: `d=${cookieVal}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        user_id?: string;
        team_id?: string;
      };
      if (data.ok) {
        return {
          ok: true,
          userId: data.user_id,
          teamId: data.team_id,
          cookieVal,
        };
      }
      lastError = data.error ?? "invalid_auth";
    } catch (err) {
      lastError = err instanceof Error ? err.message : "auth.test failed";
    }
  }
  return { ok: false, error: lastError };
}

/** Fetch the Slack `d` cookie via CDP (optionally launching Chrome). */
export async function resolveSlackSessionCookie(
  launchChrome = true,
): Promise<string | null> {
  let cookie = await cdpCookies(9222);
  if (!cookie && launchChrome) {
    const profiles = candidates().filter(
      (p) => p.name.startsWith("chrome") || p.name === "chromium" || p.name === "brave",
    );
    for (const profile of profiles) {
      cookie = await launchDebugChromeAndGetCookie(profile);
      if (cookie) break;
    }
  }
  return cookie;
}

export type BrowserSessionOption = {
  id: string;
  teamId?: string;
  teamName?: string;
  userId?: string;
  source: string;
  tokenPreview: string;
};

/**
 * Load browser/desktop tokens and only return ones that pass Slack auth.test
 * with the current `d` cookie. Call on login page start / Refresh.
 */
export async function listValidBrowserSessionOptions(opts: {
  launchChrome?: boolean;
} = {}): Promise<BrowserSessionOption[]> {
  const cookie = await resolveSlackSessionCookie(opts.launchChrome !== false);
  if (!cookie) {
    return [];
  }

  // Group by team (and orphans), try newest tokens first until one validates.
  const byKey = new Map<string, FoundSession[]>();
  for (const s of findBrowserSessions()) {
    const key = s.teamId ?? `token:${s.token}`;
    const list = byKey.get(key) ?? [];
    list.push(s);
    byKey.set(key, list);
  }

  const valid: BrowserSessionOption[] = [];
  for (const group of byKey.values()) {
    group.sort((a, b) => b.seenAt - a.seenAt);
    for (const s of group) {
      const test = await authTestToken(s.token, cookie);
      if (!test.ok) continue;
      valid.push({
        id: sessionIdFor(s.token),
        teamId: test.teamId ?? s.teamId,
        teamName: s.teamName,
        userId: test.userId ?? s.userId,
        source: s.source,
        tokenPreview: `${s.token.slice(0, 18)}…`,
      });
      break; // one working token per workspace
    }
  }

  return valid.sort((a, b) => (a.teamName ?? "").localeCompare(b.teamName ?? ""));
}

async function cdpCookies(port: number): Promise<string | null> {
  try {
    const version = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json()) as {
      webSocketDebuggerUrl?: string;
    };
    if (!version.webSocketDebuggerUrl) return null;

    // Use /json/new + Network.getAllCookies via simple HTTP targets list + fetch cookie domain
    // Prefer Runtime approach through a blank page websocket is complex; use /json list + Cookie endpoint workaround:
    const targets = (await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json())) as Array<{
      type: string;
      webSocketDebuggerUrl?: string;
    }>;
    const page = targets.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
    const wsUrl = page?.webSocketDebuggerUrl ?? version.webSocketDebuggerUrl;
    if (!wsUrl) return null;

    const cookie = await new Promise<string | null>((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      let id = 0;
      const timer = setTimeout(() => {
        ws.close();
        resolve(null);
      }, 8000);

      ws.onopen = () => {
        id += 1;
        ws.send(JSON.stringify({ id, method: "Network.enable" }));
        id += 1;
        ws.send(JSON.stringify({ id, method: "Network.getAllCookies" }));
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as {
            id?: number;
            result?: { cookies?: Array<{ name: string; domain: string; value: string }> };
          };
          if (msg.result?.cookies) {
            const d = msg.result.cookies.find(
              (c) => c.name === "d" && c.domain.includes("slack.com"),
            );
            clearTimeout(timer);
            ws.close();
            resolve(d?.value ?? null);
          }
        } catch (err) {
          clearTimeout(timer);
          reject(err);
        }
      };
      ws.onerror = () => {
        clearTimeout(timer);
        resolve(null);
      };
    });
    return cookie;
  } catch {
    return null;
  }
}

function findChromeBinary(): string | null {
  const bins = [
    "google-chrome",
    "google-chrome-stable",
    "chromium",
    "chromium-browser",
    "brave-browser",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ];
  for (const b of bins) {
    if (b.startsWith("/") && existsSync(b)) return b;
    // PATH lookup
  }
  // which via bun
  try {
    const which = Bun.which("google-chrome") || Bun.which("google-chrome-stable") || Bun.which("chromium");
    return which;
  } catch {
    return null;
  }
}

function copyProfileSubset(srcUserData: string, profileDir: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  // Local State helps Chrome boot
  for (const f of ["Local State", "First Run"]) {
    const p = join(srcUserData, f);
    if (existsSync(p)) copyFileSync(p, join(dest, f));
  }
  const srcProfile = profileDir === "." ? srcUserData : join(srcUserData, profileDir);
  const destProfile = join(dest, profileDir === "." ? "Default" : profileDir);
  mkdirSync(destProfile, { recursive: true });

  const copyTree = (from: string, to: string) => {
    if (!existsSync(from)) return;
    mkdirSync(to, { recursive: true });
    for (const ent of readdirSync(from)) {
      const fp = join(from, ent);
      const tp = join(to, ent);
      const st = statSync(fp);
      if (st.isDirectory()) copyTree(fp, tp);
      else copyFileSync(fp, tp);
    }
  };

  copyTree(join(srcProfile, "Local Storage"), join(destProfile, "Local Storage"));
  for (const f of ["Cookies", "Cookies-journal", "Cookies-wal", "Cookies-shm"]) {
    const p = join(srcProfile, f);
    if (existsSync(p)) copyFileSync(p, join(destProfile, f));
  }
}

async function launchDebugChromeAndGetCookie(profile: BrowserProfile): Promise<string | null> {
  const bin = findChromeBinary();
  if (!bin) return null;

  const tmp = join(homedir(), ".slack-social", "chrome-debug-profile");
  try {
    rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  copyProfileSubset(profile.userDataDir, profile.profileDir, tmp);

  const port = 9222;
  // If something already on 9222, try using it first
  const existing = await cdpCookies(port);
  if (existing) return existing;

  const profileDirectory = profile.profileDir === "." ? "Default" : profile.profileDir;
  const child = spawn(
    bin,
    [
      `--user-data-dir=${tmp}`,
      `--profile-directory=${profileDirectory}`,
      `--remote-debugging-port=${port}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "about:blank",
    ],
    { stdio: "ignore", detached: true },
  );
  child.unref();

  // Wait for CDP
  for (let i = 0; i < 40; i++) {
    await Bun.sleep(250);
    const cookie = await cdpCookies(port);
    if (cookie) {
      try {
        process.kill(child.pid!, "SIGTERM");
      } catch {
        /* ignore */
      }
      return cookie;
    }
  }
  try {
    process.kill(child.pid!, "SIGTERM");
  } catch {
    /* ignore */
  }
  return null;
}

export type ImportResult = {
  token: string;
  sessionCookie: string;
  teamId?: string;
  userId?: string;
  teamName?: string;
  source: string;
};

/**
 * Read Slack browser session (xoxc + d cookie) from local Chrome/Slack app data.
 */
export async function importBrowserSession(opts: {
  launchChrome?: boolean;
  /** Select a specific token (full xoxc value) */
  token?: string;
  /** Or select by id from listBrowserSessionOptions() */
  sessionId?: string;
}): Promise<ImportResult> {
  const sessions = findBrowserSessions();
  if (!sessions.length) {
    throw new Error(
      "No Slack xoxc token found in browser/Slack app Local Storage. Open app.slack.com in Chrome once, then retry.",
    );
  }

  let session = sessions.find((s) => s.teamId) ?? sessions[0];
  if (opts.token) {
    session = sessions.find((s) => s.token === opts.token) ?? session;
  } else if (opts.sessionId) {
    const match = sessions.find((s) => sessionIdFor(s.token) === opts.sessionId);
    if (!match) {
      throw new Error("Selected session is no longer available. Refresh the list and try again.");
    }
    session = match;
  }

  const cookie = await resolveSlackSessionCookie(opts.launchChrome !== false);

  if (!cookie) {
    throw new Error(
      `Found token in ${session.source} but could not read the Slack d cookie.\n` +
        `Quit Chrome fully, then re-run with launch enabled, or paste the cookie manually.\n` +
        `Token found for team ${session.teamName ?? session.teamId ?? "unknown"}.`,
    );
  }

  return {
    token: session.token,
    sessionCookie: cookie,
    teamId: session.teamId,
    userId: session.userId,
    teamName: session.teamName,
    source: session.source,
  };
}

export function sessionIdFor(token: string): string {
  return Bun.hash(token).toString(16);
}

export async function verifyAndStoreSession(imported: ImportResult): Promise<ImportResult> {
  const { writeCredentials } = await import("../config");
  const test = await authTestToken(imported.token, imported.sessionCookie);
  if (!test.ok || !test.cookieVal) {
    const workspace = imported.teamName ?? imported.teamId ?? "this workspace";
    throw new Error(
      `Slack rejected session for ${workspace}: ${test.error ?? "invalid_auth"}. ` +
        `Open ${workspace} in Chrome at app.slack.com (fully load the workspace), quit Chrome, then tap Refresh and try again. ` +
        `Stale tokens from the Slack desktop app often cause this.`,
    );
  }

  writeCredentials({
    accessToken: imported.token,
    sessionCookie: test.cookieVal,
    teamId: test.teamId ?? imported.teamId ?? "",
    userId: test.userId ?? imported.userId ?? "",
    clientId: "",
    obtainedAt: Date.now(),
    authKind: "browser_session",
    teamName: imported.teamName,
  });

  return {
    ...imported,
    sessionCookie: test.cookieVal,
    teamId: test.teamId ?? imported.teamId,
    userId: test.userId ?? imported.userId,
  };
}
