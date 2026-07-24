import type { DmConversation } from "@slack-social/shared";

function GroupIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={className}
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

export function DmAvatar({
  conversation,
  size = "md",
}: {
  conversation: Pick<DmConversation, "kind" | "name" | "avatarUrl">;
  size?: "sm" | "md" | "lg";
}) {
  const dim =
    size === "lg" ? "h-14 w-14" : size === "sm" ? "h-8 w-8" : "h-10 w-10";
  const icon = size === "lg" ? "h-7 w-7" : size === "sm" ? "h-4 w-4" : "h-5 w-5";

  if (conversation.kind === "mpim") {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center rounded-full bg-[#2a2a2a] text-[var(--muted)] ${dim}`}
        aria-hidden
      >
        <GroupIcon className={icon} />
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={
        conversation.avatarUrl ||
        `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(conversation.name)}`
      }
      alt=""
      className={`${dim} shrink-0 rounded-full object-cover`}
    />
  );
}
