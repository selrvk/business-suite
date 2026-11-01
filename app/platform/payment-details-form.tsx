"use client"

import { useRef, useState } from "react"
import { ImageUp, Save, Trash2 } from "lucide-react"
import { removePaymentQr, savePaymentInstructions, uploadPaymentQr } from "./actions"

/** The payment details every business sees on Billing: text, plus an optional QR code. */
export function PaymentDetailsForm({ instructions, qrUrl }: { instructions: string; qrUrl: string | null }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState(instructions)
  const [qr, setQr] = useState(qrUrl)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)

  async function run(action: () => Promise<{ ok: true; data: unknown } | { ok: false; error: string }>, done: string, after?: (data: unknown) => void) {
    setBusy(true)
    setStatus(null)
    const result = await action()
    setBusy(false)
    if (!result.ok) return setStatus({ ok: false, text: result.error })
    after?.(result.data)
    setStatus({ ok: true, text: done })
  }

  function upload(file: File) {
    const form = new FormData()
    form.set("qr", file)
    run(() => uploadPaymentQr(form), "QR code saved.", url => setQr(url as string)).finally(() => {
      if (inputRef.current) inputRef.current.value = ""
    })
  }

  return (
    <div className="grid gap-5 md:grid-cols-[1fr_auto]">
      <div className="flex flex-col gap-3">
        {status && <p className={`alert ${status.ok ? "alert-success" : "alert-error"}`}>{status.text}</p>}
        <textarea
          className="input min-h-32 leading-relaxed"
          value={text}
          onChange={e => setText(e.target.value)}
          maxLength={1000}
          placeholder={"GCash: 0917 123 4567 (Your Name)\nBank transfer: BDO 0000 0000 0000 (Your Name)\nThen send the reference number below."}
        />
        <button type="button" className="btn btn-primary self-start" disabled={busy || text.trim() === instructions.trim()} onClick={() => run(() => savePaymentInstructions(text), "Saved. Billing shows it now.")}>
          <Save size={14} /> Save text
        </button>
      </div>
      <div className="flex flex-col items-center gap-2">
        <div className="w-40 h-40 rounded-lg flex items-center justify-center overflow-hidden" style={{ background: qr ? "#fff" : "var(--app-bg)" }}>
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element -- uploaded QR code, shown as-is
            <img src={qr} alt="Payment QR code" className="max-w-full max-h-full" />
          ) : (
            <span className="text-xs faint text-center px-3">No QR code. Upload your GCash &quot;Receive money&quot; QR.</span>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={e => {
            const file = e.target.files?.[0]
            if (file) upload(file)
          }}
        />
        <div className="flex gap-1.5">
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => inputRef.current?.click()}>
            <ImageUp size={13} /> {qr ? "Replace" : "Upload QR"}
          </button>
          {qr && (
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => run(removePaymentQr, "QR code removed.", () => setQr(null))}>
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
