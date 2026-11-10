// Logo files from the brand kit (logo-branding/woofle-meowcaron-brand-kit, guide v1.0), served
// from public/. Use them as they are: the guide forbids recolouring, stretching, rotating, shadows
// and retyping the name in another font. Width / height are the files' own viewBox, so a logo
// scaled by height keeps its proportions.
export const BRAND_LOGO = {
  // Main horizontal logo with "Siêu thị của chó mèo": light backgrounds (header, footer).
  horizontal: '/brand/logo-ngang.svg',
  // One-colour white version: dark backgrounds (admin sidebar).
  horizontalWhite: '/brand/logo-ngang-1-mau-trang.svg',
  // Dog + cat in the cyan tile, for places too narrow for the name (phone header).
  icon: '/brand/logo-icon.svg',
  // Raster icon for JSON-LD: search engines want a PNG / JPG logo, not SVG.
  iconPng: '/brand/logo-icon-512.png',
} as const;

export const LOGO_HORIZONTAL_SIZE = { width: 728, height: 120 } as const;
export const LOGO_HORIZONTAL_WHITE_SIZE = { width: 726, height: 120 } as const;
export const LOGO_ICON_SIZE = { width: 368, height: 240 } as const;
