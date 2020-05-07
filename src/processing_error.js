// GraphqlQL error name is readonly
/* eslint-disable unicorn/custom-error-definition */
import graphql from 'graphql'

const { GraphQLError } = graphql

export default class Processing_Error extends GraphQLError {
  constructor({
    id = 'none', operation_name = 'none', operation_type = 'none',
  },
  raw_graphql_error) {
    super('processing error')
    Object.assign(this, {
      ...raw_graphql_error,
      id,
      operation_name,
      operation_type,
    })
  }
}
