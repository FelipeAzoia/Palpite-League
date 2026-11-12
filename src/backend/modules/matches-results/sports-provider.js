export class SportsProviderError extends Error {
  constructor(code) {
    super(code)
    this.code = code
  }
}
