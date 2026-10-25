import { describe, expect, it } from 'vitest'
import { findFeeLikeWords } from './trainingTermsFeeWording'

describe('Fee-like wording check (W6 review polish)', () => {
  it('w6_polish_fee_like_words_are_found_case_insensitively', () => {
    expect(findFeeLikeWords(['A training FEE of 500 applies.'])).toEqual(['fee'])
    expect(findFeeLikeWords(['Magbayad ng deposit', 'May kaltas sa sahod', 'Repayment if you leave'])).toEqual([
      'bayad',
      'deposit',
      'kaltas',
      'repay',
    ])
    expect(findFeeLikeWords(['Bond required. Deductions apply.', 'Multa at penalty', 'We charge for uniforms'])).toEqual([
      'bond',
      'deduct',
      'multa',
      'penalty',
      'charge',
    ])
  })

  it('w6_polish_neutral_terms_are_not_flagged', () => {
    expect(findFeeLikeWords(['Three supervised days. Feedback after each day. Lunch provided.', '', 'Travel covered.'])).toEqual([])
  })
})
