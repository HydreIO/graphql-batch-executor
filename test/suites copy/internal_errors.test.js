import graphql from 'graphql'
import { promisify } from 'util'
import stream from 'stream'
import Executor from '../../src/index.js'
import { readFileSync } from 'fs'
import {
  join, dirname,
} from 'path'
import { fileURLToPath } from 'url'

const {
  buildSchema, GraphQLError,
} = graphql
const directory = dirname(fileURLToPath(import.meta.url))
const pipeline = promisify(stream.pipeline)
const resolvers = {
  me() {
    throw new GraphQLError('oops')
  },
  // eslint-disable-next-line require-await
  async pingCount() {
    return undefined
  },
  async withArg() {
    throw new GraphQLError('oops')
  },
  // eslint-disable-next-line require-yield
  async *infinite() {
    throw new Error('kermit did it again')
  },
}
const file = readFileSync(join(directory, '../schema.gql'), 'utf-8')
const executor = new Executor({
  schema   : buildSchema(file),
  rootValue: resolvers,
})
const batch_executor = executor.generate.bind(executor)

'Server errors are handled correctly'.doubt(async () => {
  try {
    const failed = new Executor()

    throw failed
  } catch (error) {
    'an executor'
        .should('throw an error with the message %s',
            'Schema must be defined'.yellow)
        .because(error.message)
        .is('Schema must be defined')
  }

  // eslint-disable-next-line unicorn/consistent-function-scoping
  const read_error = async source => {
    for await (const { errors } of source) {
      'an operation throwing a graphqlError'
          .should('forward the error')
          .because(errors[0].message)
          .is('oops')
      source.end()
    }
  }
  const read_operation = async source => {
    for await (const { stream: operation_stream } of source)
      await pipeline(operation_stream, read_error)
  }
  const write_operation = function *() {
    yield {
      id      : 'query_error',
      document: `{ me { name } }`,
    }
    yield {
      id      : 'subscription_error',
      document: `subscription { infinite }`,
    }
  }
  const write_no_document = function *() {
    yield { id: 1 }
  }
  const write_no_id = function *() {
    yield { blabla: 1 }
  }
  const write_no_iterator = function *() {
    yield {
      id      : 505,
      document: /* GraphQL */ `
        subscription {
          pingCount
        }
      `,
    }
  }
  const write_bad_subscription = function *() {
    yield {
      id      : 506,
      document: /* GraphQL */ `subscription { }`,
    }
  }
  const write_throwable = function *() {
    yield {
      id      : 507,
      document: /* GraphQL */ `
        subscription {
          withArg
        }
      `,
    }
  }

  try {
    await pipeline(
        write_operation, batch_executor, read_operation,
    )
    throw new Error('pipeline passed')
  } catch (error) {
    'an operation throwing a non graphqlError'
        .should('throw the error %s', 'kermit did it again'.yellow)
        .because(error.message)
        .is('kermit did it again')
  }

  await pipeline(
      write_bad_subscription, batch_executor, async source => {
        for await (const { stream: operation_stream } of source) {
          await pipeline(operation_stream, async op_source => {
            for await (const { errors } of op_source) {
              'an invalid subscription'
                  .should('forward the error %s',
                      'Syntax Error: Expected Name, found "}".'.yellow)
                  .because(errors[0].message)
                  .is('Syntax Error: Expected Name, found "}".')
              op_source.end()
            }
          })
        }
      },
  )

  await pipeline(
      write_throwable, batch_executor, async source => {
        for await (const { stream: operation_stream } of source) {
          await pipeline(operation_stream, async op_source => {
            for await (const { errors } of op_source) {
              'an invalid subscription'
                  .should('forward the error %s', 'oops'.yellow)
                  .because(errors[0].message)
                  .is('oops')
              op_source.end()
            }
          })
        }
      },
  )

  await pipeline(
      write_no_document, batch_executor, async source => {
        for await (const { stream: operation_stream } of source) {
          await pipeline(operation_stream, async op_source => {
            for await (const { errors } of op_source) {
              'an invalid operation with no document'
                  .should('forward the error %s', 'No \
document was provided'.yellow)
                  .because(errors[0].message)
                  .is('No document was provided')
              op_source.end()
            }
          })
        }
      },
  )

  await pipeline(
      write_no_id, batch_executor, async source => {
        for await (const { stream: operation_stream } of source) {
          await pipeline(operation_stream, async op_source => {
            for await (const { errors } of op_source) {
              'an operation with no id'
                  .should('forward the error %s', 'Missing operation id'.yellow)
                  .because(errors[0].message)
                  .is('Missing operation id')
              op_source.end()
            }
          })
        }
      },
  )

  try {
    await pipeline(
        write_no_iterator, batch_executor, async source => {
          for await (const { stream: operation_stream } of source) {
            // eslint-disable-next-line no-unused-vars
            for await (const _ of operation_stream) continue
          }
        },
    )
    throw new Error('pipeline passed')
  } catch (error) {
    'a subscription whitout an asyncIterator'
        .should('throw the error %s',
            'Subscription field must return \
Async Iterable. Received: undefined.'
                .yellow)
        .because(error.message)
        .is('Subscription field must return \
Async Iterable. Received: undefined.')
  }
})
