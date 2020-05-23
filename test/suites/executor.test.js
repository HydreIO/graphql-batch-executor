import Executor from '../../src/index.js'
import graphql from 'graphql'
import stream from 'stream'
import { promisify } from 'util'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { join, dirname } from 'path'

const { buildSchema, GraphQLError } = graphql
const directory = dirname(fileURLToPath(import.meta.url))
const file = readFileSync(join(directory, './schema.gql'), 'utf-8')
const schema = buildSchema(file)
const pipeline = promisify(stream.pipeline)
const finished = promisify(stream.finished)

export default class {
  static name = 'execution'
  static timeout = 50

  #executor = new Executor({
    schema,
    context  : { name: 'pepeg' },
    queryRoot: {
      async ping() {
        await new Promise(resolve => setTimeout(resolve, 10))
        return 'chong'
      },
      me(_, { name }) {
        return { name }
      },
    },
    mutationRoot: {
      do_stuff: 'pepo',
    },
    subscriptionRoot: {
      async *infinite() {
        for (;;) {
          await new Promise(resolve => setTimeout(resolve, 1))
          yield { infinite: true }
        }
      },
      async pingCount() {
        throw new GraphQLError('oopsy')
      },
    },
  })

  async invariants(assert) {
    const affirm = assert(4)
    const message = 'Schema must be defined'

    try {
      // eslint-disable-next-line no-new
      new Executor()
    } catch (error) {
      affirm({
        that   : 'an executor',
        should : `throw ${ message.yellow } when created without a schema`,
        because: error.message,
        is     : message,
      })
    }

    await pipeline(
        this.#executor.execute({
          document: 'subscription { infinite }',
        }),
        async source => {
          for await (const chunk of source) {
            affirm({
              that   : 'no errors',
              should : 'be thrown',
              because: chunk.errors,
              is     : undefined,
            })
            source.end()
          }
        },
    )

    await pipeline(
        this.#executor.execute({
          document: 'subscription { pingCount }',
        }),
        async source => {
          for await (const chunk of source) {
            affirm({
              that   : 'a subscription resolver',
              should : 'forward a graphqlError if thrown',
              because: chunk.errors[0].message,
              is     : 'oopsy',
            })
            source.end()
          }
        },
    )

    await pipeline(
        this.#executor.execute({ document: 'invalid' }),
        async source => {
          for await (const chunk of source) {
            affirm({
              that   : 'executing',
              should : 'forward a graphqlError if the document is invalid',
              because: chunk.errors[0].message,
              is     : 'Syntax Error: Unexpected Name "invalid".',
            })
            source.end()
          }
        },
    )
  }

  async queries(assert) {
    const affirm = assert(5)

    let count = 0

    await pipeline(
        this.#executor.execute({
          document : 'mutation { do_stuff }',
          variables: { foo: 1 },
        }),
        async source => {
          for await (const chunk of source) {
            affirm({
              that   : 'a mutation',
              should : 'use the mutation root value',
              because: chunk.data.do_stuff,
              is     : 'pepo',
            })
            source.end()
          }
        },
    )

    await pipeline(
        this.#executor.execute({
          document : 'query uno { me { name } } query dos { ping }',
          variables: { foo: 1 },
        }),
        async source => {
          for await (const chunk of source) {
            affirm({
              that   : 'no errors',
              should : 'be thrown',
              because: chunk.errors,
              is     : undefined,
            })
            if (count === 0) {
              affirm({
                that   : 'execution',
                should : 'be parallelized',
                because: { ...chunk.data.me },
                is     : { name: 'pepeg' },
              })
            } else {
              affirm({
                that   : 'execution',
                should : 'be parallelized',
                because: { ...chunk.data },
                is     : { ping: 'chong' },
              })
              source.end()
            }

            count++
          }
        },
    )
  }

  async subscriptions(assert) {
    const affirm = assert(7)
    const execution = this.#executor.execute({
      document : 'subscription { infinite }',
      variables: { foo: true },
    })

    let count = 0

    await pipeline(execution, async source => {
      for await (const chunk of source) {
        affirm({
          that   : 'no errors',
          should : 'be thrown',
          because: chunk.errors,
          is     : undefined,
        })
        affirm({
          that   : 'a subscription',
          should : 'keep executing until we end the stream',
          because: {
            ...chunk,
            data: { ...chunk.data },
          },
          is: {
            operation_name: 'anon',
            operation_type: 'subscription',
            data          : { infinite: true },
          },
        })
        if (++count >= 3) source.end()
      }
    })

    await finished(execution)
    affirm({
      that   : 'execution',
      should : 'gracefully end',
      because: true,
      is     : true,
    })
  }
}
