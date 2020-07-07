/* eslint-disable max-lines */
import Doubt from '@hydre/doubt'
import reporter from 'tap-spec-emoji'
import Executor from '../src/index.js'
import make_schema from '../src/make_schema.js'
import { GraphQLError } from 'graphql/index.mjs'
import stream from 'stream'
import { promisify } from 'util'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { join, dirname } from 'path'
import process_source from '../src/process_source.js'

const stdout = new stream.PassThrough()
const directory = dirname(fileURLToPath(import.meta.url))
const pipeline = promisify(stream.pipeline)
const finished = promisify(stream.finished)
const schema = make_schema({
  document : readFileSync(join(directory, './schema.gql'), 'utf-8'),
  resolvers: {
    Query: {
      async ping() {
        await new Promise(resolve => setTimeout(resolve, 10))
        return 'chong'
      },
      me(_, __, { name }) {
        return { name }
      },
    },
    Mutation: {
      do_stuff: () => 'pepo',
    },
    Subscription: {
      infinite: {
        async *subscribe() {
          for (;;) {
            await new Promise(resolve => setTimeout(resolve, 1))
            yield { infinite: true }
          }
        },
      },
      pingCount: {
        // eslint-disable-next-line require-yield
        async *subscribe() {
          throw new GraphQLError('going to say the N WORD !')
        },
      },
    },
  },
  directives: {
    DEFAULT: async ({ resolve, directive_arguments }) => {
      const result = await resolve()

      return `${ result }:${ directive_arguments.use }`
    },
  },
})
const executor = new Executor({
  schema,
  context    : () => ({ name: 'pepeg' }),
  formatError: errors =>
    errors.map(error => {
      if (error.message.includes('N WORD')) error.message = 'censored'
      return error
    }),
})

stream.pipeline(stdout, reporter(), process.stdout, () => {})

const doubt = Doubt({
  stdout,
  title: 'Graphql Executor',
  calls: 20,
})
const no_document = 'Missing operation query'
const bad_document = 'Syntax Error: Unexpected Name "invalid".'
const invalid_schema = 'Expected {} to be a GraphQL schema.'
const not_in_schema = 'Cannot query field "thanos" on type "Query".'

try {
  process_source(schema)
} catch (error) {
  doubt['Processing source with no document throws an error']({
    because: error.errors?.[0]?.message,
    is     : no_document,
  })
}

try {
  process_source(schema, 'invalid')
} catch (error) {
  doubt['Processing source with an invalid document throws an error']({
    that   : 'processing source',
    should : `return ${ bad_document.yellow } if the document is invalid`,
    because: error.errors?.[0]?.message,
    is     : bad_document,
  })
}

try {
  process_source({}, '{ ping }')
} catch (error) {
  doubt['Processing source with an invalid schema throws an error']({
    that   : 'processing source',
    should : `throw ${ invalid_schema.yellow } if the schema is invalid`,
    because: error.message,
    is     : invalid_schema,
  })
}

try {
  process_source(schema, '{ thanos }')
} catch (error) {
  doubt['Processing source with an invalid operation throws an error']({
    that   : 'processing source',
    should : `return ${ not_in_schema.yellow } if an operation is invalid`,
    because: error.errors?.[0]?.message,
    is     : not_in_schema,
  })
}

try {
  // eslint-disable-next-line no-new
  new Executor()
} catch (error) {
  doubt['An executor created without a schema throws an error']({
    because: error.message,
    is     : 'Schema must be defined',
  })
}

await pipeline(
    await executor.execute({
      document: 'subscription { infinite }',
    }),
    async source => {
      for await (const chunk of source) {
        doubt['No errors should be thrown']({
          because: chunk.errors,
          is     : [],
        })
        source.end()
      }
    },
)

await pipeline(
    await executor.execute({
      document: 'subscription { pingCount }',
    }),
    async source => {
      for await (const chunk of source) {
        doubt['A resolver should forward a graphqlError if thrown']({
          because: chunk.errors[0].message,
          is     : 'censored',
        })
        source.end()
      }
    },
)
await pipeline(
    await executor.execute({ document: 'invalid' }),
    async source => {
      for await (const chunk of source) {
        doubt['Executing forward a graphqlError if the document is invalid']({
          because: chunk.errors[0].message,
          is     : 'Syntax Error: Unexpected Name "invalid".',
        })
      // source.end()
      }
    },
)

let count = 0

await pipeline(
    await executor.execute({
      document : 'mutation { do_stuff }',
      variables: { foo: 1 },
    }),
    async source => {
      for await (const chunk of source) {
        doubt['A mutation use the mutation root value']({
          because: chunk.data.do_stuff,
          is     : 'pepo',
        })
        source.end()
      }
    },
)

await pipeline(
    await executor.execute({
      document: /* GraphQL */ `
      fragment yo on User {
        name
      }
      query uno {
        me {
          ...yo
        }
      }
      query dos {
        ping
      }
    `,
      variables: { foo: 1 },
    }),
    async source => {
      for await (const chunk of source) {
        doubt['No errors should be thrown']({
          because: chunk.errors,
          is     : [],
        })
        if (count === 0) {
          doubt['Execution should be parallelized']({
            because: { ...chunk.data.me },
            is     : { name: 'pepeg:Paul' },
          })
        } else {
          doubt['Execution should be parallelized']({
            because: { ...chunk.data },
            is     : { ping: 'chong' },
          })
          source.end()
        }

        count++
      }
    },
)

const execution = await executor.execute({
  document : 'subscription { infinite }',
  variables: { foo: true },
})

let count_again = 0

await pipeline(execution, async source => {
  for await (const chunk of source) {
    doubt['No errors should be thrown']({
      because: chunk.errors,
      is     : [],
    })
    doubt['A subscription should keep executing until we end the stream']({
      because: {
        ...chunk,
        data: { ...chunk.data },
      },
      is: {
        operation_name: 'anon',
        operation_type: 'subscription',
        errors        : [],
        data          : { infinite: true },
      },
    })
    if (++count_again >= 3) source.end()
  }
})

await finished(execution)
doubt['Execution gracefully end']({
  because: true,
  is     : true,
})
