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

<h3 align=center>A readable stream executing multiple graphql operations in parallel</h3>

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
  schema, // schema
  query,
  mutation,
  subscription,
  context: {}, // optionnal
})
```

The executor generator takes an option object

```js
import stream from 'stream'

stream.pipeline(
    executor.execute({
      document: /* GraphQL */`
          query foo {
            ping
          }

          query bar {
            ping
          }
        `,
      variables: {},
    }),
    async source => {
      for await (const chunk of source) {
        const {
          // query, mutation, subscription
          operation_type,

          // the name
          // note that you can't send queries
          // without names if there are more than one
          operation_name,

          // data result or null
          data,

          // gql errors or null
          errors,
        } = chunk
      }
    },
    () => {
      log('client disconnected')
    },
)
```

### Advanced

see [/examples](example/index.js)