import { ImageResponse } from "next/og"
import { BRAND_COLORS, LOGO_DATA_URI } from "@/lib/brand"

// Home-screen icons for the installed app (see app/manifest.ts).
// "maskable" fills the whole square, because Android crops it to its own shape.

const ICONS = {
  "192.png": { size: 192, maskable: false },
  "512.png": { size: 512, maskable: false },
  "maskable.png": { size: 512, maskable: true },
} as const

export const dynamic = "force-static"

export function generateStaticParams() {
  return Object.keys(ICONS).map(icon => ({ icon }))
}

export async function GET(_request: Request, { params }: { params: Promise<{ icon: string }> }) {
  const icon = ICONS[(await params).icon as keyof typeof ICONS]
  if (!icon) return new Response("Not found", { status: 404 })
  const { size, maskable } = icon
  const logo = maskable ? Math.round(size * 0.9) : size
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: maskable ? BRAND_COLORS.tile : "transparent",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- drawn into a PNG, not shown on a page */}
        <img src={LOGO_DATA_URI} width={logo} height={logo} alt="" />
      </div>
    ),
    { width: size, height: size },
  )
}
