"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { setSetupHidden } from "@/app/(protected)/settings/actions"

/** Hides the setup checklist (it can be brought back in Settings). */
export function HideSetupButton() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        disabled={busy}
        title="You can bring it back in Settings"
        onClick={async () => {
          setBusy(true)
          const result = await setSetupHidden(true)
          setBusy(false)
          if (!result.ok) return setError(result.error)
          router.refresh()
        }}
      >
        {busy ? "Hiding…" : "Hide"}
      </button>
      {error && <p className="w-full text-xs text-bad">{error}</p>}
    </>
  )
}

/** Brings the setup checklist back to the dashboard. */
export function ShowSetupButton() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        className="btn btn-secondary self-start"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          const result = await setSetupHidden(false)
          setBusy(false)
          if (!result.ok) return setError(result.error)
          router.push("/dashboard")
        }}
      >
        {busy ? "Showing…" : "Show it on the dashboard"}
      </button>
      {error && <p className="text-xs text-bad">{error}</p>}
    </div>
  )
}
