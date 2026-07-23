import { DmThread } from "@/components/DmThread";

export const dynamic = "force-dynamic";

export default async function MessageThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DmThread channelId={decodeURIComponent(id)} />;
}
