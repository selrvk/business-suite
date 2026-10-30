import { notFound } from "next/navigation"
import { Barcode } from "@/components/barcode"
import { CloseButton, PrintButton } from "@/components/print-button"
import { requireUser } from "@/lib/auth"
import { getSupabase } from "@/lib/supabase/server"
import { hasModule } from "@/lib/config"
import { fetchAll } from "@/lib/db"
import { money } from "@/lib/format"
import type { Employee, Item, Vehicle } from "@/lib/types"

export const metadata = { title: "Print labels" }

type Label = { key: string; code: string; title: string; subtitle: string | null; price?: string }

export default async function LabelsPage({
  params,
  searchParams,
}: {
  params: Promise<{ kind: string }>
  searchParams: Promise<{ ids?: string; copies?: string }>
}) {
  const [{ kind }, query] = await Promise.all([params, searchParams])
  const allowed =
    (kind === "employees" && (hasModule("attendance") || hasModule("fleet"))) ||
    (kind === "vehicles" && hasModule("fleet")) ||
    (kind === "products" && hasModule("inventory"))
  if (!allowed) notFound()

  const supabase = await getSupabase()
  const ids = (query.ids ?? "").split(",").map(Number).filter(n => Number.isInteger(n) && n > 0)
  const copies = Math.min(50, Math.max(1, Number(query.copies) || 1))

  async function loadLabels(): Promise<Label[]> {
    if (kind === "employees") {
      let q = supabase.from("employees").select("id, name, code, position, phone, active").order("name")
      q = ids.length ? q.in("id", ids) : q.eq("active", true)
      const { data } = await q
      return ((data ?? []) as Employee[]).map(e => ({ key: `e${e.id}`, code: e.code, title: e.name, subtitle: e.position }))
    } else if (kind === "vehicles") {
      let q = supabase.from("vehicles").select("*").order("name")
      if (ids.length) q = q.in("id", ids)
      const { data } = await q
      return ((data ?? []) as Vehicle[]).map(v => ({ key: `v${v.id}`, code: v.code, title: v.name, subtitle: v.plate_number }))
    } else {
      const { data } = ids.length
        ? await supabase.from("items").select("*").in("id", ids)
        : await fetchAll<Item>((a, b) => supabase.from("items").select("*").not("barcode", "is", null).order("name").order("id").range(a, b))
      return ((data ?? []) as Item[])
        .filter(i => i.barcode)
        .map(i => ({ key: `p${i.id}`, code: i.barcode!, title: i.name, subtitle: i.brand, price: money(i.price_sell) }))
    }
  }

  const [{ business }, labels] = await Promise.all([requireUser(), loadLabels()])

  const sheet = labels.flatMap(l => Array.from({ length: copies }, (_, n) => ({ ...l, key: `${l.key}-${n}` })))
  const isProduct = kind === "products"
  const heading = kind === "employees" ? "Employee badges" : kind === "vehicles" ? "Vehicle tags" : "Product labels"

  return (
    <div className="labels-screen">
      <style>{`
        .labels-screen { padding: 2rem 1rem; display: flex; flex-direction: column; align-items: center; gap: 1.25rem; }
        .sheet { background: #fff; color: #111; width: 210mm; max-width: 100%; min-height: 100px; padding: 10mm;
          display: flex; flex-wrap: wrap; gap: 4mm; align-content: flex-start; box-shadow: 0 20px 60px rgba(0,0,0,.5); }
        .card-label { width: 86mm; height: 54mm; border: 1px solid #bbb; border-radius: 3mm; padding: 4mm 5mm; display: flex;
          flex-direction: column; justify-content: space-between; break-inside: avoid; overflow: hidden; font-family: var(--font-jakarta), sans-serif; }
        .card-label .org { display: flex; align-items: center; gap: 2mm; font-size: 8pt; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; border-left: 3px solid var(--brand); padding-left: 2mm; }
        .card-label .org img { height: 6mm; max-width: 18mm; object-fit: contain; }
        .card-label .name { font-size: 15pt; font-weight: 700; line-height: 1.15; }
        .card-label .sub { font-size: 9pt; color: #555; }
        .card-label .code { display: flex; justify-content: center; }
        .small-label { width: 50mm; height: 30mm; border: 1px dashed #bbb; padding: 2mm 3mm; display: flex; flex-direction: column;
          justify-content: space-between; break-inside: avoid; overflow: hidden; font-family: var(--font-jakarta), sans-serif; }
        .small-label .name { font-size: 7.5pt; font-weight: 600; line-height: 1.2; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .small-label .price { font-size: 10pt; font-weight: 800; }
        .small-label .code { display: flex; justify-content: center; }
        @media print {
          @page { size: A4; margin: 8mm; }
          .labels-screen { padding: 0; display: block; }
          .sheet { box-shadow: none; width: auto; padding: 0; }
        }
      `}</style>

      <div className="no-print flex flex-wrap items-center justify-center gap-3 text-center">
        <p className="display text-2xl text-white w-full">
          {heading} · {sheet.length}
        </p>
        {isProduct && (
          <form className="flex items-center gap-2">
            {ids.length > 0 && <input type="hidden" name="ids" value={ids.join(",")} />}
            <label className="text-sm muted flex items-center gap-2">
              Copies each
              <input className="input w-20" name="copies" type="number" min={1} max={50} defaultValue={copies} />
            </label>
            <button className="btn btn-secondary">Update</button>
          </form>
        )}
        <PrintButton />
        <CloseButton />
      </div>

      {sheet.length === 0 ? (
        <p className="muted no-print">
          {isProduct ? "None of these products have a barcode yet. Edit a product and click Generate to give it one." : "Nothing to print."}
        </p>
      ) : (
        <div className="sheet">
          {sheet.map(l =>
            isProduct ? (
              <div key={l.key} className="small-label">
                <div>
                  <div className="name">{l.title}</div>
                  <div className="price">{l.price}</div>
                </div>
                <div className="code">
                  <Barcode value={l.code} height={26} width={1.3} fontSize={10} />
                </div>
              </div>
            ) : (
              <div key={l.key} className="card-label">
                <div className="org">
                  {business.logo_url && (
                    // eslint-disable-next-line @next/next/no-img-element -- uploaded logo
                    <img src={business.logo_url} alt="" />
                  )}
                  {business.name}
                </div>
                <div>
                  <div className="name">{l.title}</div>
                  {l.subtitle && <div className="sub">{l.subtitle}</div>}
                </div>
                <div className="code">
                  <Barcode value={l.code} height={42} width={1.8} />
                </div>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  )
}
