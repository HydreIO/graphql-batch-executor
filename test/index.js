import doubt from '@hydre/doubt'
import graphql from 'graphql'

import {
  promisify,
} from 'util'

import {
  PassThrough,
  pipeline as sync_pipeline,
} from 'stream'

import tap_spec from 'tap-spec-emoji'
import Executor from '../src/index.js'

sync_pipeline(
    doubt.stream(),
    tap_spec(),
    process.stdout,
    error => {
      if (error) console.log(error)
    },
)

const {
  buildSchema,
} = graphql

const schema = buildSchema(/* GraphQL */`
  type Query {
    ping: String!
    me: User!
  }

  type User {
    name: String!
  }

  type Subscription {
    pingCount: Int!
  }
`)

const pipeline = promisify(sync_pipeline)

const passthrough = new PassThrough({
  objectMode: true,
})

const resolvers = {
  me() {
    return {
      name: 'pepeg',
    }
  },
  ping() {
    passthrough.write({
      pingCount: 1,
    })
    return 'chin chan'
  },
  // eslint-disable-next-line require-await
  async* pingCount() {
    yield* passthrough
  },
}

'The batch Executor'.doubt(async () => {
  await 'allows multiple queries to run'.because(async () => {
    const executor = new Executor({
      schema,
      rootValue: resolvers,
    })

    const batch_resolve = executor.generate.bind(executor)

    const document = /* GraphQL */`
      query foo {
        ping
      }

      query bar {
        ping
      }
    `

    const results = []

    await pipeline(
        function* () {
          yield {
            id: 'hello',
            document,
          }
        },
        batch_resolve,
        async function* (source) {
          for await (const {
            stream,
          } of source)
            yield* stream
        },
        async source => {
          for await (const chunk of source)
            results.push(chunk)
        },
    )

    return results
        .map(({
          data,
          errors,
        }) => {
          if (errors?.length) return errors
          return data?.ping
        })
        .join()
  }).isEqualTo('chin chan,chin chan')

  const count = 4
  await 'allows multiple subscriptions to be loadbalanced'.because(async () => {
    const executor = new Executor({
      schema,
      rootValue: resolvers,
      high_water_mark: 50,
    })

    const batch_resolve = executor.generate.bind(executor)

    const document = /* GraphQL */`
      subscription foo {
        workerA: pingCount
      }

      subscription bar {
        workerB: pingCount
      }

      subscription baz {
        workerC: pingCount
      }

      query a { ping }
      query b { ping }
    `

    const streams = new Map()

    await pipeline(
        function* () {
          yield {
            id: 'subbed',
            document,
          }
        },
        batch_resolve,
        async source => {
          try {
            for await (const {
              id,
              stream,
            } of source)
              streams.set(id, stream)
            // weird behavior without this
            // tests become an endless loop, no idea why
            // maybe something to do with beforeExit hook ?
            passthrough.end()
          } catch (error) {
            console.error(error)
          }
        },
    )

    const results = []
    for await (const subscription of streams.get('subbed'))
      results.push(subscription)


    return results
        .map(({
          data,
          errors,
        }) => {
          if (errors?.length) return errors
          const {
            workerA,
            workerB,
            workerC,
          } = data
          return workerA || workerB || workerC || 0
        })
        .reduce((a, b) => a + b, 0)
  }).isEqualTo(count)
})
