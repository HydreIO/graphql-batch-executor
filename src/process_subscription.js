import graphql from 'graphql'
import Processing_Error from './processing_error.js'

import node_stream from 'stream'
import {
  promisify,
} from 'util'

const {
  subscribe,
} = graphql
const pipeline = promisify(node_stream.pipeline)

/**
 * execute a subscription
 */
export default async ({
  id,
  log_op,
  operation_type,
  operation_name,
  graphql_options,
  stream,
}) => {
  log_op('processing subscription %O', {
    operation_type,
    operation_name,
    'graphql_options.variableValue': graphql_options.variableValues,
  })
  const maybe_iterator = await subscribe(graphql_options)
  if (maybe_iterator[Symbol.asyncIterator]) {
    await pipeline(
        maybe_iterator,
        async function* (source) {
          for await (const chunk of source) {
            yield {
              id,
              operation_type,
              operation_name,
              ...chunk,
            }
          }
        },
        stream,
    )
    return
  }

  throw new Processing_Error({
    id,
    operation_type,
    operation_name,
  },
  maybe_iterator)
}
