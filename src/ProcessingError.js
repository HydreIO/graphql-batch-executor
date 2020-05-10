export default class ProcessingError extends Error {
  constructor({
    operation_name = 'none',
    operation_type = 'none',
    data,
    errors,
  }) {
    super('GraphQL processing error')
    Object.assign(this, {
      data,
      errors,
      operation_name,
      operation_type,
    })
    this.name = 'ProcessingError'
  }
}
