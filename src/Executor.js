import graphql from 'graphql'
import process_source from './process_source.js'
import { PassThrough, pipeline as pipe } from 'stream'
import { promisify } from 'util'

const pipeline = promisify(pipe)

export default class Executor {
  #schema
  #queryRoot
  #mutationRoot
  #subscriptionRoot
  #contextValue

  /**
   * A batch executor which provide a generator yielding
   * each operation in parallel
   * @param {Object} options
   * @param {graphql.SchemaDefinitionNode} options.schema the graphql schema
   * @param {Object} options.context the graphql context
   * @param {Object} options.queryRoot the query root value
   * @param {Object} options.mutationRoot the mutation root value
   * @param {Object} options.subscriptionRoot the subscription root value
   */
  constructor({
    schema = (() => {
      throw new Error('Schema must be defined')
    })(),
    context = {},
    queryRoot = {},
    mutationRoot = {},
    subscriptionRoot = {},
  } = {}) {
    this.#schema = schema
    this.#queryRoot = queryRoot
    this.#mutationRoot = mutationRoot
    this.#subscriptionRoot = subscriptionRoot
    this.#contextValue = context
  }

  /**
   * Take an incomming query that may contains multiple bloc
   * and output processing datas for each bloc
   */
  build_execution_contexts(documents, variableValues = {}) {
    return documents.map(document => {
      const [operation] = document.definitions
      const {
        operation: operation_type,
        name: { value: operation_name = 'anon' } = {},
      } = operation

      return {
        operation_type,
        operation_name,
        document,
        schema      : this.#schema,
        contextValue: this.#contextValue,
        variableValues,
      }
    })
  }

  get_root_value(type) {
    switch (type) {
      case 'query':
        return this.#queryRoot

      case 'mutation':
        return this.#mutationRoot

      case 'subscription':
        return this.#subscriptionRoot

      /* c8 ignore next 3 */
      // not reachable
      default:
        return undefined
    }
  }

  async execute_query(context, stream) {
    const { operation_type, operation_name, ...execution_context } = context
    const rootValue = this.get_root_value(operation_type, execution_context)
    const result = await graphql.execute({
      ...execution_context,
      rootValue,
    })

    stream.write({
      operation_type,
      operation_name,
      ...result,
    })
  }

  async execute_subscription(context, stream) {
    const { operation_type, operation_name, ...execution_context } = context
    const rootValue = this.get_root_value(operation_type, execution_context)
    const result_or_iterator = await graphql.subscribe({
      ...execution_context,
      rootValue,
    })

    if (result_or_iterator[Symbol.asyncIterator]) {
      await pipeline(
          result_or_iterator,
          async function *(source) {
            for await (const chunk of source) {
              yield {
                ...chunk,
                operation_type,
                operation_name,
              }
            }
          },
          stream,
      )
    } else {
      stream.write({
        operation_type,
        operation_name,
        ...result_or_iterator,
      })
    }
  }

  /**
   * Process a graphql document with multiple operations
   * and execute them in parallel, then stream back each results
   * as soon as possible
   */
  execute({ document, variables } = {}) {
    const through = new PassThrough({ objectMode: true })

    try {
      const documents = process_source(this.#schema, document)
      const execution_contexts = this.build_execution_contexts(
          documents,
          variables,
      )

      execution_contexts.forEach(context => {
        switch (context.operation_type) {
          case 'subscription':
            this.execute_subscription(context, through)
            break

          case 'query':

          case 'mutation':
            this.execute_query(context, through)

            break

          // no default
        }
      })
    } catch (error) {
      if (error.name === 'ProcessingError') {
        through.write({ ...error })
        through.end()
      } else throw error
    }

    return through
  }
}
