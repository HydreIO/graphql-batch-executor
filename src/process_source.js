import graphql from 'graphql'
import ProcessingError from './ProcessingError.js'

const { separateOperations, parse, validate } = graphql
const parse_or_errors = document => {
  try {
    return {
      data: parse(document, { noLocation: true }),
    }
  } catch (error) {
    return { errors: [error] }
  }
}

/**
 * Validate an incoming operation
 * @returns an array of documents
 * @throws a ProcessingError if the operation is invalid somehow
 */
export default (schema, document) => {
  if (!document) throw new Error('Missing operation document')

  const { data, errors } = parse_or_errors(document)

  if (errors?.length) {
    throw new ProcessingError({
      operation_type: 'none',
      operation_name: 'none',
      errors,
    })
  }

  const validation_errors = validate(schema, data)

  if (validation_errors?.length) {
    throw new ProcessingError({
      operation_type: 'none',
      operation_name: 'none',
      errors        : validation_errors,
    })
  }

  return Object.values(separateOperations(data))
}
