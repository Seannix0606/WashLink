# 03 · SEO, metadata and the installable app

> Documented 2026-11-10 from the live site and `frontend/index.html` at `4012ce7`.

## `<head>` as served (`frontend/index.html`)
| Tag | Value |
|---|---|
| `<html lang>` | `en` |
| `<title>` | `WashLink — Book a car wash in minutes` |
| `viewport` | `width=device-width, initial-scale=1.0, viewport-fit=cover` |
| `theme-color` | `#0F766E` (brand-700) |
| icon | `/favicon.svg` (**the default Vite logo, not WashLink's mark**) |
| `manifest` | `/manifest.webmanifest` |
| `apple-touch-icon` | `/apple-touch-icon.png` (180 px, white drop on teal) |
| `apple-mobile-web-app-capable`, `mobile-web-app-capable` | `yes` |
| `apple-mobile-web-app-title` | `WashLink` |
| `apple-mobile-web-app-status-bar-style` | `default` |
| Fonts | Google Fonts: Archivo (width 125, weight 800) and Inter 400–800, `display=swap` |

The page body is an empty `<div id="root">`: everything, including the headline, is rendered by JavaScript. Search
engines that run JavaScript see the landing page; others see only the title.

## Manifest (`frontend/public/manifest.webmanifest`)
`name`/`short_name` WashLink · `description` "Book a car wash at your home, office or parking spot." · `start_url`,
`scope`, `id` `/` · `display` standalone · `orientation` portrait · `background_color` `#ffffff` · `theme_color`
`#0F766E` · icons `icon-192.png`, `icon-512.png` (also maskable).

## Service worker and offline
`sw.js` caches only `/offline.html` and serves it when a page navigation fails. It never caches the app or data.

Response headers as live (checked 2026-11-10). The live Render service was created by hand, not from the Blueprint, so
the headers and rewrite rule in `render.yaml` are **not** applied:

| Path | Headers |
|---|---|
| `/`, `/sw.js` | `cache-control: public, max-age=0, s-maxage=300`, HSTS, `x-content-type-options: nosniff` |
| `/manifest.webmanifest` | served as `binary/octet-stream` (should be `application/manifest+json`) |
| all | **no** Content-Security-Policy, X-Frame-Options, Referrer-Policy or Permissions-Policy |

## Gaps (not present on the live site)
| Missing | Why it matters |
|---|---|
| `<meta name="description">` | Search results show no summary |
| Open Graph / Twitter tags (`og:title`, `og:description`, `og:image`, `og:url`) | Shared links on Facebook, Messenger, Viber show no preview |
| `<link rel="canonical">` | Search engines can't tell the preferred address |
| `robots.txt` (live returns 404) | No crawl rules or sitemap pointer |
| `sitemap.xml` (live returns 404) | Single page, but still useful for discovery |
| WashLink favicon | Browser tabs show the Vite logo |
| Structured data (LocalBusiness / Service) | No rich results for the service area or prices |
| Server-rendered headline | Content only exists after JavaScript runs |

Suggested wording already used in the product, if the owner wants to fill these in (Phase B): description
"Book a car wash at your home, office or parking spot." (manifest) and the landing hero line "Your car. Washed where
it parks."
