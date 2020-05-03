import graphql from 'graphql'
import graphql_invariant from './graphql_invariant.js'
import Processing_Error from './processing_error.js'

const {
  separateOperations, parse, validate,
} = graphql

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
  graphql_invariant(id !== undefined, 'Missing batch id')
  const parsed = parse(document, {
    noLocation: true,
  })
  const errors = validate(schema, parsed)

  if (errors.length) {
    throw new Processing_Error({
      id,
    },
    {
      errors,
      data: undefined,
    })
  }

  const documents = Object.values(separateOperations(parsed))
  graphql_invariant(
      documents.length,
      'There must be at least one operation document',
      {
        id,
      },
  )

  return {
    id,
    documents,
    variables,
  }
}
