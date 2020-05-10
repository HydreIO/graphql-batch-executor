import graphql from 'graphql'
import { promisify } from 'util'
import stream from 'stream'
import Executor from '../../src/index.js'
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
      yield true
    }
  },
}
const file = readFileSync(join(directory, '../schema.gql'), 'utf-8')
const executor = new Executor({
  schema   : buildSchema(file),
  rootValue: resolvers,
})
const batch_executor = executor.generate.bind(executor)

'Multiple queries run in parallel'.doubt(async () => {
  'batch_execute'
      .should('be a async generator')
      .because(batch_executor.constructor.name)
      .is('AsyncGeneratorFunction')

  const document = /* GraphQL */ `
    query foo {
      ping
    }

    query bar {
      ping
    }
  `

  let response_count = 0

  await pipeline(
      function *() {
        yield {
          id: 'hello',
          document,
        }
      },
      batch_executor,
      async function *(source) {
        for await (const {
          id, stream: operation_stream,
        } of source) {
          'the operation id'
              .should('be `hello`')
              .because(id)
              .is('hello')

          'a stream comming out from the executor'
              .should('be a PassThrough stream')
              .because(operation_stream.constructor.name)
              .is('PassThrough')
          yield* operation_stream
        }
      },
      async source => {
        for await (const chunk of source) {
          const {
            data, errors,
          } = chunk

          response_count++
          'data'
              .should('contain the response to our query')
              .because({ ...data })
              .is({ ping: 'chin chan' })
          'errors'
              .should('be undefined')
              .because(errors)
              .is(undefined)
        }
      },
  )

  'response_count'
      .should('be equal to 2 as we queried 2 times')
      .because(response_count)
      .is(2)
})

'The result of an operation is an \
object with defined properties'.doubt(async () => {
      const document = /* GraphQL */ `
      {
        ping
      }
    `
      // eslint-disable-next-line unicorn/consistent-function-scoping
      const read_stream = async source => {
        for await (const chunk of source) {
          const {
            operation_type, operation_name, data, errors,
          } = chunk

          'operation_type'
              .should('be `query`')
              .because(operation_type)
              .is('query')
          'operation_name'
              .should('be `anon`')
              .because(operation_name)
              .is('anon')
          'data'
              .should('contain a ping property which value is `chin chan`')
              .because({ ...data })
              .is({ ping: 'chin chan' })
          'errors'
              .should('be undefined')
              .because(errors)
              .is(undefined)
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
          write_operation, batch_executor, read_operation,
      )
    })
