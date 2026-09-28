/*
 * THEME — the room's base colour. Loaded in <head>, before the first paint, so
 * the page never flashes the wrong colour. Daylight (bright) is the default;
 * the dark rooms are one tap away. The choice is remembered on this device only. External file (never inline) so
 * the CSP needs no exception.
 */
(function () {
  var THEMES = { daylight: '#F4F6FB', midnight: '#0B1220', plum: '#150D1D', slate: '#12171E', onyx: '#0B0A08' }
  function pick() { try { var t = localStorage.getItem('mrcash-theme'); return THEMES[t] ? t : 'daylight' } catch (e) { return 'daylight' } }
  function apply(t) {
    if (!THEMES[t]) t = 'daylight'
    document.documentElement.setAttribute('data-theme', t)
    var m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', THEMES[t])
    try { document.dispatchEvent(new CustomEvent('theme:change', { detail: t })) } catch (e) { /* older browsers: the backdrop keeps its palette until reload */ }
    return t
  }
  apply(pick())
  window.mrcashThemes = Object.keys(THEMES)
  window.setTheme = function (t) { t = apply(t); try { localStorage.setItem('mrcash-theme', t) } catch (e) { /* this device forgets; the default stands */ } return t }
})()
