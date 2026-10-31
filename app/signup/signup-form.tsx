"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { MailCheck, Rocket } from "lucide-react"
import { signUp } from "./actions"

export function SignUpForm() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const form = new FormData(e.currentTarget)
    const email = String(form.get("email")).trim().toLowerCase()
    const result = await signUp({
      businessName: String(form.get("businessName")),
      email,
      password: String(form.get("password")),
      website: String(form.get("website") ?? ""),
    })
    if (!result.ok) {
      setLoading(false)
      setError(result.error)
      return
    }
    if (result.data.confirm) {
      setSentTo(email)
      return
    }
    router.push("/dashboard")
    router.refresh()
  }

  if (sentTo) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <MailCheck size={36} className="text-brand" />
        <p className="text-white font-semibold">Check your email</p>
        <p className="text-sm muted">
          We sent a link to <span className="text-white">{sentTo}</span>. Open it to confirm your email and go to your
          business suite.
        </p>
        <p className="text-xs faint">
          Nothing there after a few minutes? Check spam, or{" "}
          <Link href="/login" className="underline">
            log in
          </Link>{" "}
          to get a new link.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {error && <p className="alert alert-error">{error}</p>}
      <label>
        <span className="label">Business name</span>
        <input className="input" name="businessName" placeholder="e.g. Santos Trading" required minLength={2} maxLength={80} autoFocus />
      </label>
      <label>
        <span className="label">Your email</span>
        <input className="input" name="email" type="email" placeholder="you@example.com" required autoComplete="email" />
        <span className="hint">You&apos;ll log in with this. Your staff get their own usernames later.</span>
      </label>
      <label>
        <span className="label">Password</span>
        <input className="input" name="password" type="password" minLength={8} required autoComplete="new-password" placeholder="At least 8 characters" />
      </label>
      {/* Hidden from people; bots fill it in. */}
      <input name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
      <button type="submit" className="btn btn-primary btn-lg btn-block mt-2" disabled={loading}>
        <Rocket size={16} />
        {loading ? "Setting up your suite…" : "Create my business suite"}
      </button>
    </form>
  )
}
