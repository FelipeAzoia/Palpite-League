import { describe, expect, it } from 'vitest'
import { prizeTag } from '../../src/frontend/src/final-result-api.js'
import { formatPrizePercent, prizeModelDescriptions, prizeModelLabels } from '../../src/frontend/src/pools-form.js'
import { awardeeLabel, prizeStateLabels, shareLabel } from '../../src/frontend/src/prize-api.js'

// SPEC-030 — premiação por pódio na interface (TC-11).
describe('Premiação por pódio (SPEC-030)', () => {
  it('oferece os quatro modelos, cada um com a explicação', () => {
    expect(Object.keys(prizeModelLabels)).toEqual(['winner_takes_all', 'podium_50_30_20', 'podium_60_30_10', 'podium_70_20_10'])
    expect(prizeModelLabels.podium_50_30_20).toBe('Pódio: 1º 50% · 2º 30% · 3º 20%')
    for (const model of Object.keys(prizeModelLabels)) expect(prizeModelDescriptions[model]).toBeTruthy()
    expect(prizeModelDescriptions.podium_60_30_10).toMatch(/60%, 30% e 10%.*Empatados somam/)
  })

  it('formata a porcentagem no padrão brasileiro', () => {
    expect(formatPrizePercent(37.5)).toBe('37,5%')
    expect(formatPrizePercent(33.33)).toBe('33,33%')
    expect(formatPrizePercent(50)).toBe('50%')
    expect(formatPrizePercent(null)).toBe('')
  })

  it('marca os premiados do pódio no resultado final, e não no vencedor leva tudo', () => {
    const awarded = { awarded: true, prizePercent: 37.5 }
    expect(prizeTag({ prizeModel: 'podium_50_30_20' }, awarded)).toBe('premiado · 37,5%')
    expect(prizeTag({ prizeModel: 'podium_50_30_20' }, { awarded: false, prizePercent: null })).toBe('')
    expect(prizeTag({ prizeModel: 'winner_takes_all' }, { awarded: true, prizePercent: 100 })).toBe('')
  })

  it('mostra a colocação e a porcentagem da própria parte e da lista da administração', () => {
    expect(shareLabel({ prizeModel: 'podium_70_20_10', place: 2, sharePercent: 20 })).toBe('2º lugar · 20% do montante')
    expect(shareLabel({ prizeModel: 'winner_takes_all', place: 1, sharePercent: 100 })).toBe('')
    expect(awardeeLabel({ prizeModel: 'podium_70_20_10' }, { place: 3, name: 'Caio' })).toBe('3º · Caio')
    expect(awardeeLabel({ prizeModel: 'winner_takes_all' }, { place: 1, name: 'Ana' })).toBe('Ana')
    expect(prizeStateLabels.not_winner).toMatch(/premiados/)
  })
})
