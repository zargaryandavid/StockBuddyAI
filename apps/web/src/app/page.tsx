import { redirect } from "next/navigation";
import { connection } from "next/server";

import { Dashboard } from "@/components/dashboard";
import { loadWorkspace } from "@/lib/server-api";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

export default async function Home() {
  await connection();
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/login");
  const account = await loadWorkspace(String(data.claims.email ?? "Signed in"));
  return (
    <Dashboard
      email={account.email}
      role={account.role}
      book={account.book}
      today={new Date().toISOString().slice(0, 10)}
    />
  );
}
