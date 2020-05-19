import graphql from 'graphql'
import process_source from './process_source.js'
import { PassThrough, pipeline as pipe } from 'stream'
import { promisify } from 'util'

const pipeline = promisify(pipe)

export default class Executor {
  #schema
  #rootValue
  #contextValue

  /**
   * A batch executor which provide a generator yielding
   * each operation in parallel
   * @param {Object} options
   * @param {graphql.SchemaDefinitionNode} options.schema the graphql schema
   * @param {Object} options.contextValue the graphql context
   * @param {Object} options.rootValue the resolvers
   */
  constructor({
    schema = (() => {
      throw new Error('Schema must be defined')
    })(),
    contextValue = {},
    rootValue = {},
  } = {}) {
    this.#schema = schema
    this.#rootValue = rootValue
    this.#contextValue = contextValue
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
        rootValue   : this.#rootValue,
        contextValue: this.#contextValue,
        variableValues,
      }
    })
  }

  static async execute_query(context, stream) {
    const {
      operation_type,
      operation_name,
      ...execution_context
    } = context
    const result = await graphql.execute(execution_context)

    stream.write({
      operation_type,
      operation_name,
      ...result,
    })
  }

  static async execute_subscription(context, stream) {
    const {
      operation_type,
      operation_name,
      ...execution_context
    } = context
    const result_or_iterator = await graphql.subscribe(execution_context)

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
      const documents = process_source(
          this.#schema,
          document,
      )
      const execution_contexts = this.build_execution_contexts(
          documents,
          variables,
      )

      execution_contexts.forEach(context => {
        switch (context.operation_type) {
          case 'subscription':
            Executor.execute_subscription(context, through)
            break

          case 'query':

          case 'mutation':
            Executor.execute_query(context, through)

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
