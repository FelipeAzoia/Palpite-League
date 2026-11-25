import { describe, expect, it } from 'vitest'
import { periodErrors } from '../../src/frontend/src/pools-form.js'

// SPEC-007 INV-006 na tela: datas conferidas antes do envio, com as mesmas regras do backend.
describe('Datas do bolão na criação', () => {
  const today = '2026-11-24'

  it('não aceita início antes de hoje', () => {
    expect(periodErrors({ startsOn: '2026-11-23', endsOn: '' }, today)).toEqual({ startsOn: 'A data de início não pode ser anterior a hoje.' })
    expect(periodErrors({ startsOn: '', endsOn: '' }, today).startsOn).toBeTruthy()
  })

  it('não aceita fim antes do início', () => {
    expect(periodErrors({ startsOn: today, endsOn: '2026-11-10' }, today)).toEqual({ endsOn: 'A data de fim não pode ser anterior à data de início.' })
  })

  it('aceita início hoje e fim no mesmo dia ou depois', () => {
    expect(periodErrors({ startsOn: today, endsOn: today }, today)).toEqual({})
    expect(periodErrors({ startsOn: '2026-12-01', endsOn: '2026-12-31' }, today)).toEqual({})
  })
})
