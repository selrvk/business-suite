"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ArrowDown, ArrowUp, ArrowUpDown, Download, FileUp, ListFilter, MoreHorizontal, Pencil, Plus, Printer, Search, SlidersHorizontal, Trash2, X } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { downloadExcel, type ExportRow } from "@/components/export-button"
import { ConfirmDialog } from "@/components/modal"
import { useScanner } from "@/hooks/use-scanner"
import { beep } from "@/lib/beep"
import { useBusinessFeatures, useCan } from "@/components/business-features"
import { describeExpiry } from "@/lib/expiry"
import { money, num } from "@/lib/format"
import type { Item } from "@/lib/types"
import { deleteProduct } from "./actions"
import { AdjustStockModal, ProductModal, type StockPlace } from "./product-modals"

type SortKey = "name" | "brand" | "current_stock" | "price_sell" | "value" | "location" | "expires"
const PAGE_SIZE = 25

export function ProductsTable({
  items,
  isAdmin,
  suppliers = {},
  expiry = {},
  place,
  breakdown = null,
  locationFilter = null,
}: {
  items: Item[]
  isAdmin: boolean
  /** Supplier names by id. */
  suppliers?: Record<number, string>
  /** Each product's nearest expiry date (YYYY-MM-DD), by product id. */
  expiry?: Record<number, string>
  /** Where the stock shown is counted (see StockPlace). */
  place?: StockPlace
  /** Each product's stock per location (product id → location id → quantity), when there's more than one. */
  breakdown?: Record<number, Record<number, number>> | null
  /** The location picker, shown with the other filters. */
  locationFilter?: React.ReactNode
}) {
  const { options, customFields, lowStock, today, locations } = useBusinessFeatures()
  /** "Main store: 45 · Warehouse: 60", for hovering over a stock number. */
  const spread = (i: Item) =>
    breakdown && locations.multi ? locations.open.map(l => `${l.name}: ${breakdown[i.id]?.[l.id] ?? 0}`).join(" · ") : undefined
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
  // On phones the brand/category/supplier pickers fold away behind a Filters button.
  const [showPickers, setShowPickers] = useState(false)

  const brands = useMemo(() => [...new Set(items.map(i => i.brand).filter(Boolean) as string[])].sort(), [items])
  const categories = useMemo(() => [...new Set(items.map(i => i.category).filter(Boolean) as string[])].sort(), [items])
  const supplierOptions = useMemo(
    () => [...new Set(items.map(i => i.supplier_id).filter(Boolean) as number[])].map(id => [id, suppliers[id] ?? "?"] as const).sort((a, b) => a[1].localeCompare(b[1])),
    [items, suppliers],
  )
  const isLow = (i: Item) => i.current_stock > 0 && i.current_stock <= levelOf(i)
  const lowCount = useMemo(() => items.filter(isLow).length, [items, lowStock]) // eslint-disable-line react-hooks/exhaustive-deps -- isLow only depends on lowStock
  const outCount = useMemo(() => items.filter(i => i.current_stock <= 0).length, [items])

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
      if (stockFilter === "low" && !isLow(i)) return false
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- levelOf and isLow only depend on lowStock
  }, [items, search, brand, category, supplier, stockFilter, sort, lowStock, suppliers, expiry])

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const current = Math.min(page, pageCount - 1)
  const visible = rows.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE)
  const filtering = search || brand || category || supplier || stockFilter !== "all"
  const pickersOn = [brand, category, supplier].filter(Boolean).length
  const hasPickers = brands.length > 0 || (showCategory && categories.length > 0) || (showSupplier && supplierOptions.length > 0)
  const clearFilters = () => {
    setSearch("")
    setBrand("")
    setCategory("")
    setSupplier("")
    setStockFilter("all")
    setPage(0)
  }

  const sortBy = (key: SortKey) =>
    setSort(s => ({ key, desc: s.key === key ? !s.desc : !["name", "brand", "location", "expires"].includes(key) }))
  const sortHeader = (k: SortKey, label: string, right = false, className = "") => {
    const active = sort.key === k
    const Icon = active ? (sort.desc ? ArrowDown : ArrowUp) : ArrowUpDown
    return (
      <th className={`${right ? "num" : ""} ${className}`.trim() || undefined} aria-sort={active ? (sort.desc ? "descending" : "ascending") : undefined}>
        <button type="button" className={`inline-flex items-center gap-1 uppercase hover:text-white ${active ? "text-white" : ""}`} onClick={() => sortBy(k)}>
          {label}
          <Icon size={11} className={active ? "" : "opacity-60"} aria-hidden />
        </button>
      </th>
    )
  }

  /** Stock with its unit; amber when low, a red "Out" when there's none. Stacked (the "Low" tag under the number) on phones. */
  const stockCell = (i: Item, stacked = false) =>
    i.current_stock <= 0 ? (
      <span className="pill" data-tone="bad" title={spread(i)}>
        Out
      </span>
    ) : stacked ? (
      <span className="inline-flex flex-col items-end gap-1 whitespace-nowrap" title={spread(i)}>
        <span>
          <span className={`tabular font-semibold ${isLow(i) ? "text-warn" : "text-white"}`}>{num(i.current_stock)}</span>{" "}
          <span className="faint text-xs">{i.unit}</span>
        </span>
        {isLow(i) && (
          <span className="pill" data-tone="warn">
            Low
          </span>
        )}
      </span>
    ) : (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap" title={spread(i)}>
        {isLow(i) && (
          <span className="pill" data-tone="warn">
            Low
          </span>
        )}
        <span className={`tabular font-semibold ${isLow(i) ? "text-warn" : "text-white"}`}>{num(i.current_stock)}</span>
        <span className="faint text-xs">{i.unit}</span>
      </span>
    )

  /** The product's name; tapping it opens the edit form for those who may edit. */
  const nameOf = (i: Item, className = "") =>
    can("edit_products") ? (
      <button type="button" className={`product-name ${className}`} onClick={() => setEditing(i)}>
        {i.name}
      </button>
    ) : (
      <p className={`font-medium text-white ${className}`}>{i.name}</p>
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
      <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
        {locationFilter}
        <div className="flex gap-2 md:flex-1 md:min-w-64">
          <div className="relative flex-1 min-w-0">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 faint" aria-hidden />
            <input
              className="input pl-9"
              value={search}
              aria-label="Search products"
              onChange={e => {
                setSearch(e.target.value)
                setPage(0)
              }}
              placeholder={`Search name, brand, barcode${showLocation ? ", shelf" : ""}… or just scan`}
            />
          </div>
          {hasPickers && (
            <button type="button" className="btn btn-secondary md:hidden shrink-0" aria-expanded={showPickers} onClick={() => setShowPickers(v => !v)}>
              <ListFilter size={14} aria-hidden /> Filters{pickersOn > 0 && ` · ${pickersOn}`}
            </button>
          )}
        </div>
        {hasPickers && (
          <div className={`${showPickers ? "grid" : "hidden"} grid-cols-1 sm:grid-cols-3 gap-2 md:flex md:flex-wrap`}>
            {brands.length > 0 && (
              <select
                className="input md:w-auto"
                aria-label="Brand"
                value={brand}
                onChange={e => {
                  setBrand(e.target.value)
                  setPage(0)
                }}
              >
                <option value="">All brands</option>
                {brands.map(b => (
                  <option key={b}>{b}</option>
                ))}
              </select>
            )}
            {showCategory && categories.length > 0 && (
              <select
                className="input md:w-auto"
                aria-label="Category"
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
                className="input md:w-auto"
                aria-label="Supplier"
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
          </div>
        )}
        <div className="segmented w-full md:w-auto" role="group" aria-label="Show">
          {(
            [
              ["all", "All", items.length],
              ["low", "Low stock", lowCount],
              ["out", "Out of stock", outCount],
            ] as const
          ).map(([f, label, n]) => (
            <button
              key={f}
              type="button"
              className="flex-1 md:flex-none"
              data-active={stockFilter === f}
              aria-pressed={stockFilter === f}
              onClick={() => {
                setStockFilter(f)
                setPage(0)
              }}
            >
              {label}
              <span className="seg-count" data-tone={n > 0 ? (f === "low" ? "warn" : f === "out" ? "bad" : undefined) : undefined}>
                {num(n)}
              </span>
            </button>
          ))}
        </div>
      </div>
      {filtering && (
        <p className="flex items-center gap-3 text-xs muted">
          <span>
            {num(rows.length)} of {num(items.length)} products
          </span>
          <button type="button" className="inline-flex items-center gap-1 underline decoration-dotted hover:text-white" onClick={clearFilters}>
            <X size={12} aria-hidden /> Clear filters
          </button>
        </p>
      )}

      {/* Table on wide screens (brand and value get their own columns on the widest) */}
      <div className="table-wrap hidden lg:block">
        <table className="table">
          <thead>
            <tr>
              {sortHeader("name", "Product")}
              {sortHeader("brand", "Brand", false, "hidden xl:table-cell")}
              {showLocation && sortHeader("location", "Shelf")}
              {sortHeader("current_stock", "Stock", true)}
              {showCost && <th className="num">Cost</th>}
              {sortHeader("price_sell", "Price", true)}
              {showExpiry && sortHeader("expires", "Expires")}
              {sortHeader("value", "Value", true, "hidden xl:table-cell")}
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map(i => (
              <tr key={i.id}>
                <td className="max-w-[26rem]">
                  {nameOf(i)}
                  <p className="text-[0.72rem] faint truncate">
                    <span className="mono">{i.barcode ?? "No barcode"}</span>
                    {i.brand && <span className="xl:hidden"> · {i.brand}</span>}
                    {details(i).map(d => (
                      <span key={d}> · {d}</span>
                    ))}
                  </p>
                </td>
                <td className="muted hidden xl:table-cell">{i.brand ?? "—"}</td>
                {showLocation && <td className="muted whitespace-nowrap">{i.location ?? "—"}</td>}
                <td className="num">{stockCell(i)}</td>
                {showCost && <td className="num muted">{money(i.price_buy)}</td>}
                <td className="num text-white">{money(i.price_sell)}</td>
                {showExpiry && <td>{expiryBadge(i)}</td>}
                <td className="num muted hidden xl:table-cell">{i.current_stock > 0 ? money(i.current_stock * i.price_sell) : <span className="faint">—</span>}</td>
                <td className="w-10">{actions(i)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && (items.length ? <p className="empty">No products match.</p> : <NoProducts isAdmin={isAdmin} />)}
      </div>

      {/* List on phones and tablets */}
      <div className="lg:hidden card divide-y divide-white/5">
        {visible.map(i => (
          <div key={i.id} className="flex items-center gap-3 pl-4 pr-2 py-3">
            <div className="min-w-0 flex-1">
              {nameOf(i, "block max-w-full truncate text-left")}
              <p className="text-xs faint truncate">{[i.brand, money(i.price_sell), showLocation && i.location, ...details(i)].filter(Boolean).join(" · ")}</p>
              {showExpiry && expiry[i.id] && <div className="mt-1">{expiryBadge(i)}</div>}
            </div>
            <div className="text-right text-sm">{stockCell(i, true)}</div>
            {actions(i)}
          </div>
        ))}
        {visible.length === 0 && (items.length ? <p className="empty">No products match.</p> : <NoProducts isAdmin={isAdmin} />)}
      </div>

      {rows.length > 0 && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs muted tabular">
            {num(current * PAGE_SIZE + 1)}–{num(Math.min(rows.length, (current + 1) * PAGE_SIZE))} of {num(rows.length)}
          </span>
          {pageCount > 1 && (
            <div className="flex items-center gap-2">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPage(current - 1)} disabled={current === 0}>
                Previous
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPage(current + 1)} disabled={current >= pageCount - 1}>
                Next
              </button>
            </div>
          )}
        </div>
      )}

      <ProductModal
        open={!!adding || !!editing}
        item={editing}
        place={place}
        breakdown={editing ? breakdown?.[editing.id] : undefined}
        initialBarcode={adding?.barcode}
        onClose={() => {
          setAdding(null)
          setEditing(null)
        }}
      />
      <AdjustStockModal
        item={adjusting}
        onClose={() => setAdjusting(null)}
        place={place}
        breakdown={adjusting ? breakdown?.[adjusting.id] : undefined}
      />
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

/** The header's "More" menu: import, export and labels, which are used now and then. */
export function ProductsMenu({ exportRows, filename, canImport }: { exportRows: ExportRow[]; filename: string; canImport: boolean }) {
  const [state, setState] = useState<"idle" | "busy" | "failed">("idle")
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="btn btn-secondary" aria-label="More product actions" disabled={state === "busy"}>
          <MoreHorizontal size={15} aria-hidden /> {state === "busy" ? "Exporting…" : state === "failed" ? "Export failed" : "More"}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {canImport && (
          <DropdownMenuItem asChild>
            <Link href="/inventory/import">
              <FileUp /> Import from Excel
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onSelect={async () => {
            setState("busy")
            try {
              await downloadExcel(exportRows, filename, "Inventory")
              setState("idle")
            } catch {
              setState("failed")
            }
          }}
        >
          <Download /> Export to Excel
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/print/labels/products" target="_blank">
            <Printer /> Print labels
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Header button that opens the add-product form. */
export function AddProductButton({ place }: { place?: StockPlace }) {
  const [open, setOpen] = useState(false)
  const can = useCan()
  if (!can("edit_products")) return null
  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        <Plus size={15} /> Add product
      </button>
      <ProductModal open={open} item={null} onClose={() => setOpen(false)} place={place} />
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
