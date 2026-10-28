import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { AdminLoader } from "@/components/admin-loader";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

// Admin is private: keep it out of search engines.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AdminPage() {
  await connection();
  const supabase = await createClient();
  // Checked from the sign-in cookie without a network trip; the studio settings, and the
  // admin check, come from the API in the browser so the page shows at once.
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/login");
  return <AdminLoader email={String(data.claims.email ?? "Signed in")} />;
}
