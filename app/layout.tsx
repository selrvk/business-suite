import type { Metadata, Viewport } from "next"
import { config } from "@/lib/config"
import "./fonts.css"
import "./globals.css"

export const metadata: Metadata = {
  title: { default: config.appName, template: `%s · ${config.appName}` },
  description: "Inventory, point of sale, attendance and fleet tracking for small businesses, built around a barcode scanner.",
  applicationName: config.appName,
  appleWebApp: { capable: true, title: config.appName, statusBarStyle: "black" },
}

export const viewport: Viewport = {
  themeColor: "#0b0e14",
  colorScheme: "dark",
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className="dark"
      // The showcase page adds a class here before React loads (to hide blocks that animate in).
      suppressHydrationWarning
      style={{ "--brand": config.accentColor } as React.CSSProperties}
    >
      <body>{children}</body>
    </html>
  )
}
