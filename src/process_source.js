import graphql from 'graphql'
import graphql_invariant from './graphql_invariant.js'
import Processing_Error from './processing_error.js'

const {
  separateOperations, parse, validate,
} = graphql
const parse_or_errors = document => {
  try {
    return { data: parse(document, { noLocation: true }) }
  } catch (error) {
    return { errors: [error] }
  }
}

/**
 * Validate an incoming json chunk
 * which is a payload including a batch id
 * a query string, and variables
 * @returns an object with the parsed chunk
 * or an object with a graphql error in case of failure
 */
export default schema => ({
  id, document, variables = {},
}) => {
  graphql_invariant(id !== undefined, 'Missing operation id')
  graphql_invariant(document, 'No document was provided')

  const {
    data, errors,
  } = parse_or_errors(document)

  if (errors?.length) {
    throw new Processing_Error({ id },
        {
          errors,
          data: undefined,
        })
  }

  const validation_errors = validate(schema, data)

  if (validation_errors?.length) {
    throw new Processing_Error({ id },
        {
          errors: validation_errors,
          data  : undefined,
        })
  }

  const documents = Object.values(separateOperations(data))

  graphql_invariant(
      documents.length,
      'There must be at least one operation document',
      { id },
  )

  return {
    id,
    documents,
    variables,
  }
}
