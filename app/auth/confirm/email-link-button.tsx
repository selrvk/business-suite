"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowRight } from "lucide-react"
import { openEmailLink } from "./actions"

export function EmailLinkButton({ tokenHash, type, label }: { tokenHash: string; type: string; label: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function go() {
    setBusy(true)
    setError(null)
    const result = await openEmailLink(tokenHash, type)
    if (!result.ok) {
      setBusy(false)
      return setError(result.error)
    }
    router.push(result.data.to)
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="alert alert-error">{error}</p>}
      {error ? (
        <div className="flex flex-col gap-2">
          <Link href="/forgot-password" className="btn btn-secondary btn-block">
            Send a new password link
          </Link>
          <Link href="/login" className="btn btn-ghost btn-block">
            Log in (sends a new confirmation link if needed)
          </Link>
        </div>
      ) : (
        <button type="button" className="btn btn-primary btn-lg btn-block" onClick={go} disabled={busy}>
          {busy ? "One moment…" : label} <ArrowRight size={16} />
        </button>
      )}
    </div>
  )
}
