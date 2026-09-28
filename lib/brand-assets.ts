/**
 * Brand assets that live on the generation CDN rather than in the repository.
 *
 * The emblem was painted with Higgsfield from the master prompt recorded in
 * docs/BRAND_PROMPTS.md; the four candidates are kept here so swapping the
 * house mark is a one-line change. The Earth texture wraps the cursor globe.
 * Both hosts are allowed by the CSP in next.config.js.
 */
const CDN = 'https://d8j0ntlcm91z4.cloudfront.net/user_3HcoDUttWldZsray5X12PGDUTBl/'

export const LOGO_CANDIDATES = {
  brassEngraved: `${CDN}hf_20260926_225131_2d4ae34a-1951-45e5-90df-515822301b44.png`,
  emeraldEnamel: `${CDN}hf_20260926_225130_a50017e7-cc74-4f80-89e1-320a72d128b3.png`,
  goldMonoline: `${CDN}hf_20260926_225155_d7dab8de-5849-4ca3-a45c-d9271fc05540.png`,
  botanicalWreath: `${CDN}hf_20260926_225130_07e29d6b-17bf-4f49-aa57-aad2b57e7d42.png`,
} as const

/** The house mark in use. Transparent PNG, square. */
export const LOGO_URL = LOGO_CANDIDATES.brassEngraved
/** The CDN's lightweight WebP of the same file, for the header and small tiles. */
export const LOGO_MIN_URL = LOGO_URL.replace(/\.png$/, '_min.webp')

/** Equirectangular satellite-style Earth, wrapped around the cursor globe. */
export const EARTH_TEXTURE_URL = `${CDN}hf_20260926_225130_6606d685-5630-46ee-9775-1739d6244823_min.webp`
