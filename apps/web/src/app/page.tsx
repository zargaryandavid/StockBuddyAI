import { redirect } from "next/navigation";
import { connection } from "next/server";

import { Dashboard } from "@/components/dashboard";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

export default async function Home() {
  await connection();
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/login");
  // The sign-in cookie is checked here without a network trip; the role and settings load in
  // the browser, so the page shows at once instead of waiting on the API.
  return (
    <Dashboard
      email={String(data.claims.email ?? "Signed in")}
      today={new Date().toISOString().slice(0, 10)}
      loadAccount
    />
  );
}
