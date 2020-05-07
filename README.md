<h1 align=center>@hydre/graphql-batch-executor</h1>
<p align=center>
  <img src="https://img.shields.io/github/license/hydreio/graphql-batch-executor.svg?style=for-the-badge" />
  <img src="https://img.shields.io/codecov/c/github/hydreio/graphql-batch-executor/edge?logo=codecov&style=for-the-badge"/>
  <a href="https://www.npmjs.com/package/@hydre/graphql-batch-executor">
    <img src="https://img.shields.io/npm/v/@hydre/graphql-batch-executor.svg?logo=npm&style=for-the-badge" />
  </a>
  <img src="https://img.shields.io/npm/dw/@hydre/graphql-batch-executor?logo=npm&style=for-the-badge" />
  <img src="https://img.shields.io/github/workflow/status/hydreio/graphql-batch-executor/CI?logo=Github&style=for-the-badge" />
</p>

<h3 align=center>A transform stream executing multiple graphql operations in parallel</h3>

This library is made to be used by servers or tools implementer, it can't be used alone.

## Install

```sh
npm install @hydre/graphql-batch-executor
```

## Usage

Initialize a new Executor per client

```js
import Executor from '@hydre/graphql-batch-executor'

const executor = new Executor({
  id: 'user_01', // identify the executor per client
  schema, // schema
  rootValue, // optionnal
  contextValue: {}, // optionnal
  high_water_mark: 40, // handle backpressure for parallel operations
})
```

The executor generator takes an option object

```js
import stream from 'stream'

stream.pipeline(
    function*() {
      const query = {
        id: 'an unique id for the query',
        document: '{ ping }',
        variables: {}
      }

      const another_query = {
        id: 'another id',
        document: `
          query foo {
            ping
          }

          query bar {
            ping
          }
        `,
        variables: {}
      }

      yield* [query, another_query]
    },

    executor.generator.bind(executor), // the executor

    async function (source) {
      for await (const executed_operation of source) {

        const {
          // this is how you differenciate queries
          // as they run in parallel a new one may finish
          // before an old one
          id,

          // a unique stream for the operation
          // each operation return a different stream
          // this stream can be used to unsubscribe (by terminating it)
          stream
        }

        for await (const chunk of stream) {
          const {
            // query, mutation, subscription
            operation_type,

            // the name
            // here we didn't defined any so it will
            // default to 'anon'
            // be careful as you will not be able to
            // differenciate unamed queries
            operation_name,

            // data result or null
            data,

            // gql errors or null
            errors,
          } = chunk
        }
      }
    },
    () => {
      log('client disconnected')
    },
)
```

### Advanced

see [/examples](example/index.js)