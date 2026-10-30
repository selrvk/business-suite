// The Business Suite logo: a receipt being scanned (red laser across a barcode).
// app/icon.svg is the same drawing; keep them in sync if you change it.

export const BRAND_COLORS = {
  tile: "#4C7DFF",
  paper: "#F7F5EF",
  ink: "#0B0E14",
  laser: "#FF2D3D",
}

export const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="15" fill="${BRAND_COLORS.tile}"/>
  <path d="M19 11h26a1 1 0 0 1 1 1v38l-3.5 3-3.5-3-3.5 3-3.5-3-3.5 3-3.5-3-3.5 3-3.5-3V12a1 1 0 0 1 1-1z" fill="${BRAND_COLORS.paper}"/>
  <g fill="${BRAND_COLORS.ink}">
    <rect x="22" y="17" width="2.2" height="18"/>
    <rect x="25.4" y="17" width="1.1" height="18"/>
    <rect x="27.6" y="17" width="3" height="18"/>
    <rect x="31.8" y="17" width="1.1" height="18"/>
    <rect x="34" y="17" width="2.2" height="18"/>
    <rect x="37.3" y="17" width="1.1" height="18"/>
    <rect x="39.5" y="17" width="2.5" height="18"/>
  </g>
  <rect x="22" y="40" width="20" height="2.2" rx="1.1" fill="#A19E96"/>
  <rect x="22" y="44.5" width="12" height="2.2" rx="1.1" fill="#A19E96"/>
  <rect x="9" y="22.5" width="46" height="8" rx="4" fill="${BRAND_COLORS.laser}" opacity="0.25"/>
  <rect x="9" y="25" width="46" height="3" rx="1.5" fill="${BRAND_COLORS.laser}"/>
</svg>`

export const LOGO_DATA_URI = `data:image/svg+xml;base64,${Buffer.from(LOGO_SVG).toString("base64")}`
