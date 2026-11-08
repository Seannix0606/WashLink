import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { secretsMatch } from '../../../../supabase/functions/send-service-push/secretsMatch.ts'

// Node only: the function itself has never been deployed or run on Deno (docs/b2c/DEPLOYMENT.md).
describe('push webhook secret', () => {
  it('matches an equal secret', () => {
    expect(secretsMatch('long-random-secret', 'long-random-secret')).toBe(true)
  })

  it('refuses a different secret of the same length', () => {
    expect(secretsMatch('long-random-secret', 'long-random-secreT')).toBe(false)
  })

  it('refuses a secret of a different length, without throwing', () => {
    expect(secretsMatch('short', 'long-random-secret')).toBe(false)
    expect(secretsMatch('long-random-secret', 'short')).toBe(false)
  })

  it('never matches when either side is empty or missing, including an unset secret', () => {
    expect(secretsMatch('', '')).toBe(false)
    expect(secretsMatch('', 'long-random-secret')).toBe(false)
    expect(secretsMatch('long-random-secret', '')).toBe(false)
    expect(secretsMatch(null, 'long-random-secret')).toBe(false)
    expect(secretsMatch('long-random-secret', undefined)).toBe(false)
    expect(secretsMatch(null, undefined)).toBe(false)
  })

  it('is what the function uses, in place of a direct comparison', () => {
    const source = readFileSync('../supabase/functions/send-service-push/index.ts', 'utf8')
    expect(source).toContain("secretsMatch(request.headers.get('x-webhook-secret'), Deno.env.get('PUSH_WEBHOOK_SECRET'))")
    expect(source).not.toMatch(/x-webhook-secret['"]\)\s*[!=]==/)
    expect(source).not.toMatch(/[!=]==\s*secret\b/)
  })
})
