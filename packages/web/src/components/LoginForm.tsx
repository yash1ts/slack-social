"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";

type BrowserSessionOption = {
  id: string;
  teamId?: string;
  teamName?: string;
  userId?: string;
  source: string;
  tokenPreview: string;
};

export function LoginForm({
  configured,
  error,
  initialClientId = "",
}: {
  configured: boolean;
  error?: string | null;
  initialClientId?: string;
}) {
  const router = useRouter();
  const [clientId, setClientId] = useState(initialClientId);
  const [clientSecret, setClientSecret] = useState("");
  const [ready, setReady] = useState(configured);
  const [localError, setLocalError] = useState<string | null>(error ?? null);
  const [pending, startTransition] = useTransition();

  const [sessions, setSessions] = useState<BrowserSessionOption[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scanning, setScanning] = useState(true);
  const [importPending, startImportTransition] = useTransition();
  const [manifestText, setManifestText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const refreshSessions = useCallback(async () => {
    setScanning(true);
    setLocalError(null);
    try {
      const res = await fetch("/api/auth/import-session");
      const data = (await res.json()) as { sessions?: BrowserSessionOption[]; error?: string };
      const list = data.sessions ?? [];
      setSessions(list);
      setSelectedId((prev) => {
        if (prev && list.some((s) => s.id === prev)) return prev;
        return list[0]?.id ?? null;
      });
    } catch {
      setLocalError("Could not scan browser/Slack Local Storage");
    } finally {
      setScanning(false);
    }
  }, []);

  useEffect(() => {
    void refreshSessions();
  }, [refreshSessions]);

  useEffect(() => {
    void fetch("/api/auth/manifest")
      .then((r) => r.json())
      .then((data: { text?: string }) => {
        if (data.text) setManifestText(data.text);
      })
      .catch(() => {
        /* ignore */
      });
  }, []);

  async function copyManifest() {
    if (!manifestText) return;
    try {
      await navigator.clipboard.writeText(manifestText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setLocalError("Could not copy to clipboard");
    }
  }

  async function saveAndLogin(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);

    const id = clientId.trim();
    const secret = clientSecret.trim();

    startTransition(async () => {
      if (id && secret) {
        const res = await fetch("/api/auth/configure", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId: id, clientSecret: secret }),
        });
        const data = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok) {
          setLocalError(data.error ?? "Failed to save credentials");
          return;
        }
        setReady(true);
      } else if (!ready) {
        setLocalError("Paste both Client ID and Client Secret.");
        return;
      }
      window.location.href = "/api/auth/login";
    });
  }

  function loginWithSelectedSession() {
    if (!selectedId) {
      setLocalError("Select a workspace from the list");
      return;
    }
    setLocalError(null);
    startImportTransition(async () => {
      const res = await fetch("/api/auth/import-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ launchChrome: true, sessionId: selectedId }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        missingCapabilities?: string[];
      };
      if (!res.ok) {
        const caps = data.missingCapabilities?.length
          ? ` Missing: ${data.missingCapabilities.join(", ")}`
          : "";
        setLocalError((data.error ?? "Could not import browser session") + caps);
        return;
      }
      router.replace("/");
      router.refresh();
    });
  }

  return (
    <div className="w-full max-w-sm space-y-5">
      {(localError || error) && (
        <p className="text-center text-sm text-red-400">
          {(localError || error || "").replace(/_/g, " ")}
        </p>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-white">Read from Slack app / browser</p>
          <button
            type="button"
            onClick={() => void refreshSessions()}
            disabled={scanning || importPending}
            className="text-[11px] text-[var(--muted)] underline underline-offset-2 hover:text-white disabled:opacity-50"
          >
            {scanning ? "Scanning…" : "Refresh"}
          </button>
        </div>
        <p className="text-xs text-[var(--muted)]">
          Sessions found in Chrome / Slack desktop Local Storage. Select one, then login.
        </p>

        {scanning && !sessions.length ? (
          <p className="rounded-xl border border-[var(--border)] bg-[#141414] px-3 py-4 text-center text-xs text-[var(--muted)]">
            Scanning Local Storage…
          </p>
        ) : null}

        {!scanning && sessions.length === 0 ? (
          <p className="rounded-xl border border-[var(--border)] bg-[#141414] px-3 py-4 text-center text-xs text-[var(--muted)]">
            No sessions found. Open{" "}
            <a
              href="https://app.slack.com"
              target="_blank"
              rel="noreferrer"
              className="text-white underline"
            >
              app.slack.com
            </a>{" "}
            once, then hit Refresh.
          </p>
        ) : null}

        {sessions.length > 0 ? (
          <ul className="max-h-56 space-y-2 overflow-y-auto">
            {sessions.map((s) => {
              const active = selectedId === s.id;
              const title = s.teamName || s.teamId || "Unknown workspace";
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(s.id)}
                    className={`w-full rounded-xl border px-3 py-2.5 text-left transition-colors ${
                      active
                        ? "border-transparent bg-gradient-to-r from-[#f77737]/90 via-[#e1306c]/90 to-[#c13584]/90 text-white"
                        : "border-[var(--border)] bg-[#141414] text-[var(--muted)] hover:border-[#404040] hover:text-white"
                    }`}
                  >
                    <div className="text-sm font-semibold text-white">{title}</div>
                    <div className="mt-0.5 text-[11px] opacity-80">
                      {s.userId ? `user ${s.userId}` : "user unknown"} · {s.source.split(":")[0]}
                    </div>
                    <div className="mt-0.5 font-mono text-[10px] opacity-70">{s.tokenPreview}</div>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}

        <button
          type="button"
          disabled={importPending || !selectedId || scanning}
          onClick={loginWithSelectedSession}
          className="w-full rounded-xl bg-gradient-to-r from-[#f77737] via-[#e1306c] to-[#c13584] py-3 text-sm font-semibold text-white shadow-lg shadow-[#e1306c]/20 disabled:opacity-50"
        >
          {importPending ? "Logging in…" : "Login with selected session"}
        </button>

        <p className="text-center text-xs text-[var(--muted)]">
          Saved locally in <code className="text-white/80">~/.slack-social</code>. Not uploaded
          anywhere.
        </p>
      </div>

      <div className="relative flex items-center gap-3 py-1">
        <div className="h-px flex-1 bg-[var(--border)]" />
        <span className="text-[11px] uppercase tracking-wide text-[var(--muted)]">or</span>
        <div className="h-px flex-1 bg-[var(--border)]" />
      </div>

      <form onSubmit={saveAndLogin} className="space-y-3">
        <p className="text-sm font-semibold text-white">Login with Slack app</p>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-[var(--muted)]">Client ID</span>
          <input
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="Paste Client ID"
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-xl border border-[var(--border)] bg-[#141414] px-3 py-2.5 font-mono text-sm outline-none focus:border-[var(--accent)]"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-[var(--muted)]">Client Secret</span>
          <input
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder={ready ? "Saved locally — paste again to update" : "Paste Client Secret"}
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-xl border border-[var(--border)] bg-[#141414] px-3 py-2.5 font-mono text-sm outline-none focus:border-[var(--accent)]"
          />
        </label>

        <button
          type="submit"
          disabled={pending || (!ready && (!clientId.trim() || !clientSecret.trim()))}
          className="w-full rounded-xl border border-[var(--border)] bg-[#1a1a1a] py-3 text-sm font-semibold text-white hover:border-[#404040] disabled:opacity-50"
        >
          {pending ? "Redirecting…" : "Login with Slack"}
        </button>
      </form>

      <div className="rounded-xl border border-[var(--border)] bg-[#111] px-4 py-3 text-left text-xs leading-relaxed text-[var(--muted)]">
        <p className="mb-2 font-semibold text-white">30-second setup (once)</p>
        <ol className="list-decimal space-y-2.5 pl-4">
          <li>
            Go to{" "}
            <a
              href="https://api.slack.com/apps?new_app=1"
              target="_blank"
              rel="noreferrer"
              className="text-white underline underline-offset-2"
            >
              api.slack.com/apps
            </a>{" "}
            → <span className="text-white">Create New App</span> →{" "}
            <span className="text-white">From an app manifest</span>.
          </li>
          <li>
            Click below to copy the manifest, paste it in Slack, then click{" "}
            <span className="text-white">Create</span>.
            <button
              type="button"
              onClick={() => void copyManifest()}
              disabled={!manifestText}
              className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[#1a1a1a] px-3 py-2 text-xs font-semibold text-white hover:border-[#404040] disabled:opacity-50"
            >
              {copied ? "Copied!" : "Copy app manifest JSON"}
            </button>
          </li>
          <li>
            Under <span className="text-white">Basic Information</span>, copy{" "}
            <span className="text-white">Client ID</span> and{" "}
            <span className="text-white">Client Secret</span>, paste them above, then click{" "}
            <span className="text-white">Login with Slack</span>.
          </li>
        </ol>
      </div>
    </div>
  );
}
