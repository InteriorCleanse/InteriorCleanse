/*
 * THEME — the room's base colour. Loaded in <head>, before the first paint, so
 * the page never flashes the wrong colour. Midnight navy is the default; the
 * choice is remembered on this device only. External file (never inline) so
 * the CSP needs no exception.
 */
(function () {
  var THEMES = { midnight: '#0B1220', plum: '#150D1D', slate: '#12171E', onyx: '#0B0A08' }
  function pick() { try { var t = localStorage.getItem('mrcash-theme'); return THEMES[t] ? t : 'midnight' } catch (e) { return 'midnight' } }
  function apply(t) {
    if (!THEMES[t]) t = 'midnight'
    document.documentElement.setAttribute('data-theme', t)
    var m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', THEMES[t])
    return t
  }
  apply(pick())
  window.mrcashThemes = Object.keys(THEMES)
  window.setTheme = function (t) { t = apply(t); try { localStorage.setItem('mrcash-theme', t) } catch (e) { /* this device forgets; the default stands */ } return t }
})()
