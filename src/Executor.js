import { execute, subscribe } from 'graphql/index.mjs'
import process_source from './process_source.js'
import { PassThrough, finished as finish } from 'stream'
import events from 'events'
import { promisify } from 'util'

const finished = promisify(finish)
const find_definition = ({ kind }) => kind === 'OperationDefinition'

export default class Executor {
  #schema
  #contextValue
  #formatError

  /**
   * A batch executor which provide a generator yielding
   * each operation in parallel
   * @param {Object} options
   * @param {graphql.SchemaDefinitionNode} options.schema the graphql schema
   * @param {(Object|Function)} options.context the graphql context
   * @param {Function} options.formatError a mapper function to customize errors
   */
  constructor({
    schema = (() => {
      throw new Error('Schema must be defined')
    })(),
    context = () => {},
    formatError = x => x,
  } = {}) {
    this.#schema = schema
    this.#contextValue = context
    this.#formatError = formatError
  }

  /**
   * Take an incomming query that may contains multiple bloc
   * and output processing datas for each bloc
   */
  async build_execution_contexts(documents, variableValues = {}) {
    const contextValue
      = typeof this.#contextValue === 'function'
        ? await this.#contextValue()
        : this.#contextValue

    return documents.map(document => {
      const operation = document.definitions.find(find_definition)
      const {
        operation: operation_type,
        name: { value: operation_name = 'anon' } = {},
      } = operation

      return {
        operation_type,
        operation_name,
        document,
        schema: this.#schema,
        contextValue,
        variableValues,
      }
    })
  }

  async execute_query(context, stream) {
    const { operation_type, operation_name, ...execution_context } = context
    const { data, errors = [] } = await execute(execution_context)

    stream.write({
      operation_type,
      operation_name,
      data,
      errors: this.#formatError(errors),
    })
  }

  async execute_subscription(context, stream) {
    const { operation_type, operation_name, ...execution_context } = context
    const result_or_iterator = await subscribe(execution_context)
    const format = this.#formatError

    if (result_or_iterator[Symbol.asyncIterator]) {
      const stream_closed = finished(stream).then(() => {})

      for (;;) {
        const next_or_end = [result_or_iterator.next(), stream_closed]
        const chunk = await Promise.race(next_or_end)
        const { value } = chunk || await result_or_iterator.return?.() || {}

        if (!value) return

        const { data, errors = [] } = value
        const operation = {
          data,
          errors: format(errors),
          operation_type,
          operation_name,
        }

        /* c8 ignore next 2 */
        // weird branch
        if (!stream.write(operation)) await events.once(stream, 'drain')
      }
    }
    /* c8 ignore next 10 */

    // can't seems to reach
    const { data, errors = [] } = result_or_iterator

    stream.write({
      operation_type,
      operation_name,
      data,
      errors: format(errors),
    })
  }

  /**
   * Process a graphql document with multiple operations
   * and execute them in parallel, then stream back each results
   * as soon as possible
   */
  async execute({ document, variables } = {}) {
    const through = new PassThrough({ objectMode: true })

    try {
      const documents = process_source(this.#schema, document)
      const execution_contexts = await this.build_execution_contexts(
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
