import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Finishes a link from a Supabase email (sign-up confirmation or password reset) and
 * signs the person in. "expired" means Supabase rejected the link; "no-session" means the
 * link was fine but was opened in a different browser than the one that asked for it.
 */
export async function finishEmailLink(request: NextRequest): Promise<"ok" | "expired" | "no-session"> {
  const params = request.nextUrl.searchParams;
  if (params.get("error") || params.get("error_description")) return "expired";

  const supabase = await createClient();
  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return error ? "no-session" : "ok";
  }
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    return error ? "expired" : "ok";
  }
  return "expired";
}
