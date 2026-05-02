/**
 * jsdom + @testing-library/react boru hattını doğrular (Faz 0f).
 * Davranış testleri özellik dosyalarının yanına (`*.test.tsx`) konsolide edilebilir.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('test stack', () => {
  it('renders React in jsdom', () => {
    render(<button type="button">Future ERP smoke</button>)
    const el = screen.getByRole('button', { name: /Future ERP smoke/ })
    expect(el.textContent).toBe('Future ERP smoke')
  })
})
