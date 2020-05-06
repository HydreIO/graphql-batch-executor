import { PassThrough } from 'stream'

import debug from 'debug'

import graphql_invariant from './graphql_invariant.js'
import process_source from './process_source.js'
import process_query from './process_query.js'
import process_subscription from './process_subscription.js'
import Processing_Error from './processing_error.js'

const log = debug('batch-executor')
const HIGH_WATER_MARK_DEFAULT = 100
const forward_error = stream => error => {
  stream.write({ ...error })
}

export default class Executor {
  #schema
  #logger
  #high_water_mark

  #partial_graphql_options
  #process_source

  /**
   * A batch executor which provide a generator yielding
   * each operation in parallel
   * @param {Object} options
   * @param {graphql.SchemaDefinitionNode} options.schema the graphql schema
   * @param {Object} options.contextValue the graphql context
   * @param {Object} options.rootValue the resolvers
   * @param {mixed} [options.id] an optionnal unique id for logging purposes
   * @param {Int} [options.high_water_mark=100] high water mark for the
   * passthrough stream in charge of yielding an unique operation
   */
  constructor({
    schema = (() => {
      throw new Error('Schema must be defined')
    })(),
    contextValue = {},
    rootValue = {},
    id = 'anon',
    high_water_mark = HIGH_WATER_MARK_DEFAULT,
  }) {
    this.#schema = schema
    this.#logger = log.extend(id)
    this.#process_source = process_source(schema)
    this.#high_water_mark = high_water_mark

    this.#partial_graphql_options = {
      schema,
      rootValue,
      contextValue,
    }
  }

  /**
   * Take an incomming query that may contains multiple bloc
   * and output processing datas for each bloc
   */
  build_processing_options({
    id, documents, variables,
  }) {
    const log_op = this.#logger.extend(`op<${ id }>`)

    return documents.map(document => {
      const [operation] = document.definitions
      const {
        operation: operation_type,
        name: { value: operation_name = 'anon' } = {},
      } = operation

      return {
        log_op,
        operation_type,
        operation_name,
        graphql_options: {
          ...this.#partial_graphql_options,
          document,
          variableValues: variables,
        },
      }
    })
  }

  async dispatch_operations(stream, chunk) {
    const datas = this.#process_source(chunk)
    const operations = []

    this.#logger('dispatching %O', datas)

    for (const processing_options of this.build_processing_options(datas)) {
      switch (processing_options.operation_type) {
        case 'subscription':
          operations.push(process_subscription({
            ...processing_options,
            stream,
          }).catch(forward_error(stream)))
          break

        case 'query':

        case 'mutation':
          operations.push(process_query(processing_options)
              .then(data => {
                stream.write(data)
              })
              .catch(forward_error(stream)))
          break

        default:
          graphql_invariant(false,
              `This library version doesn't support the\
           ${ processing_options.operation_type } operation.`)
      }
    }

    await Promise.all(operations)
  }

  /**
   * A generator that execute graphql queries, mutations and subscription.
   * @returns a stream handling a unique batch of operations
   */
  async *generate(source) {
    for await (const chunk of source) {
      const stream = new PassThrough({
        objectMode   : true,
        highWaterMark: this.#high_water_mark,
      })

      this.#logger('processing chunk..')
      this.dispatch_operations(stream, chunk)
          .then(() => {
            stream.end()
          })
          .catch(error => {
            if (error instanceof Processing_Error)
              stream.write({ ...error })
            else {
              console.error(error)
              stream.end()
            }
          })

      yield {
        id: chunk.id ?? 'none',
        stream,
      }
      this.#logger('chunk processed.')
    }

    this.#logger('source processed.')
  }
}
