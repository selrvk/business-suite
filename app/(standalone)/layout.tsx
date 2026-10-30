import { requireActive } from "@/lib/auth"

// Logged-in pages without the side menu: the time clock kiosk and print views.
export default async function StandaloneLayout({ children }: { children: React.ReactNode }) {
  await requireActive()
  return <>{children}</>
}
