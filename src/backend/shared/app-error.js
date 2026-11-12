export class AppError extends Error {
  constructor(status, type, message, fields) {
    super(message)
    this.status = status
    this.type = type
    this.fields = fields
  }
}
