import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "local-publishable-key",
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const isLogin = request.nextUrl.pathname.startsWith("/login");
  // Email links (confirmation, password reset) must work before the person is signed in;
  // the Terms, Privacy Policy, and shared read-only pages are readable by anyone.
  const path = request.nextUrl.pathname;
  const isPublic =
    path.startsWith("/auth/") || path.startsWith("/share/") || path === "/privacy" || path === "/terms";

  if (!signedIn && !isLogin && !isPublic) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (signedIn && isLogin) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return response;
}
