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
const passthrough = new stream.PassThrough({ objectMode: true })
const resolvers = {
  me() {
    throw new GraphQLError('oops')
  },
  ping() {
    passthrough.write({ pingCount: 1 })
    return 'chin chan'
  },
  // eslint-disable-next-line require-await
  async pingCount() {
    return undefined
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

'An operation respect the graphql schema'.doubt(async () => {
  const invalid_document = /* GraphQL */ `invalid`
  const invalid_query = /* GraphQL */ `
    {
      invalid
    }
  `
  // eslint-disable-next-line unicorn/consistent-function-scoping
  const read_invalid_document = async source => {
    for await (const { errors } of source) {
      'an invalid document'
          .should('give an error')
          .because(errors?.[0].message)
          .is('Syntax Error: Unexpected Name "invalid".')
      source.end()
    }
  }
  // eslint-disable-next-line unicorn/consistent-function-scoping
  const read_invalid_query = async source => {
    for await (const { errors } of source) {
      'an invalid query'
          .should('return a GraphQL error with the message %s',
              'Cannot query field "invalid" on type "Query".'.yellow)
          .because(errors?.[0].message)
          .is('Cannot query field "invalid" on type "Query".')
      source.end()
    }
  }
  const read_operation = async source => {
    for await (const {
      id, stream: operation_stream,
    } of source) {
      if (id === 'invalid_document')
        await pipeline(operation_stream, read_invalid_document)
      else if (id === 'invalid_query')
        await pipeline(operation_stream, read_invalid_query)
      else throw new Error('invalid test suite parameter')
    }
  }
  const write_operation = function *() {
    yield {
      id      : 'invalid_document',
      document: invalid_document,
    }
    yield {
      id      : 'invalid_query',
      document: invalid_query,
    }
  }

  await pipeline(
      write_operation, batch_executor, read_operation,
  )
})
