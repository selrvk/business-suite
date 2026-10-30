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
import { money, num } from "@/lib/format"
import type { Item } from "@/lib/types"
import { deleteProduct } from "./actions"
import { AdjustStockModal, ProductModal } from "./product-modals"

type SortKey = "name" | "brand" | "current_stock" | "price_sell" | "value"
const PAGE_SIZE = 15

export function ProductsTable({ items, isAdmin, lowStock }: { items: Item[]; isAdmin: boolean; lowStock: number }) {
  const [search, setSearch] = useState("")
  const [brand, setBrand] = useState("")
  const [stockFilter, setStockFilter] = useState<"all" | "low" | "out">("all")
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "name", desc: false })
  const [page, setPage] = useState(0)
  const [adding, setAdding] = useState<{ barcode: string } | null>(null)
  const [editing, setEditing] = useState<Item | null>(null)
  const [adjusting, setAdjusting] = useState<Item | null>(null)
  const [deleting, setDeleting] = useState<Item | null>(null)
  const [unknownCode, setUnknownCode] = useState<string | null>(null)

  const brands = useMemo(() => [...new Set(items.map(i => i.brand).filter(Boolean) as string[])].sort(), [items])

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
      if (q && ![i.name, i.brand, i.barcode].some(v => v?.toLowerCase().includes(q))) return false
      if (brand && i.brand !== brand) return false
      if (stockFilter === "low" && !(i.current_stock > 0 && i.current_stock <= lowStock)) return false
      if (stockFilter === "out" && i.current_stock > 0) return false
      return true
    })
    const value = (i: Item) =>
      sort.key === "value" ? i.current_stock * i.price_sell : sort.key === "brand" ? (i.brand ?? "") : i[sort.key]
    return filtered.sort((a, b) => {
      const [x, y] = [value(a), value(b)]
      const cmp = typeof x === "string" ? x.localeCompare(String(y)) : Number(x) - Number(y)
      return sort.desc ? -cmp : cmp
    })
  }, [items, search, brand, stockFilter, sort, lowStock])

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const current = Math.min(page, pageCount - 1)
  const visible = rows.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE)
  const filtering = search || brand || stockFilter !== "all"

  const sortBy = (key: SortKey) => setSort(s => ({ key, desc: s.key === key ? !s.desc : key !== "name" && key !== "brand" }))
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
    ) : i.current_stock <= lowStock ? (
      <span className="pill" data-tone="warn">{num(i.current_stock)} low</span>
    ) : (
      <span className="tabular">{num(i.current_stock)}</span>
    )

  const actions = (i: Item) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="btn btn-ghost btn-icon" aria-label={`Actions for ${i.name}`}>
          <MoreHorizontal size={16} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => setEditing(i)}>
          <Pencil /> Edit
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setAdjusting(i)}>
          <SlidersHorizontal /> Adjust stock
        </DropdownMenuItem>
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
            <button
              className="btn btn-primary btn-sm"
              onClick={() => {
                setAdding({ barcode: unknownCode })
                setUnknownCode(null)
              }}
            >
              <Plus size={13} /> Add it as a new product
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setUnknownCode(null)} aria-label="Dismiss">
              <X size={13} />
            </button>
          </span>
        </div>
      )}

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 faint" />
          <input
            className="input pl-9"
            value={search}
            onChange={e => {
              setSearch(e.target.value)
              setPage(0)
            }}
            placeholder="Search name, brand or barcode — or just scan"
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
              {sortHeader("current_stock", "Stock", true)}
              <th className="num">Cost</th>
              {sortHeader("price_sell", "Price", true)}
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
                </td>
                <td className="muted">{i.brand ?? "—"}</td>
                <td className="num">
                  {stockBadge(i)} <span className="faint text-xs">{i.unit}</span>
                </td>
                <td className="num muted">{money(i.price_buy)}</td>
                <td className="num text-white">{money(i.price_sell)}</td>
                <td className="num text-good font-semibold">{money(i.current_stock * i.price_sell)}</td>
                <td className="w-10">{actions(i)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && <p className="empty">{items.length ? "No products match." : "No products yet. Add one or scan a barcode."}</p>}
      </div>

      {/* Mobile list */}
      <div className="md:hidden card divide-y divide-white/5">
        {visible.map(i => (
          <div key={i.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-white truncate">{i.name}</p>
              <p className="text-xs faint truncate">
                {[i.brand, money(i.price_sell), i.unit].filter(Boolean).join(" · ")}
              </p>
            </div>
            <div className="text-right text-sm">{stockBadge(i)}</div>
            {actions(i)}
          </div>
        ))}
        {visible.length === 0 && <p className="empty">{items.length ? "No products match." : "No products yet."}</p>}
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
  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        <Plus size={15} /> Add product
      </button>
      <ProductModal open={open} item={null} onClose={() => setOpen(false)} />
    </>
  )
}
