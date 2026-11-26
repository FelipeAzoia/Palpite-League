import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { crestSource, localCrestIds } from '../../src/frontend/src/crests.js'

// Escudos servidos pelo próprio sistema, sem depender do servidor de imagens da API-Football.
describe('Escudos dos clubes', () => {
  it('usa a cópia local dos 20 clubes e mantém qualquer outra URL', () => {
    expect(crestSource('https://media.api-sports.io/football/teams/127.png')).toBe('/crests/127.png')
    expect(crestSource('https://media.api-sports.io/football/teams/1062.png')).toBe('/crests/1062.png')
    expect(crestSource('https://media.api-sports.io/football/teams/999999.png')).toBe('https://media.api-sports.io/football/teams/999999.png')
    expect(crestSource(null)).toBe(null)
  })

  it('todas as imagens locais existem no front', () => {
    expect(localCrestIds).toHaveLength(20)
    for (const id of localCrestIds) {
      expect(fs.existsSync(new URL(`../../src/frontend/public/crests/${id}.png`, import.meta.url))).toBe(true)
    }
  })
})
