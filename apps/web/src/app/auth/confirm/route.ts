import { NextResponse, type NextRequest } from "next/server";

import { finishEmailLink } from "@/lib/supabase/email-link";
import { createClient } from "@/lib/supabase/server";

/**
 * Where the confirmation link in the sign-up email lands. Supabase has already confirmed
 * the address by the time the browser gets here; this signs the person in, asks the API for
 * the welcome email, and opens the app.
 */
export async function GET(request: NextRequest) {
  const result = await finishEmailLink(request);
  const origin = request.nextUrl.origin;
  if (result === "ok") {
    await requestWelcome(origin);
    return NextResponse.redirect(new URL("/", origin));
  }
  // Opened in another browser or device, the address is still confirmed: ask to sign in.
  return NextResponse.redirect(new URL(`/login?confirm=${result === "expired" ? "expired" : "done"}`, origin));
}

/** The API sends it only within minutes of confirming, so this is safe to call each time. */
async function requestWelcome(origin: string) {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    // On Vercel the API lives on the same address; locally it runs on its own port.
    const base = process.env.VERCEL ? origin : (process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000");
    await fetch(`${base}/api/emails/welcome`, {
      method: "POST",
      headers: { Authorization: `Bearer ${data.session.access_token}` },
      signal: AbortSignal.timeout(4000),
    });
  } catch {
    // A missing welcome email must never stop someone from getting into the app.
  }
}
