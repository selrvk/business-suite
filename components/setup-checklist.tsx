import Link from "next/link"
import { Check, ListChecks } from "lucide-react"
import { HideSetupButton, SkipStepButton } from "./setup-buttons"

export type SetupStep = {
  key: string
  title: string
  hint: string
  done: boolean
  /** The owner skipped it: not needed for their business. */
  skipped?: boolean
  actions: { href: string; label: string }[]
}

/**
 * The checklist on a new business's dashboard. Each step ticks itself off when
 * the real thing happens (a product exists, a sale was made…), so there's
 * nothing to mark as done. Owners can skip steps they don't need, or hide the
 * whole list; Settings brings it back.
 */
export function SetupChecklist({ steps, businessName }: { steps: SetupStep[]; businessName: string }) {
  const done = steps.filter(s => s.done).length
  const skipped = steps.filter(s => !s.done && s.skipped).length
  const next = steps.find(s => !s.done && !s.skipped)

  return (
    <section className="card mb-8 rise" aria-labelledby="setup-title">
      <div className="card-header flex-wrap">
        <ListChecks size={15} className="text-brand" />
        <h2 id="setup-title" className="display text-xl text-white">
          Get {businessName} ready
        </h2>
        <span className="text-xs faint ml-auto">
          {done} of {steps.length} done{skipped > 0 && ` · ${skipped} skipped`}
        </span>
        <HideSetupButton />
      </div>
      <div className="px-5 pt-4">
        <p className="text-sm muted">
          A few steps and you&apos;re ready for your first customer. Each one ticks itself off as you go. Skip any you don&apos;t need.
        </p>
        <div className="h-1.5 rounded-full mt-3 overflow-hidden flex" style={{ background: "var(--app-surface-2)" }}>
          <div className="h-full transition-all" style={{ width: `${(done / steps.length) * 100}%`, background: "var(--brand)" }} />
          <div className="h-full transition-all" style={{ width: `${(skipped / steps.length) * 100}%`, background: "var(--app-border-strong)" }} />
        </div>
      </div>
      <ol className="card-body flex flex-col gap-2">
        {steps.map((step, i) => {
          const current = step === next
          const skip = !step.done && !!step.skipped
          return (
            <li
              key={step.key}
              className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl px-3 py-3"
              style={{ background: current ? "var(--app-bg)" : undefined, border: current ? "1px solid var(--brand-line)" : "1px solid transparent" }}
            >
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <span
                  className="grid place-items-center shrink-0 w-7 h-7 rounded-full text-xs font-bold"
                  style={
                    step.done
                      ? { background: "var(--app-success)", color: "var(--app-bg)" }
                      : skip
                        ? { border: "1.5px dashed var(--app-border-strong)", color: "var(--app-faint)" }
                        : { border: `1.5px solid ${current ? "var(--brand)" : "var(--app-border-strong)"}`, color: current ? "#fff" : "var(--app-muted)" }
                  }
                  aria-hidden
                >
                  {step.done ? <Check size={15} strokeWidth={3} /> : i + 1}
                </span>
                <div className="min-w-0">
                  <p className={step.done ? "text-sm muted line-through decoration-1" : skip ? "text-sm faint" : "text-sm text-white font-semibold"}>
                    {step.title}
                    {step.done && <span className="sr-only"> (done)</span>}
                    {skip && (
                      <span className="pill ml-2 align-middle">Skipped</span>
                    )}
                  </p>
                  {!step.done && !skip && <p className="text-xs faint mt-0.5">{step.hint}</p>}
                </div>
              </div>
              {!step.done && (
                <div className="flex flex-wrap items-center gap-2 pl-10 sm:pl-0">
                  {!skip &&
                    step.actions.map((a, j) => (
                      <Link key={a.href} href={a.href} className={`btn btn-sm ${current && j === 0 ? "btn-primary" : "btn-secondary"}`}>
                        {a.label}
                      </Link>
                    ))}
                  <SkipStepButton step={step.key} skipped={skip} label={step.title} />
                </div>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
