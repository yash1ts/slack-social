import { LoginForm } from "@/components/LoginForm";
import { readConfig, resolveClientCredentials } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  const configured = Boolean(resolveClientCredentials());
  const config = readConfig();

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
      <div className="mb-10 text-center">
        <img
          src="/logo.svg"
          alt="slack-social"
          width={72}
          height={72}
          className="mx-auto size-[72px] rounded-[18px]"
        />
        <h1 className="mt-4 bg-gradient-to-r from-[#f77737] via-[#e1306c] to-[#c13584] bg-clip-text text-4xl font-bold tracking-tight text-transparent">
          slack-social
        </h1>
        <p className="mt-3 text-sm text-[var(--muted)]">
          Your public Slack feed, locally — Instagram-style.
        </p>
      </div>

      <LoginForm
        configured={configured}
        error={sp.error ?? null}
        initialClientId={config.clientId ?? ""}
      />
    </div>
  );
}
