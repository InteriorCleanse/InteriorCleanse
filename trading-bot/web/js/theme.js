/*
 * THEME — the room's base colour. Loaded in <head>, before the first paint, so
 * the page never flashes the wrong colour. Linen (warm stone and cream) is
 * the default; bright Daylight and the dark rooms are one tap away. The choice is remembered on this device only. External file (never inline) so
 * the CSP needs no exception.
 */
(function () {
  var THEMES = { linen: '#E8E2D7', daylight: '#F4F6FB', midnight: '#0B1220', plum: '#150D1D', slate: '#12171E', onyx: '#0B0A08' }
  function pick() { try { var t = localStorage.getItem('mrcash-theme'); return THEMES[t] ? t : 'linen' } catch (e) { return 'linen' } }
  function apply(t) {
    if (!THEMES[t]) t = 'linen'
    document.documentElement.setAttribute('data-theme', t)
    document.documentElement.setAttribute('data-tone', t === 'linen' || t === 'daylight' ? 'light' : 'dark')
    var m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', THEMES[t])
    try { document.dispatchEvent(new CustomEvent('theme:change', { detail: t })) } catch (e) { /* older browsers: the backdrop keeps its palette until reload */ }
    return t
  }
  apply(pick())
  window.mrcashThemes = Object.keys(THEMES)
  window.setTheme = function (t) { t = apply(t); try { localStorage.setItem('mrcash-theme', t) } catch (e) { /* this device forgets; the default stands */ } return t }
})()
