"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ShieldCheck, Smartphone } from "lucide-react"
import { startTwoStepSetup, verifyTwoStepCode } from "./actions"

type Setup = { factorId: string; qr: string; secret: string }

/**
 * The platform login's second step. If no authenticator app is set up yet, it
 * walks through adding one (scan a QR code, confirm with a code); otherwise it
 * just asks for the current code.
 */
export function TwoStepForm({ hasApp }: { hasApp: boolean }) {
  const router = useRouter()
  const [setup, setSetup] = useState<Setup | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function begin() {
    setBusy(true)
    setError(null)
    const result = await startTwoStepSetup()
    setBusy(false)
    if (!result.ok) return setError(result.error)
    setSetup(result.data)
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const result = await verifyTwoStepCode(String(new FormData(e.currentTarget).get("code")), setup?.factorId)
    if (!result.ok) {
      setBusy(false)
      return setError(result.error)
    }
    router.push("/platform")
    router.refresh()
  }

  if (!hasApp && !setup) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm muted">
          Your platform login can see and delete every business, so it needs a second step: a 6-digit code from an
          authenticator app on your phone, such as Google Authenticator, Microsoft Authenticator or 1Password.
        </p>
        {error && <p className="alert alert-error">{error}</p>}
        <button type="button" className="btn btn-primary btn-lg btn-block" onClick={begin} disabled={busy}>
          <Smartphone size={16} /> {busy ? "Preparing…" : "Set it up"}
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {setup ? (
        <>
          <p className="text-sm muted">1. In your authenticator app, add an account and scan this code.</p>
          {/* eslint-disable-next-line @next/next/no-img-element -- QR code made by Supabase, as a data URL */}
          <img src={setup.qr} alt="QR code for your authenticator app" width={184} height={184} className="mx-auto rounded-lg bg-white p-2" />
          <p className="text-xs faint">
            Can&apos;t scan? Type this key in instead: <span className="mono text-white break-all">{setup.secret}</span>
            <br />
            Save this key in a password manager too. It&apos;s how you add the login to a new phone.
          </p>
          <p className="text-sm muted">2. Enter the 6-digit code the app shows.</p>
        </>
      ) : (
        <p className="text-sm muted">Enter the 6-digit code from your authenticator app.</p>
      )}
      {error && <p className="alert alert-error text-center">{error}</p>}
      <input
        className="input mono text-center text-2xl tracking-[0.4em]"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9 ]{6,7}"
        maxLength={7}
        placeholder="000000"
        required
        autoFocus
      />
      <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy}>
        <ShieldCheck size={16} /> {busy ? "Checking…" : setup ? "Turn on two-step login" : "Continue"}
      </button>
    </form>
  )
}
