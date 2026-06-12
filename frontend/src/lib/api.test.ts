import type { AxiosError } from 'axios'
import { describe, expect, it } from 'vitest'

import { formatCurrency, getApiErrorMessage } from './api'

function axiosLikeResponse(data: unknown, status = 400): AxiosError {
  const err = new Error('request failed') as AxiosError
  err.isAxiosError = true
  err.response = { status, data, statusText: '', headers: {}, config: {} as never }
  return err
}

describe('getApiErrorMessage', () => {
  it('new envelope uses error.message', () => {
    const e = axiosLikeResponse({ error: { code: 'X', message: 'Sunucu mesajı' } })
    expect(getApiErrorMessage(e, 'yedek')).toBe('Sunucu mesajı')
  })

  it('falls back to legacy FastAPI detail string', () => {
    const e = axiosLikeResponse({ detail: 'Eski stil detay' })
    expect(getApiErrorMessage(e, 'y')).toBe('Eski stil detay')
  })

  it('generic Error surfaces message', () => {
    expect(getApiErrorMessage(new Error('açık mesaj'), 'y')).toBe('açık mesaj')
  })

  it('unknown uses fallback', () => {
    expect(getApiErrorMessage('x', 'yedek')).toBe('yedek')
  })
})

describe('formatCurrency', () => {
  it('formats zero with TRY grouping', () => {
    expect(formatCurrency(0)).toMatch(/0/)
    expect(formatCurrency(0)).toContain('₺')
  })
})
