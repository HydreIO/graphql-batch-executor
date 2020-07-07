import Executor from '../src/Executor.js'
import make_schema from '../src/make_schema.js'
import debug from 'debug'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { pipeline } from 'stream'

const directory = dirname(fileURLToPath(import.meta.url))
const log = debug('batch').extend('example')
const interval = 500

let event = 0

const max_event = 3
const executor = new Executor({
  context    : () => ({}),
  formatError: x => x,
  schema     : make_schema({
    document : readFileSync(join(directory, 'schema.gql'), 'utf-8'),
    resolvers: {
      Query: {
        ping() {
          return 'pong chin chan'
        },
      },
      Subscription: {
        onEvent: {
          async *subscribe() {
            for (;;) {
              await new Promise(resolve => setTimeout(resolve, interval))
              yield { onEvent: ++event }
            }
          },
        },
      },
    },
  }),
  subscription: {},
})

pipeline(
    await executor.execute({
      document: /* GraphQL */ `
      query foo {
        ping
        peng: ping
      }

      query bar {
        ping
      }

      subscription workerA {
        onEvent
      }

      subscription workerB {
        onEvent
      }
    `,
      variables: {},
    }),
    async source => {
      for await (const chunk of source) {
        const { operation_type, operation_name, data, errors } = chunk

        log('operation_type %O', operation_type)
        log('operation_name %O', operation_name)
        log('data %O', data)
        log('errors %O\n============', errors)

        if (event >= max_event) return
      }
    },
    () => {
      log('client stream terminated')
    },
)
