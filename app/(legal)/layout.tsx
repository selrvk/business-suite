import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { AppLogoMark } from "@/components/app-logo"
import { config } from "@/lib/config"
import { PaperBarcode } from "../landing-parts"
import "../landing.css"

/** The fine print: Terms of Service and Privacy Policy, printed on the receipt paper of the showcase site. */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="lp min-h-screen" style={{ background: "var(--paper)" }}>
      <header className="lp-header">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3 px-4 sm:px-6 py-3">
          <Link href="/" className="flex items-center gap-2 sm:gap-3 min-w-0">
            <AppLogoMark size={34} />
            <span className="display text-lg sm:text-2xl text-white truncate">{config.appName}</span>
          </Link>
          <Link href="/" className="btn btn-ghost">
            <ArrowLeft size={14} /> Home
          </Link>
        </div>
      </header>

      <main className="lp-legal max-w-3xl mx-auto px-4 sm:px-6 py-12 md:py-16">{children}</main>

      <footer className="max-w-3xl mx-auto px-4 sm:px-6 pb-12 flex flex-col gap-5 font-mono text-sm" style={{ color: "var(--ink)" }}>
        <nav className="flex flex-wrap gap-4">
          <Link href="/terms" className="underline">
            Terms of Service
          </Link>
          <Link href="/privacy" className="underline">
            Privacy Policy
          </Link>
          <a href={`mailto:${config.contactEmail}`} className="underline">
            {config.contactEmail}
          </a>
        </nav>
        <PaperBarcode seed={config.appName} height={30} />
      </footer>
    </div>
  )
}
