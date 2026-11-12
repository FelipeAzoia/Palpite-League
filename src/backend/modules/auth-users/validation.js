export const nameRuleMessage = 'Informe um nome com até 100 caracteres.'

export function isValidName(name) {
	const length = Array.from(name).length
	return length >= 1 && length <= 100
}
