"use client"

import { createContext, useContext } from "react"
import type { CustomField, ProductOption } from "@/lib/features"

type BusinessFeatures = {
  options: ProductOption[]
  customFields: CustomField[]
  /** The business's default low-stock level. */
  lowStock: number
  /** Today in the business's time zone (YYYY-MM-DD), from the server. */
  today: string
}

const Context = createContext<BusinessFeatures>({ options: [], customFields: [], lowStock: 10, today: "" })

/** Gives every app page the business's product options and custom fields (set in the app layout). */
export function BusinessFeaturesProvider({ value, children }: { value: BusinessFeatures; children: React.ReactNode }) {
  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useBusinessFeatures() {
  return useContext(Context)
}
