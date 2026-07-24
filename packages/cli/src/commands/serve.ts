import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import open from "open";
import { openDb } from "../db/migrate";

function commandExists(bin: string): boolean {
  const r = spawnSync(bin, ["--version"], { stdio: "ignore" });
  return r.status === 0;
}

function packageJsonAt(dir: string): boolean {
  return existsSync(join(dir, "package.json"));
}

function standaloneServerAt(dir: string): string | null {
  const candidates = [
    join(dir, "server.js"),
    join(dir, "packages", "web", "server.js"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

/** Resolve web app dir for npm package, release zip, monorepo, or cwd. */
export function findWebDir(): string {
  const here = fileURLToPath(new URL(".", import.meta.url));
  const execDir = dirname(process.execPath);
  const pkgRoot = join(import.meta.dir, "..");
  const candidates = [
    // npm package: dist/cli.js → ../web (Next standalone)
    join(import.meta.dir, "../web"),
    join(pkgRoot, "web"),
    // Release layout: binary next to ./web (standalone or package)
    join(execDir, "web"),
    // Release layout: extracted zip root as cwd
    join(process.cwd(), "web"),
    // Monorepo / Bun source
    join(process.cwd(), "packages/web"),
    join(here, "../../../web"),
    join(import.meta.dir, "../../../web"),
  ];
  for (const c of candidates) {
    if (packageJsonAt(c) || standaloneServerAt(c)) return c;
  }
  throw new Error(
    "Could not locate the web UI.\n" +
      "Reinstall the npm package (`npm i -g slack-social`), download the full macOS zip from GitHub,\n" +
      "or run from a clone: bun run slack-social serve",
  );
}

/** Env for child Bun/Node processes (corporate CA trust + port). */
function webServerEnv(port: number, extra?: Record<string, string>): NodeJS.ProcessEnv {
  return {
    ...process.env,
    // Trust OS CA store for corporate proxies / SSL inspection.
    NODE_USE_SYSTEM_CA: process.env.NODE_USE_SYSTEM_CA ?? "1",
    PORT: String(port),
    ...extra,
  };
}

function startWebServer(webDir: string, port: number): ChildProcess {
  const standalone = standaloneServerAt(webDir);
  if (standalone) {
    if (!commandExists("bun")) {
      throw new Error(
        "Bun is required to run the web UI.\n" +
          "Install it: curl -fsSL https://bun.sh/install | bash\n" +
          "Then re-run: ./slack-social serve",
      );
    }
    console.log(`Mode: production (standalone)\nServer: ${standalone}`);
    return spawn("bun", [standalone], {
      cwd: dirname(standalone),
      stdio: "inherit",
      env: webServerEnv(port, { HOSTNAME: "127.0.0.1" }),
    });
  }

  if (!packageJsonAt(webDir)) {
    throw new Error(`Web UI at ${webDir} is missing package.json and server.js`);
  }

  if (!commandExists("bun")) {
    throw new Error("Bun is required. Install: https://bun.sh");
  }

  console.log("Mode: development (next dev)");
  return spawn("bun", ["--bun", "next", "dev", "-p", String(port)], {
    cwd: webDir,
    stdio: "inherit",
    env: webServerEnv(port),
  });
}

export async function runServe(opts: {
  port?: number;
  noSync?: boolean;
  forceSync?: boolean;
}): Promise<void> {
  // Ensure DB exists; indexing is driven by the web UI so progress is visible
  openDb();

  if (opts.noSync) {
    console.log("Auto-sync disabled (--no-sync). Start indexing from the UI or run slack-social sync.");
  } else if (opts.forceSync) {
    console.log("Force sync will run from the web UI after login (progress shown in the feed).");
  } else {
    console.log("Workspace indexing starts from the web UI after login (with progress).");
  }

  const port = opts.port ?? 3000;
  const webDir = findWebDir();
  const url = `http://localhost:${port}`;

  console.log(`\nStarting slack-social UI on ${url}`);
  console.log(`Web package: ${webDir}`);

  const child = startWebServer(webDir, port);

  setTimeout(() => {
    void open(url);
  }, 2500);

  await new Promise<void>((resolve, reject) => {
    child.on("exit", (code) => {
      if (code === 0 || code === null) resolve();
      else reject(new Error(`Web server exited with code ${code}`));
    });
    child.on("error", reject);
  });
}
