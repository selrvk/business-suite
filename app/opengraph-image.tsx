import { ImageResponse } from "next/og"
import { BRAND_COLORS, LOGO_DATA_URI } from "@/lib/brand"
import { config } from "@/lib/config"

export const size = { width: 1200, height: 630 }
export const contentType = "image/png"
export const alt = `${config.appName}: stock, sales, staff and trucks with one barcode scanner`

/** The preview card shown when the site is shared on Facebook, Messenger, Viber, etc. */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "#0B0E14",
          color: "#E8EBF2",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <img src={LOGO_DATA_URI} width={96} height={96} alt="" />
          <div style={{ fontSize: 48, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>{config.appName}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.05, color: "#FFFFFF" }}>Stock, sales, staff and trucks. One scanner.</div>
          <div style={{ display: "flex", height: 6, width: 280, background: BRAND_COLORS.laser, borderRadius: 3 }} />
        </div>
        <div style={{ fontSize: 32, color: "rgba(232,235,242,0.7)" }}>
          {/* The built-in font has no peso sign, so spell out the currency. */}
          {`${config.trialDays} days free · then ${config.currency} ${config.price.monthly}/month, everything included`}
        </div>
      </div>
    ),
    size,
  )
}
