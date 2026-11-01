"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, ArrowRight, MailCheck, Rocket } from "lucide-react"
import { BusinessTypePicker, FeatureToggles, presetFor, type FeaturesValue } from "@/components/features-picker"
import { signUp } from "./actions"

/**
 * Two steps: (1) the business: its name, what kind it is, and the features
 * that turns on (adjustable right there); (2) the owner's login.
 */
export function SignUpForm() {
  const router = useRouter()
  const [step, setStep] = useState<1 | 2>(1)
  const [name, setName] = useState("")
  const [features, setFeatures] = useState<FeaturesValue | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)

  const ready = name.trim().length >= 2 && features && features.modules.length > 0

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!features) return setStep(1)
    setLoading(true)
    setError(null)
    const form = new FormData(e.currentTarget)
    const email = String(form.get("email")).trim().toLowerCase()
    const result = await signUp({
      businessName: name,
      email,
      password: String(form.get("password")),
      website: String(form.get("website") ?? ""),
      businessType: features.businessType,
      modules: features.modules,
      options: features.options,
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

  if (step === 1) {
    return (
      <form
        className="flex flex-col gap-5"
        onSubmit={e => {
          e.preventDefault()
          if (ready) setStep(2)
        }}
      >
        <p className="text-xs faint uppercase tracking-[0.18em]">Step 1 of 2 · Your business</p>
        <label>
          <span className="label">Business name</span>
          <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Santos Trading" required minLength={2} maxLength={80} autoFocus />
        </label>
        <div>
          <span className="label">What kind of business is it?</span>
          <BusinessTypePicker value={features?.businessType ?? null} onChange={type => setFeatures(presetFor(type))} />
        </div>
        {features && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-white font-semibold">Here&apos;s what your suite will have</p>
            <p className="text-xs faint -mt-1">Turn things on or off now, or any time later in Settings → Features.</p>
            <FeatureToggles value={features} onChange={setFeatures} />
          </div>
        )}
        <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={!ready}>
          Next: your login <ArrowRight size={16} />
        </button>
      </form>
    )
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <p className="text-xs faint uppercase tracking-[0.18em]">Step 2 of 2 · Your login</p>
      {error && <p className="alert alert-error">{error}</p>}
      <label>
        <span className="label">Your email</span>
        <input className="input" name="email" type="email" placeholder="you@example.com" required autoComplete="email" autoFocus />
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
        {loading ? "Setting up your suite…" : `Create ${name.trim() || "my business suite"}`}
      </button>
      <button type="button" className="btn btn-ghost btn-block" onClick={() => setStep(1)} disabled={loading}>
        <ArrowLeft size={14} /> Back to your business
      </button>
    </form>
  )
}
