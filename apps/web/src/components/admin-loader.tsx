"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { AdminPanel, type StudioConfig } from "@/components/admin-panel";
import { ShimmerLines } from "@/components/shimmer";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n/client";

/** Shows Admin at once and loads the studio settings in the browser; non-admins go home. */
export function AdminLoader({ email }: { email: string }) {
  const t = useT();
  const router = useRouter();
  const [config, setConfig] = useState<StudioConfig | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    api<StudioConfig>("/api/admin/config")
      .then((loaded) => {
        if (active) setConfig(loaded);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        const message = cause instanceof Error ? cause.message : "";
        // The API answers 403 to anyone who is not the admin.
        if (/admin access required/i.test(message)) router.replace("/");
        else setError(message || t("Could not load the studio"));
      });
    return () => {
      active = false;
    };
  }, [router, t]);

  if (config) return <AdminPanel email={email} initial={config} />;
  return (
    <main className="app-shell simple-shell">
      <section className="simple-page">
        <h1>{t("Admin studio")}</h1>
        {error ? (
          <div className="alert" role="alert">
            {error}
          </div>
        ) : (
          <ShimmerLines label={t("Loading the studio…")} lines={6} />
        )}
      </section>
    </main>
  );
}
