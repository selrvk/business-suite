import type { CookieOptionsWithName } from "@supabase/ssr"

/**
 * Login cookie settings: page scripts can't read it (httpOnly), it only
 * travels over HTTPS (secure, except on a local http:// dev server), and other
 * sites can't send it along with their own form posts (sameSite).
 */
export const COOKIE_OPTIONS: CookieOptionsWithName = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
}
