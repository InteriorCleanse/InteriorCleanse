export const BRAND_NAME = 'InteriorCleanse'

export const SITE = {
  name: BRAND_NAME,
  tagline: 'For Mind, Home, Body & Spirit',
  url: 'https://interiorcleanse.com',
  contactEmail: 'hello@interiorcleanse.com',
  social: {
    tiktok: 'https://www.tiktok.com/@interiorcleanse',
    instagram: 'https://www.instagram.com/interiorcleanse',
  },
  affiliateDisclosure:
    'This site contains affiliate links. We may earn a commission if you purchase through links on this page, at no extra cost to you.',
}

export const EMAIL_FORM_ENDPOINT = process.env.NEXT_PUBLIC_EMAIL_FORM_ENDPOINT || ''
export const PLAUSIBLE_DOMAIN = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN || ''
