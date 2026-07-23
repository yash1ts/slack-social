import { redirect } from "next/navigation";
import { isLoggedIn } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  if (isLoggedIn()) {
    redirect("/");
  }

  return (
    <div className="mx-auto flex h-dvh w-full max-w-[470px] flex-col overflow-hidden border-x border-[var(--border)] bg-[var(--bg)]/90 backdrop-blur">
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</main>
    </div>
  );
}
