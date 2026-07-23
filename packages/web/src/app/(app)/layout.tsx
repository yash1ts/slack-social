import { redirect } from "next/navigation";
import { BottomNav } from "@/components/BottomNav";
import { EmojiProvider } from "@/components/Emoji";
import { ThreadSheetProvider } from "@/components/ThreadSheetProvider";
import { isLoggedIn } from "@/lib/auth";
import { dbApi, getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!isLoggedIn()) {
    redirect("/login");
  }

  const db = getDb();
  let emojiCatalog: Record<string, string> = {};
  let emojiAliases: Record<string, string> = {};

  // Read cached catalog only — do not block navigation on Slack emoji sync.
  try {
    emojiCatalog = dbApi.getEmojiCatalog(db);
    emojiAliases = dbApi.getEmojiAliases(db);
  } catch {
    /* catalog fills in after first sync */
  }

  return (
    <EmojiProvider initialCatalog={emojiCatalog} initialAliases={emojiAliases}>
      <ThreadSheetProvider>
        <div className="mx-auto flex h-dvh w-full max-w-[470px] flex-col overflow-hidden border-x border-[var(--border)] bg-[var(--bg)]/90 backdrop-blur">
          <main className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
            {children}
          </main>
          <BottomNav />
        </div>
      </ThreadSheetProvider>
    </EmojiProvider>
  );
}
