"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ArrowUpDown, MoreHorizontal, Pencil, Plus, Printer, Search, SlidersHorizontal, Trash2, X } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ConfirmDialog } from "@/components/modal"
import { useScanner } from "@/hooks/use-scanner"
import { beep } from "@/lib/beep"
import { useBusinessFeatures, useCan } from "@/components/business-features"
import { describeExpiry } from "@/lib/expiry"
import { money, num } from "@/lib/format"
import type { Item } from "@/lib/types"
import { deleteProduct } from "./actions"
import { AdjustStockModal, ProductModal } from "./product-modals"

type SortKey = "name" | "brand" | "current_stock" | "price_sell" | "value" | "location" | "expires"
const PAGE_SIZE = 15

export function ProductsTable({
  items,
  isAdmin,
  suppliers = {},
  expiry = {},
}: {
  items: Item[]
  isAdmin: boolean
  /** Supplier names by id. */
  suppliers?: Record<number, string>
  /** Each product's nearest expiry date (YYYY-MM-DD), by product id. */
  expiry?: Record<number, string>
}) {
  const { options, customFields, lowStock, today } = useBusinessFeatures()
  const can = useCan()
  const showCost = can("see_costs")
  const showCategory = options.includes("categories")
  const showLocation = options.includes("locations")
  const showSupplier = options.includes("suppliers")
  const showExpiry = options.includes("expiry")
  const levelOf = (i: Item) => i.reorder_level ?? lowStock
  const [search, setSearch] = useState("")
  const [brand, setBrand] = useState("")
  const [category, setCategory] = useState("")
  const [supplier, setSupplier] = useState("")
  const [stockFilter, setStockFilter] = useState<"all" | "low" | "out">("all")
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "name", desc: false })
  const [page, setPage] = useState(0)
  const [adding, setAdding] = useState<{ barcode: string } | null>(null)
  const [editing, setEditing] = useState<Item | null>(null)
  const [adjusting, setAdjusting] = useState<Item | null>(null)
  const [deleting, setDeleting] = useState<Item | null>(null)
  const [unknownCode, setUnknownCode] = useState<string | null>(null)

  const brands = useMemo(() => [...new Set(items.map(i => i.brand).filter(Boolean) as string[])].sort(), [items])
  const categories = useMemo(() => [...new Set(items.map(i => i.category).filter(Boolean) as string[])].sort(), [items])
  const supplierOptions = useMemo(
    () => [...new Set(items.map(i => i.supplier_id).filter(Boolean) as number[])].map(id => [id, suppliers[id] ?? "?"] as const).sort((a, b) => a[1].localeCompare(b[1])),
    [items, suppliers],
  )
  /** Small details shown under a product's name. */
  const details = (i: Item) =>
    [
      showCategory && i.category,
      showSupplier && i.supplier_id && suppliers[i.supplier_id],
      ...customFields.map(f => {
        const v = i.extra?.[f.id]
        return v === null || v === undefined || v === "" ? null : `${f.label}: ${v}`
      }),
    ].filter(Boolean) as string[]

  // Scanning a product anywhere on this page finds it.
  useScanner(code => {
    setPage(0)
    if (items.some(i => i.barcode === code)) {
      beep()
      setUnknownCode(null)
      setSearch(code)
    } else {
      beep("error")
      setUnknownCode(code)
    }
  })

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = items.filter(i => {
      const haystack = [i.name, i.brand, i.barcode, i.category, i.location, i.supplier_id ? suppliers[i.supplier_id] : null, ...Object.values(i.extra ?? {}).map(v => (v == null ? null : String(v)))]
      if (q && !haystack.some(v => v?.toLowerCase().includes(q))) return false
      if (brand && i.brand !== brand) return false
      if (category && i.category !== category) return false
      if (supplier && String(i.supplier_id ?? "") !== supplier) return false
      if (stockFilter === "low" && !(i.current_stock > 0 && i.current_stock <= levelOf(i))) return false
      if (stockFilter === "out" && i.current_stock > 0) return false
      return true
    })
    const value = (i: Item) =>
      sort.key === "value"
        ? i.current_stock * i.price_sell
        : sort.key === "brand"
          ? (i.brand ?? "")
          : sort.key === "location"
            ? (i.location ?? "~")
            : sort.key === "expires"
              ? (expiry[i.id] ?? "9999-12-31")
              : i[sort.key]
    return filtered.sort((a, b) => {
      const [x, y] = [value(a), value(b)]
      const cmp = typeof x === "string" ? x.localeCompare(String(y)) : Number(x) - Number(y)
      return sort.desc ? -cmp : cmp
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- levelOf only depends on lowStock
  }, [items, search, brand, category, supplier, stockFilter, sort, lowStock, suppliers, expiry])

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const current = Math.min(page, pageCount - 1)
  const visible = rows.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE)
  const filtering = search || brand || category || supplier || stockFilter !== "all"

  const sortBy = (key: SortKey) =>
    setSort(s => ({ key, desc: s.key === key ? !s.desc : !["name", "brand", "location", "expires"].includes(key) }))
  const sortHeader = (k: SortKey, label: string, right = false) => (
    <th className={right ? "num" : undefined}>
      <button className={`inline-flex items-center gap-1 uppercase ${sort.key === k ? "text-white" : ""}`} onClick={() => sortBy(k)}>
        {label}
        <ArrowUpDown size={11} />
      </button>
    </th>
  )

  const stockBadge = (i: Item) =>
    i.current_stock <= 0 ? (
      <span className="pill" data-tone="bad">Out</span>
    ) : i.current_stock <= levelOf(i) ? (
      <span className="pill" data-tone="warn">{num(i.current_stock)} low</span>
    ) : (
      <span className="tabular">{num(i.current_stock)}</span>
    )

  const expiryBadge = (i: Item) => {
    if (!expiry[i.id]) return <span className="faint">—</span>
    const e = describeExpiry(expiry[i.id], today)
    return (
      <span className="pill" data-tone={e.tone}>
        {e.text}
      </span>
    )
  }

  const actions = (i: Item) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="btn btn-ghost btn-icon" aria-label={`Actions for ${i.name}`}>
          <MoreHorizontal size={16} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {can("edit_products") && (
          <DropdownMenuItem onSelect={() => setEditing(i)}>
            <Pencil /> Edit
          </DropdownMenuItem>
        )}
        {can("adjust_stock") && (
          <DropdownMenuItem onSelect={() => setAdjusting(i)}>
            <SlidersHorizontal /> Adjust stock
          </DropdownMenuItem>
        )}
        {i.barcode && (
          <DropdownMenuItem asChild>
            <Link href={`/print/labels/products?ids=${i.id}`} target="_blank">
              <Printer /> Print label
            </Link>
          </DropdownMenuItem>
        )}
        {isAdmin && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(i)}>
              <Trash2 /> Delete
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )

  return (
    <div className="flex flex-col gap-3">
      {unknownCode && (
        <div className="alert alert-warn flex flex-wrap items-center justify-between gap-2">
          <span>
            No product has barcode <span className="mono font-semibold">{unknownCode}</span>.
          </span>
          <span className="flex gap-2">
            {can("edit_products") && (
              <button
                className="btn btn-primary btn-sm"
                onClick={() => {
                  setAdding({ barcode: unknownCode })
                  setUnknownCode(null)
                }}
              >
                <Plus size={13} /> Add it as a new product
              </button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={() => setUnknownCode(null)} aria-label="Dismiss">
              <X size={13} />
            </button>
          </span>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 [&>select]:sm:w-auto">
        <div className="relative sm:flex-1 sm:min-w-64">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 faint" />
          <input
            className="input pl-9"
            value={search}
            onChange={e => {
              setSearch(e.target.value)
              setPage(0)
            }}
            placeholder={`Search name, brand, barcode${showLocation ? ", shelf" : ""}… or just scan`}
          />
        </div>
        <select className="input" value={brand} onChange={e => {
            setBrand(e.target.value)
            setPage(0)
          }}>
          <option value="">All brands</option>
          {brands.map(b => (
            <option key={b}>{b}</option>
          ))}
        </select>
        {showCategory && categories.length > 0 && (
          <select
            className="input"
            value={category}
            onChange={e => {
              setCategory(e.target.value)
              setPage(0)
            }}
          >
            <option value="">All categories</option>
            {categories.map(c => (
              <option key={c}>{c}</option>
            ))}
          </select>
        )}
        {showSupplier && supplierOptions.length > 0 && (
          <select
            className="input"
            value={supplier}
            onChange={e => {
              setSupplier(e.target.value)
              setPage(0)
            }}
          >
            <option value="">All suppliers</option>
            {supplierOptions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        )}
        <div className="segmented self-stretch">
          {(["all", "low", "out"] as const).map(f => (
            <button key={f} data-active={stockFilter === f} onClick={() => {
                setStockFilter(f)
                setPage(0)
              }}>
              {f === "all" ? "All" : f === "low" ? "Low stock" : "Out of stock"}
            </button>
          ))}
        </div>
      </div>
      {filtering && (
        <button
          className="btn btn-ghost btn-sm self-start"
          onClick={() => {
            setSearch("")
            setBrand("")
            setCategory("")
            setSupplier("")
            setStockFilter("all")
          }}
        >
          <X size={12} /> Clear filters · {rows.length} of {items.length}
        </button>
      )}

      {/* Desktop table */}
      <div className="table-wrap hidden md:block">
        <table className="table">
          <thead>
            <tr>
              {sortHeader("name", "Product")}
              {sortHeader("brand", "Brand")}
              {showLocation && sortHeader("location", "Shelf")}
              {sortHeader("current_stock", "Stock", true)}
              {showCost && <th className="num">Cost</th>}
              {sortHeader("price_sell", "Price", true)}
              {showExpiry && sortHeader("expires", "Expires")}
              {sortHeader("value", "Stock value", true)}
              <th />
            </tr>
          </thead>
          <tbody>
            {visible.map(i => (
              <tr key={i.id}>
                <td>
                  <p className="font-medium text-white">{i.name}</p>
                  <p className="text-[0.7rem] faint mono">{i.barcode ?? "no barcode"}</p>
                  {details(i).length > 0 && <p className="text-[0.7rem] faint">{details(i).join(" · ")}</p>}
                </td>
                <td className="muted">{i.brand ?? "—"}</td>
                {showLocation && <td className="muted">{i.location ?? "—"}</td>}
                <td className="num">
                  {stockBadge(i)} <span className="faint text-xs">{i.unit}</span>
                </td>
                {showCost && <td className="num muted">{money(i.price_buy)}</td>}
                <td className="num text-white">{money(i.price_sell)}</td>
                {showExpiry && <td>{expiryBadge(i)}</td>}
                <td className="num text-good font-semibold">{money(i.current_stock * i.price_sell)}</td>
                <td className="w-10">{actions(i)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && (items.length ? <p className="empty">No products match.</p> : <NoProducts isAdmin={isAdmin} />)}
      </div>

      {/* Mobile list */}
      <div className="md:hidden card divide-y divide-white/5">
        {visible.map(i => (
          <div key={i.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-white truncate">{i.name}</p>
              <p className="text-xs faint truncate">
                {[i.brand, money(i.price_sell), i.unit, showLocation && i.location, ...details(i)].filter(Boolean).join(" · ")}
              </p>
              {showExpiry && expiry[i.id] && <div className="mt-1">{expiryBadge(i)}</div>}
            </div>
            <div className="text-right text-sm">{stockBadge(i)}</div>
            {actions(i)}
          </div>
        ))}
        {visible.length === 0 && (items.length ? <p className="empty">No products match.</p> : <NoProducts isAdmin={isAdmin} />)}
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-between">
          <button className="btn btn-secondary btn-sm" onClick={() => setPage(current - 1)} disabled={current === 0}>
            Previous
          </button>
          <span className="text-xs faint">
            Page {current + 1} of {pageCount}
          </span>
          <button className="btn btn-secondary btn-sm" onClick={() => setPage(current + 1)} disabled={current >= pageCount - 1}>
            Next
          </button>
        </div>
      )}

      <ProductModal
        open={!!adding || !!editing}
        item={editing}
        initialBarcode={adding?.barcode}
        onClose={() => {
          setAdding(null)
          setEditing(null)
        }}
      />
      <AdjustStockModal item={adjusting} onClose={() => setAdjusting(null)} />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete product?"
        message={
          <>
            <span className="text-white font-semibold">{deleting?.name}</span> will be removed from inventory. Past sales
            keep its name. This can&apos;t be undone.
          </>
        }
        confirmLabel="Delete"
        action={() => deleteProduct(deleting!.id)}
      />
    </div>
  )
}

/** Header button that opens the add-product form. */
export function AddProductButton() {
  const [open, setOpen] = useState(false)
  const can = useCan()
  if (!can("edit_products")) return null
  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        <Plus size={15} /> Add product
      </button>
      <ProductModal open={open} item={null} onClose={() => setOpen(false)} />
    </>
  )
}

/** What a new business sees before it has any products. */
function NoProducts({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className="empty">
      <p className="empty-title">No products yet</p>
      <p className="text-sm muted max-w-md">
        Add them one at a time with Add product, or scan a barcode to start one.
        {isAdmin && (
          <>
            {" "}
            Already have a list?{" "}
            <Link href="/inventory/import" className="underline">
              Import it from Excel
            </Link>
            .
          </>
        )}
      </p>
    </div>
  )
}
