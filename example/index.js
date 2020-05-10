import graphql from 'graphql'
import Executor from '../src/index.js'
import debug from 'debug'
import { readFileSync } from 'fs'
import {
  join, dirname,
} from 'path'
import { fileURLToPath } from 'url'
import {
  PassThrough, pipeline,
} from 'stream'

const directory = dirname(fileURLToPath(import.meta.url))
const log = debug('batch').extend('example')
const { buildSchema } = graphql
const schema = buildSchema(readFileSync(join(directory, 'schema.gql'), 'utf-8'))
const interval = 500

let event = 0

const max_event = 3
const rootValue = {
  ping() {
    return 'pong chin chan'
  },
  async *onEvent() {
    for (;;) {
      await new Promise(resolve => setTimeout(resolve, interval))
      yield { onEvent: ++event }
    }
  },
}
const executor = new Executor({
  contextValue   : {},
  high_water_mark: 40,
  schema,
  rootValue,
})

// beware this exemple is synchrone
pipeline(
    executor.execute({
      document: /* GraphQL */`
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
        const {
          operation_type, operation_name, data, errors,
        } = chunk

        log('operation_type %O', operation_type)
        log('operation_name %O', operation_name)
        log('data %O', data)
        log('errors %O\n\n\n', errors)

        if (event >= max_event) return
      }
    },
    () => {
      log('client stream terminated')
    },
)
