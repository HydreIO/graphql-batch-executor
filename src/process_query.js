import graphql from 'graphql'
import Processing_Error from './processing_error.js'

const {
  execute,
} = graphql

/**
 * Execute a query or mutation
 */
export default async ({
  id,
  log_op,
  operation_type,
  operation_name,
  graphql_options,
}) => {
  log_op('processing query %O', {
    operation_type,
    operation_name,
    'graphql_options.variableValue': graphql_options.variableValues,
  })
  const graphql_result = await execute(graphql_options)
  const bloc_result = {
    operation_name,
    ...graphql_result,
  }
  if (bloc_result.errors?.length) {
    throw new Processing_Error({
      id,
      operation_type,
      operation_name,
    },
    bloc_result)
  }

  return {
    id,
    operation_type,
    ...bloc_result,
  }
}
