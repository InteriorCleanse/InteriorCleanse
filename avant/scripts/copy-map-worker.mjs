#!/usr/bin/env node
/**
 * MapLibre 6 runs its tile parsing in a module Worker that it locates
 * relative to its own file. Bundlers rewrite that location, so the worker is
 * published as a static file instead and PriceMap points MapLibre at it.
 * Runs before dev and build, and after install.
 */
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const src = resolve(root, 'node_modules/maplibre-gl/dist')
const out = resolve(root, 'public/maplibre')
mkdirSync(out, { recursive: true })
for (const f of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) copyFileSync(resolve(src, f), resolve(out, f))
const version = JSON.parse(readFileSync(resolve(root, 'node_modules/maplibre-gl/package.json'), 'utf8')).version
console.log(`maplibre worker ${version} → public/maplibre/`)
