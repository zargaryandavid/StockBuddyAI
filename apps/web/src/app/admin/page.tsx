import { redirect } from "next/navigation";
import { connection } from "next/server";

import { AdminPanel, type StudioConfig } from "@/components/admin-panel";
import { getT } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { loadWorkspace, serverApi } from "@/lib/server-api";

export const instant = false;

export default async function AdminPage() {
  await connection();
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/login");
  const account = await loadWorkspace(String(data.claims.email ?? "Signed in"));
  if (account.role !== "admin") redirect("/");
  let config: StudioConfig;
  try {
    config = await serverApi<StudioConfig>("/api/admin/config");
  } catch (cause) {
    const t = await getT();
    const message = cause instanceof Error ? cause.message : t("Could not load the studio");
    return (
      <main className="app-shell simple-shell">
        <section className="simple-page">
          <h1>{t("Admin studio")}</h1>
          <div className="alert">{message}</div>
        </section>
      </main>
    );
  }
  return <AdminPanel email={account.email} initial={config} />;
}
