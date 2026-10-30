"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Rocket } from "lucide-react"
import { signUp } from "./actions"

export function SignUpForm() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const form = new FormData(e.currentTarget)
    const result = await signUp({
      businessName: String(form.get("businessName")),
      email: String(form.get("email")),
      password: String(form.get("password")),
      website: String(form.get("website") ?? ""),
    })
    if (!result.ok) {
      setLoading(false)
      setError(result.error)
      return
    }
    router.push("/dashboard")
    router.refresh()
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
