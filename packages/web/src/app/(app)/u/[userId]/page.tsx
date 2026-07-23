import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { dbApi, getDb } from "@/lib/db";
import { resolveUserProfile } from "@/lib/profile";
import { UserProfileView } from "@/components/UserProfile";

export const dynamic = "force-dynamic";

export default async function UserPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const profile = await resolveUserProfile(userId);
  if (!profile) notFound();
  const posts = dbApi.getUserPosts(getDb(), userId, 40);
  const session = getSession();
  const isSelf = session?.userId === userId;

  return <UserProfileView profile={profile} posts={posts} isSelf={isSelf} />;
}
