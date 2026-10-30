import type { Metadata } from "next"
import { Bebas_Neue, Plus_Jakarta_Sans } from "next/font/google"
import { config } from "@/lib/config"
import "./globals.css"

const bebasNeue = Bebas_Neue({
  weight: "400",
  variable: "--font-bebas",
  subsets: ["latin"],
  display: "swap",
})

const plusJakarta = Plus_Jakarta_Sans({
  weight: ["400", "500", "600", "700"],
  variable: "--font-jakarta",
  subsets: ["latin"],
  display: "swap",
})

export const metadata: Metadata = {
  title: { default: config.appName, template: `%s · ${config.appName}` },
  description: "Inventory, point of sale, attendance and fleet tracking for small businesses, built around a barcode scanner.",
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`dark ${bebasNeue.variable} ${plusJakarta.variable}`}
      style={{ "--brand": config.accentColor } as React.CSSProperties}
    >
      <body>{children}</body>
    </html>
  )
}
