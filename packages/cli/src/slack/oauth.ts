import { OAUTH_REDIRECT_PORT, OAUTH_REDIRECT_URI, USER_SCOPES } from "@slack-social/shared";
import type { Credentials } from "@slack-social/shared";
import open from "open";
import { writeCredentials } from "../config";

function randomState(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

export async function runLocalOAuth(opts: {
  clientId: string;
  clientSecret: string;
}): Promise<Credentials> {
  const state = randomState();
  const userScope = USER_SCOPES.join(",");
  const authorizeUrl =
    `https://slack.com/oauth/v2/authorize` +
    `?client_id=${encodeURIComponent(opts.clientId)}` +
    `&user_scope=${encodeURIComponent(userScope)}` +
    `&redirect_uri=${encodeURIComponent(OAUTH_REDIRECT_URI)}` +
    `&state=${encodeURIComponent(state)}`;

  const credentials = await new Promise<Credentials>((resolve, reject) => {
    const timeout = setTimeout(() => {
      server.stop(true);
      reject(new Error("OAuth timed out after 5 minutes. Run `slack-social auth` again."));
    }, 5 * 60_000);

    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: OAUTH_REDIRECT_PORT,
      async fetch(req) {
        const url = new URL(req.url);
        if (url.pathname !== "/callback") {
          return new Response("slack-social OAuth server", { status: 200 });
        }

        const error = url.searchParams.get("error");
        if (error) {
          clearTimeout(timeout);
          queueMicrotask(() => server.stop(true));
          reject(new Error(`Slack OAuth error: ${error}`));
          return new Response(`Authorization failed: ${error}`, { status: 400 });
        }

        const code = url.searchParams.get("code");
        const returnedState = url.searchParams.get("state");
        if (!code || returnedState !== state) {
          return new Response("Invalid OAuth callback", { status: 400 });
        }

        try {
          const body = new URLSearchParams({
            client_id: opts.clientId,
            client_secret: opts.clientSecret,
            code,
            redirect_uri: OAUTH_REDIRECT_URI,
          });

          const res = await fetch("https://slack.com/api/oauth.v2.access", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body,
          });
          const data = (await res.json()) as {
            ok: boolean;
            error?: string;
            team?: { id?: string };
            authed_user?: { id?: string; access_token?: string };
          };

          if (!data.ok || !data.authed_user?.access_token) {
            clearTimeout(timeout);
            queueMicrotask(() => server.stop(true));
            reject(new Error(`Token exchange failed: ${data.error ?? "unknown"}`));
            return new Response(`Token exchange failed: ${data.error}`, { status: 500 });
          }

          const creds: Credentials = {
            accessToken: data.authed_user.access_token,
            teamId: data.team?.id ?? "",
            userId: data.authed_user.id ?? "",
            clientId: opts.clientId,
            obtainedAt: Date.now(),
            authKind: "user_oauth",
          };

          writeCredentials(creds);
          clearTimeout(timeout);
          queueMicrotask(() => {
            server.stop(true);
            resolve(creds);
          });

          return new Response(
            `<!doctype html><html><body style="font-family:system-ui;background:#0a0a0a;color:#fafafa;display:grid;place-items:center;height:100vh;margin:0">
              <div style="text-align:center">
                <h1>Connected to Slack</h1>
                <p>You can close this window and return to the terminal.</p>
              </div>
            </body></html>`,
            { headers: { "Content-Type": "text/html" } },
          );
        } catch (err) {
          clearTimeout(timeout);
          queueMicrotask(() => server.stop(true));
          reject(err);
          return new Response("OAuth failed", { status: 500 });
        }
      },
    });

    console.log(`\nListening for OAuth callback on ${OAUTH_REDIRECT_URI}`);
    console.log("Opening browser for Slack authorization…\n");
    console.log(`If the browser does not open, visit:\n${authorizeUrl}\n`);
    void open(authorizeUrl);
  });

  return credentials;
}
