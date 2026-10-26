import { NextResponse, type NextRequest } from "next/server";

import { finishEmailLink } from "@/lib/supabase/email-link";

/** Where the link in the password-reset email lands: sign in, then choose a new password. */
export async function GET(request: NextRequest) {
  const result = await finishEmailLink(request);
  const origin = request.nextUrl.origin;
  if (result === "ok") return NextResponse.redirect(new URL("/reset-password", origin));
  return NextResponse.redirect(new URL(`/login?confirm=${result === "expired" ? "reset-expired" : "reset-browser"}`, origin));
}
