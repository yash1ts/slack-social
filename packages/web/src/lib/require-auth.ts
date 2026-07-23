import { NextResponse } from "next/server";
import { isLoggedIn } from "@/lib/auth";

export function requireAuth(): NextResponse | null {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
