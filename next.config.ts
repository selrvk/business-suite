import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Old page addresses, so bookmarks keep working.
  async redirects() {
    return [
      { source: "/create-order", destination: "/pos", permanent: true },
      { source: "/order-history", destination: "/sales", permanent: true },
    ]
  },
}

export default nextConfig
