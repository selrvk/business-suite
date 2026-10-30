/** The business's logo if it set one in Settings, otherwise its initials. */
export function BrandMark({ name, logoUrl, size = 40 }: { name: string; logoUrl?: string | null; size?: number }) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- logo can be any URL the owner pastes
      <img src={logoUrl} alt={name} style={{ height: size, width: "auto", maxWidth: size * 3, objectFit: "contain" }} />
    )
  }

  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(word => word[0])
      .join("")
      .toUpperCase() || "•"

  return (
    <div className="brand-badge" style={{ width: size, height: size, fontSize: size * 0.46 }} aria-hidden>
      {initials}
    </div>
  )
}
