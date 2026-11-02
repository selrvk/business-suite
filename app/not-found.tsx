import Link from "next/link"
import { AppLogoMark } from "@/components/app-logo"
import "./landing.css"

export const metadata = { title: "Not found" }

/** A shop sign, flipped to closed, for pages that don't exist. */
export default function NotFound() {
  return (
    <main className="lp min-h-screen flex items-center justify-center p-6">
      <div className="lp-receipt w-full max-w-sm px-7 pt-9 pb-11 text-center font-mono">
        <div className="flex justify-center mb-6">
          <AppLogoMark size={44} />
        </div>
        <span className="lp-sign">CLOSED</span>
        <hr className="lp-perf my-6" />
        <p className="text-lg font-bold">Sorry, this page isn&apos;t open.</p>
        <p className="text-sm mt-2" style={{ color: "var(--ink-soft)" }}>
          It doesn&apos;t exist, or it moved.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Link href="/" className="btn btn-primary">
            Home
          </Link>
          <Link href="/dashboard" className="btn btn-secondary" style={{ color: "#222", borderColor: "rgba(0,0,0,0.2)" }}>
            Dashboard
          </Link>
        </div>
      </div>
    </main>
  )
}
