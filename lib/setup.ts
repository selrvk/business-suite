// The steps of the setup checklist on a new business's dashboard. Safe to import anywhere.
export const SETUP_STEPS = ["details", "products", "sale", "staff", "vehicles", "logins"] as const
export type SetupStepKey = (typeof SETUP_STEPS)[number]

export function isSetupStep(value: unknown): value is SetupStepKey {
  return typeof value === "string" && (SETUP_STEPS as readonly string[]).includes(value)
}
