import graphql from 'graphql'
import { promisify } from 'util'
import stream from 'stream'
import Executor from '../src/index.js'
import { readFileSync } from 'fs'
import {
  join, dirname,
} from 'path'
import { fileURLToPath } from 'url'

const { buildSchema } = graphql
const directory = dirname(fileURLToPath(import.meta.url))
const pipeline = promisify(stream.pipeline)
const passthrough = new stream.PassThrough({ objectMode: true })
const resolvers = {
  me() {
    return { name: 'pepeg' }
  },
  ping() {
    passthrough.write({ pingCount: 1 })
    return 'chin chan'
  },
  // eslint-disable-next-line require-await
  async *pingCount() {
    yield* passthrough
  },
  async *infinite() {
    for (;;) {
      await new Promise(resolve => setTimeout(resolve, 1))
      yield { infinite: true }
    }
  },
}
const executor = new Executor({
  schema   : buildSchema(readFileSync(join(directory, 'schema.gql'), 'utf-8')),
  rootValue: resolvers,
})
const batch_execute = executor.generate.bind(executor)

'Subscriptions keep executing until the stream is terminated'
    .doubt(async () => {
      const document = /* GraphQL */ `
      subscription {
        infinite
      }
    `

      let response_count = 0

      const LIMIT = 5
      const read_stream = async source => {
        for await (const chunk of source) {
          'chunk'
              .should('contain a data object with a property equal to true')
              .because(chunk?.data?.infinite)
              .is(true)
          response_count++
          if (response_count >= LIMIT) source.end()
        }
      }
      const read_operation = async source => {
        for await (const { stream: operation_stream } of source)
          await pipeline(operation_stream, read_stream)
      }
      const write_operation = function *() {
        yield {
          id: 'hello',
          document,
        }
      }

      await pipeline(
          write_operation,
          batch_execute,
          read_operation,
      )

      'response_count'
          .should('be equal to 5')
          .because(response_count)
          .is(LIMIT)
    })

'Subscriptions in an operation are loadbalanced when they share the same field'
    .doubt(async () => {
      const document = /* GraphQL */ `
      subscription foo {
        workerA: pingCount
      }

      subscription bar {
        workerB: pingCount
      }

      query a {
        ping
      }
      query b {
        ping
      }
      query d {
        ping
      }
    `
      const TIMEOUT = 30
      const results = []
      const read_stream = async source => {
        for await (const chunk of source) {
          const {
            operation_type, operation_name,
          } = chunk

          if (operation_type === 'subscription')
            results.push(operation_name)
        }
      }
      const read_operation = async source => {
        for await (const { stream: operation_stream } of source) {
          setTimeout(() => {
            operation_stream.end()
          }, TIMEOUT)
          await pipeline(operation_stream, read_stream)
        }
      }
      const write_operation = function *() {
        yield {
          id: 'hello',
          document,
        }
      }

      await pipeline(
          write_operation,
          batch_execute,
          read_operation,
      )

      'results'
          .should('include the workers names sequencially')
          .because(results)
          .is(['foo', 'bar', 'foo'])
    })
