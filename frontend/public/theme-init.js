// Sets the light or dark theme before the page first paints, so a dark-theme visitor never sees a white flash.
// Loaded as a file (not inline) because the site's Content-Security-Policy only allows scripts from the site itself.
// Same rules as src/application/theme/themePreference.ts: keep the key, values and colors in step.
;(function () {
  var preference = 'auto'
  try {
    var stored = window.localStorage.getItem('washlink.theme')
    if (stored === 'light' || stored === 'dark' || stored === 'auto') preference = stored
  } catch (error) {
    // Storage blocked: follow the device.
  }
  var prefersDark = false
  try {
    prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  } catch (error) {
    // Very old browser: light.
  }
  var theme = preference === 'auto' ? (prefersDark ? 'dark' : 'light') : preference
  document.documentElement.dataset.theme = theme
  var bar = document.querySelector('meta[name="theme-color"]')
  if (bar) bar.setAttribute('content', theme === 'dark' ? '#0A1315' : '#0F766E')
})()
