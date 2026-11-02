import type { MetadataRoute } from "next"
import { config } from "@/lib/config"

/** Lets people install the app on a phone, tablet or computer, so it opens in its own window. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: config.appName,
    short_name: config.appName,
    description: "Inventory, point of sale, attendance and fleet for small businesses.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#0b0e14",
    theme_color: "#0b0e14",
    icons: [
      { src: "/pwa/192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa/512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa/maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  }
}
