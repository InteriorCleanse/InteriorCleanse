# InteriorCleanse

A static-export Next.js storefront and author site — *For Mind, Home, Body & Spirit*.
Dark editorial design with real-time 3D product viewers.

## Run locally

```bash
npm install
npm run dev
```

## Build static site

```bash
npm run build
```

The site uses `output: 'export'`, so GitHub Pages serves the generated `out/`
directory without a Node server.

## The stack

| Library | What it does here |
| --- | --- |
| `three` + `@react-three/fiber` + `drei` | Hero scene, scroll gallery, product viewers |
| `@react-three/postprocessing` | Bloom + vignette grading on every WebGL scene |
| `@babylonjs/core` | The Spirit page orb — code-split to that route only |
| `gsap` + ScrollTrigger | Headline reveals, grid stagger, hero parallax |
| `lenis` | Site-wide weighted smooth scrolling |
| `framer-motion` | Cross-route page transitions |
| `@lottiefiles/dotlottie-react` | Track icons, trust strip, email capture |
| `@rive-app/react-canvas` | Optional interactive vector animations (see below) |

Every WebGL scene is loaded through a client wrapper with `ssr: false`
(`components/3d/*Loader.tsx`) — Server Components cannot pass that flag to
`next/dynamic` themselves.

### 3D lighting

Scenes light themselves with `<StudioEnvironment>`, a rig of drei
`Lightformer` planes rendered into the environment map. This deliberately
avoids drei's `Environment preset=`, which downloads a multi-megabyte `.hdr`
from a third-party CDN at runtime.

### Lottie icons

The six icons in `public/animations/` are generated, not downloaded:

```bash
npm run build:lottie
```

Edit `scripts/build-lottie.js` to change a colour or shape. Because they are
authored here, there is no CDN dependency and no third-party licence to track.

Note: the dotLottie player fetches its WASM renderer at runtime. If that
request fails, `<LottieIcon>` falls back to the ◇ mark rather than a blank gap.

### Rive (optional, not yet wired to assets)

`components/RiveAnimation.tsx` is ready but **no `.riv` files ship with the
repo** — Rive files are binary and must be exported by hand. To use it:

1. Download a file from [rive.app/community](https://rive.app/community)
   (check each file's licence).
2. Save it to `public/rive/`, e.g. `public/rive/candle.riv`.
3. Render `<RiveAnimation src="/rive/candle.riv" />`.

Until a file exists at that path the component renders its `fallback` prop, so
a missing asset degrades gracefully instead of showing a dead canvas.

## Add a product

Edit `content/products.json`. Required: `slug`, `name`, `category`, `tagline`,
`description`, `price`, `heroImage`, `gallery`, `viewer`, `channels`,
`featured`, `comingSoon`. Optional: `materialColor` (drives the 3D viewer's
base colour), `badge`, `careNotes`.

`category` must be one of `candle`, `print`, `tote`, `mug`, `cleaning`, `book`,
`custom` — each maps to real geometry in `components/3d/ProductGeometry.tsx`.

## Add a book

Edit `content/books.json`. Required: `slug`, `title`, `coverImage`, `imageAlt`,
`hook`, `bullets`, `paperbackUrl`, `kindleUrl`, `featured`. Optional: `track`
(`mind` | `health` | `home`) — `mind` and untracked books appear in the main
library, `health` books in the second band.

Faith-library titles live in `spiritBooks` in `lib/content.ts`.

## Environment variables

Copy `.env.example` to `.env.local`. Because the site is static, forms post
directly to hosted endpoints (Formspree, ConvertKit, Mailchimp). Analytics stays
off unless a public domain/ID is configured.

## Deployment

`.github/workflows/deploy.yml` builds and deploys `out/` to GitHub Pages on
pushes to `main`. In repository settings, set Pages source to **GitHub Actions**.

### Custom domain

`public/CNAME` contains `interiorcleanse.com` and is copied into `out/` on every
build. For the domain to serve, the owner must also:

1. Point DNS at GitHub Pages — four `A` records for the apex
   (`185.199.108–111.153`), plus a `CNAME` for `www` →
   `interiorcleanse.github.io`.
2. In **Settings → Pages**, set the custom domain to `interiorcleanse.com` and
   enable *Enforce HTTPS* once the certificate is issued.

## Launch notes

See `CONTENT_CHECKLIST.md` for placeholder content, legal review, and the real
affiliate links required before launch.
