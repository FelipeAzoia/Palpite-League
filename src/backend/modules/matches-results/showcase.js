import { AppError } from '../../shared/app-error.js'

// SPEC-031 — consulta somente leitura do Brasileirão 2024 pela API-Football, para demonstrar a
// integração real. Os dados nunca vão para o catálogo usado pelos bolões (INV-004).
// - uma chamada à API por janela de cache de 24 horas: os dados de 2024 não mudam e o plano gratuito
//   limita as chamadas diárias (INV-005);
// - consultas simultâneas compartilham a mesma chamada;
// - falha da API com cópia anterior em cache: devolve a cópia, indicando quando foi obtida (A2);
// - a chave da API nunca aparece em respostas nem no log técnico (RNF15).

export const showcaseSeason = 2024
export const defaultShowcaseTtlMs = 24 * 60 * 60 * 1000

export function createApiFootballShowcase({ provider = null, now = Date.now, ttlMs = defaultShowcaseTtlMs, logger } = {}) {
  let cached = null
  let inFlight = null

  const configured = () => provider !== null && typeof provider?.fetchSeasonShowcase === 'function'

  function view(entry, stale) {
    return {
      source: 'api-football',
      season: showcaseSeason,
      fetchedAt: entry.fetchedAt,
      stale,
      rounds: entry.rounds,
    }
  }

  async function load() {
    const data = await provider.fetchSeasonShowcase(showcaseSeason)
    cached = { rounds: data.rounds, fetchedAt: new Date(now()).toISOString(), fetchedAtMs: now() }
    return cached
  }

  async function getShowcase() {
    if (!configured()) {
      throw new AppError(503, 'showcase_not_configured', 'A API-Football não está configurada neste ambiente.')
    }
    if (cached && now() - cached.fetchedAtMs < ttlMs) return view(cached, false)

    inFlight ??= load().finally(() => {
      inFlight = null
    })
    try {
      return view(await inFlight, false)
    } catch (error) {
      logger?.warn?.('sports-showcase', `unavailable:${error?.code ?? 'unknown'}`)
      if (cached) return view(cached, true)
      throw new AppError(503, 'showcase_unavailable', 'Não foi possível consultar a API-Football agora. Tente novamente em instantes.')
    }
  }

  return {
    getShowcase,
    status: () => ({ apiFootball2024: { configured: configured(), season: showcaseSeason } }),
  }
}
