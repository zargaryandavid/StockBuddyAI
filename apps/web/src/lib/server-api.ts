import { errorDetail } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import {
  defaultBook,
  type BookSettings,
  type Role,
  type WorkspaceAccount,
} from "@/lib/workspace";

export async function serverApi<T>(path: string, init?: RequestInit): Promise<T> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    throw new Error("Your session has expired. Please sign in again.");
  }
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000"}${path}`,
    {
      ...init,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    },
  );
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(errorDetail(body.detail, response.status));
  }
  return response.json() as Promise<T>;
}

export async function loadWorkspace(emailFallback: string): Promise<WorkspaceAccount> {
  try {
    const [me, book] = await Promise.all([
      serverApi<{ email: string; role: Role }>("/api/me"),
      serverApi<BookSettings>("/api/settings"),
    ]);
    return {
      email: me.email || emailFallback,
      role: me.role,
      book,
    };
  } catch {
    return { email: emailFallback, role: "user", book: defaultBook };
  }
}
