"use client"

import { createContext, useContext } from "react"
import type { CustomField, ProductOption } from "@/lib/features"
import type { Permission } from "@/lib/permissions"

type BusinessFeatures = {
  options: ProductOption[]
  customFields: CustomField[]
  /** The business's default low-stock level. */
  lowStock: number
  /** Today in the business's time zone (YYYY-MM-DD), from the server. */
  today: string
  /** What the signed-in person may do (see lib/permissions.ts). */
  permissions: Permission[]
  isAdmin: boolean
  /** VAT-registered businesses drop VAT on Senior/PWD sales. */
  vatRegistered: boolean
  /** Senior/PWD rate for products that don't set their own (20, 5 or 0). */
  seniorDefault: number
  /** BMBE or cooperative: no 5% on basic goods. */
  seniorBasicExempt: boolean
}

const Context = createContext<BusinessFeatures>({
  options: [],
  customFields: [],
  lowStock: 10,
  today: "",
  permissions: [],
  isAdmin: false,
  vatRegistered: false,
  seniorDefault: 5,
  seniorBasicExempt: false,
})

/** Gives every app page the business's product options and custom fields (set in the app layout). */
export function BusinessFeaturesProvider({ value, children }: { value: BusinessFeatures; children: React.ReactNode }) {
  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useBusinessFeatures() {
  return useContext(Context)
}

/** Whether the signed-in person may do something. */
export function useCan() {
  const { permissions } = useContext(Context)
  return (permission: Permission) => permissions.includes(permission)
}
