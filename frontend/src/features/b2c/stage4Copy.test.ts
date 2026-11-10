import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { workerEarlyStepNotice } from '@washlink/shared'

describe('wording fixes', () => {
  it('tells the washer what each closed step is waiting for', () => {
    expect(workerEarlyStepNotice('accepted')).toBe("This booking can't start yet. You can begin up to 2 hours before its scheduled time.")
    expect(workerEarlyStepNotice('worker_on_the_way')).toContain('mark arrival')
    expect(workerEarlyStepNotice('arrived')).toContain('start the wash')
    expect(workerEarlyStepNotice('in_progress')).toContain('complete the wash')
    expect(workerEarlyStepNotice('in_progress')).not.toContain('arrival')
  })

  it('no longer calls the washers independent on the landing page', () => {
    expect(readFileSync('src/features/b2c/landing/LandingHero.tsx', 'utf8')).not.toContain('independent washer')
  })
})

describe('search and link previews', () => {
  const html = readFileSync('index.html', 'utf8')

  it('describes the site and gives sharing previews an image', () => {
    expect(html).toMatch(/<meta name="description" content="[^"]{50,160}"/)
    for (const property of ['og:title', 'og:description', 'og:image', 'og:url']) {
      expect(html).toContain(`property="${property}"`)
    }
    expect(html).toContain('name="twitter:card" content="summary_large_image"')
    expect(html).toContain('<link rel="canonical"')
  })

  it('ships robots.txt, a sitemap, the preview image and a WashLink favicon', () => {
    expect(readFileSync('public/robots.txt', 'utf8')).toContain('Sitemap: https://washlink-h7rc.onrender.com/sitemap.xml')
    expect(readFileSync('public/sitemap.xml', 'utf8')).toContain('<loc>https://washlink-h7rc.onrender.com/</loc>')
    expect(readFileSync('public/og-image.png').byteLength).toBeGreaterThan(10000)
    expect(readFileSync('public/favicon.svg', 'utf8')).toContain('aria-label="WashLink"')
  })
})
