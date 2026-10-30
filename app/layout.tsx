import type { Metadata } from "next"
import { config } from "@/lib/config"
import "./fonts.css"
import "./globals.css"

export const metadata: Metadata = {
  title: { default: config.appName, template: `%s · ${config.appName}` },
  description: "Inventory, point of sale, attendance and fleet tracking for small businesses, built around a barcode scanner.",
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className="dark"
      style={{ "--brand": config.accentColor } as React.CSSProperties}
    >
      <body>{children}</body>
    </html>
  )
}
