import { DmInbox } from "@/components/DmInbox";

export const dynamic = "force-dynamic";

export default function MessagesPage() {
  return (
    <div>
      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--bg)]/90 px-4 py-3 backdrop-blur">
        <h1 className="text-lg font-semibold">Messages</h1>
      </header>
      <DmInbox />
    </div>
  );
}
