// AVANT has no PostCSS plugins. This file exists so Next stops at this
// directory instead of finding a parent repository's config (which loads
// Tailwind, a package AVANT does not install).
export default { plugins: {} }
