import graphql from 'graphql'
import Resolver from '../src/index.js'
import debug from 'debug'
import {
  readFileSync,
} from 'fs'
import {
  join, dirname,
} from 'path'
import {
  fileURLToPath,
} from 'url'
import {
  PassThrough, pipeline,
} from 'stream'

const directory = dirname(fileURLToPath(import.meta.url))
const log = debug('batch').extend('example')
const {
  buildSchema,
} = graphql
const schema = buildSchema(readFileSync(join(directory, 'schema.gql'), 'utf-8'))
const interval = 500

let event = 0

const max_event = 3
const rootValue = {
  ping() {
    return 'pong chin chan'
  },
  async* onEvent() {
    for (;;) {
      await new Promise(resolve => setTimeout(resolve, interval))
      yield {
        onEvent: ++event,
      }
    }
  },
}
const resolver = new Resolver({
  id             : 'user_01',
  contextValue   : {},
  high_water_mark: 40,
  schema,
  rootValue,
})
const batch_resolve = resolver.generate.bind(resolver)
const client = new PassThrough({
  objectMode   : true,
  highWaterMark: 100,
})

pipeline(
    client,
    batch_resolve,
    async function* (source) {
      for await (const operation of source) {
        log('processing %O', operation.id)
        yield* operation.stream
      }
    },
    async source => {
      for await (const chunk of source) {
        const {
          id, operation_type, operation_name, data, errors,
        } = chunk
        log('id %O', id)
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

client.write({
  id      : 'example operation',
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
})
