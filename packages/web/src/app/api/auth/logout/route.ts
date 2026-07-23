import { NextResponse } from "next/server";
import { clearCredentials } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  clearCredentials();
  return NextResponse.redirect(new URL("/login", "http://127.0.0.1:3000"));
}

export async function GET() {
  clearCredentials();
  return NextResponse.redirect(new URL("/login", "http://127.0.0.1:3000"));
}
