import { describe, expect, it } from 'vitest'
import { buildPoolRequest, centsFromMaskedInput, entryFeeErrors, formatCentsInput } from '../../src/frontend/src/pools-form.js'

// Taxa de entrada com máscara de banco: só dígitos, entrando pela direita, em centavos inteiros.
describe('Máscara do valor da taxa de entrada', () => {
  it('cada dígito entra pela direita e empurra os outros', () => {
    let cents = 0
    const typed = []
    for (const digit of '12345') {
      cents = centsFromMaskedInput(`${formatCentsInput(cents)}${digit}`, cents)
      typed.push(formatCentsInput(cents))
    }
    expect(typed).toEqual(['0,01', '0,12', '1,23', '12,34', '123,45'])
  })

  it('apagar tira o último dígito, e o valor volta para a direita', () => {
    expect(centsFromMaskedInput('1,2', 123)).toBe(12)
    expect(centsFromMaskedInput('0,0', 0)).toBe(0)
    expect(centsFromMaskedInput('', 5)).toBe(0)
  })

  it('ignora letras, vírgulas e pontos, e não passa de 5 dígitos', () => {
    expect(centsFromMaskedInput('R$ 25,50abc', 0)).toBe(2550)
    expect(centsFromMaskedInput('999,991', 99999)).toBe(99999)
  })

  it('formata no padrão brasileiro e envia ao backend com ponto decimal', () => {
    expect(formatCentsInput(0)).toBe('0,00')
    expect(formatCentsInput(50000)).toBe('500,00')
    expect(buildPoolRequest({ name: 'B', startsOn: '', endsOn: '', entryFeeCents: 1990, prizeModel: 'x', tiebreaker: 'y', matchIds: [], roundNumbers: [] }).entryFee).toBe('19.90')
  })

  it('confere a faixa permitida antes do envio', () => {
    expect(entryFeeErrors(0)).toEqual({})
    expect(entryFeeErrors(100)).toEqual({})
    expect(entryFeeErrors(50000)).toEqual({})
    expect(entryFeeErrors(99).entryFee).toMatch(/R\$ 1,00 e R\$ 500,00/)
    expect(entryFeeErrors(50001).entryFee).toBeTruthy()
  })
})
