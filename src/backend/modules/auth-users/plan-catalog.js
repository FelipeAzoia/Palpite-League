// Catálogo de planos: fonte única dos limites e recursos por plano (SPEC-005, INV-005).
// O preço do Premium não pertence a este catálogo; ele é definido na SPEC-019.
function definePlan(plan) {
	return Object.freeze({ ...plan, features: Object.freeze({ ...plan.features }) })
}

const catalog = Object.freeze({
	free: definePlan({
		id: 'free',
		name: 'Gratuito',
		features: { simultaneousPools: 1, unlimitedParticipation: true, liveResultsInCreatedPools: false },
	}),
	premium: definePlan({
		id: 'premium',
		name: 'Premium',
		features: { simultaneousPools: 10, unlimitedParticipation: true, liveResultsInCreatedPools: true },
	}),
})

export function listPlans() {
	return [catalog.free, catalog.premium]
}

export function getPlan(planId) {
	const plan = Object.hasOwn(catalog, planId) ? catalog[planId] : undefined
	if (!plan) throw new Error(`Plano desconhecido: ${String(planId)}`)
	return plan
}

// Limite de bolões criados simultaneamente, consultado pela criação de bolão (SPEC-007).
export function simultaneousPoolLimit(planId) {
	return getPlan(planId).features.simultaneousPools
}

export function planStatus(planId) {
	// O plano Gratuito tem status "ativo" (OPEN-56). O Premium só existe com assinatura ativa
	// (SPEC-019, garantido no banco); cancelamento e expiração são da SPEC-020.
	getPlan(planId)
	return 'active'
}
