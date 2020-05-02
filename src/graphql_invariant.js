import Processing_Error from './processing_error.js'
import graphql from 'graphql'

const {
  GraphQLError,
} = graphql

export default (condition, message, {
  id = 'none',
  operation_type = 'none',
  operation_name = 'none',
} = {}) => {
  if (!condition) {
    throw new Processing_Error({
      id,
      operation_type,
      operation_name,
    },
    {
      errors: [new GraphQLError(message)],
      data: undefined,
    })
  }
}
