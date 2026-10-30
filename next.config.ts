import type { NextConfig } from "next"

const dev = process.env.NODE_ENV !== "production"
// Business logos are served from Supabase Storage.
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin : ""

/**
 * Where pages may load things from. Everything comes from this site, except
 * logos (Supabase). If injected code ever ran, it couldn't load outside scripts
 * or send data to other sites. The dev server also needs eval and websockets.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supabase}`.trim(),
  "font-src 'self'",
  `connect-src 'self'${dev ? " ws: wss:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ")

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  // Always use HTTPS for this site from now on (2 years).
  { key: "Strict-Transport-Security", value: "max-age=63072000" },
  // No other site can show these pages inside a frame (stops click-tricking).
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // Scanners work as keyboards, so none of these are needed. Allow camera here if phone-camera scanning is added.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
]

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    // Logo uploads go through a server action; they're shrunk in the browser first.
    serverActions: { bodySizeLimit: "3mb" },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }]
  },
  // Old page addresses, so bookmarks keep working.
  async redirects() {
    return [
      { source: "/create-order", destination: "/pos", permanent: true },
      { source: "/order-history", destination: "/sales", permanent: true },
    ]
  },
}

export default nextConfig
