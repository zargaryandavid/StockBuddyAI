import { NextResponse, type NextRequest } from "next/server";

import { finishEmailLink } from "@/lib/supabase/email-link";

/**
 * Where the confirmation link in the sign-up email lands. Supabase has already confirmed
 * the address by the time the browser gets here; this signs the person in and opens the app.
 */
export async function GET(request: NextRequest) {
  const result = await finishEmailLink(request);
  const origin = request.nextUrl.origin;
  if (result === "ok") return NextResponse.redirect(new URL("/", origin));
  // Opened in another browser or device, the address is still confirmed: ask to sign in.
  return NextResponse.redirect(new URL(`/login?confirm=${result === "expired" ? "expired" : "done"}`, origin));
}
