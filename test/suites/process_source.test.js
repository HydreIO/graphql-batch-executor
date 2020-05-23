import process_source from '../../src/process_source.js'
import graphql from 'graphql'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { join, dirname } from 'path'

const { buildSchema } = graphql
const directory = dirname(fileURLToPath(import.meta.url))
const file = readFileSync(join(directory, './schema.gql'), 'utf-8')
const schema = buildSchema(file)

export default class {
  static name = 'source processing'

  static input(assert) {
    const affirm = assert(4)
    const no_document = 'Missing operation document'
    const bad_document = 'Syntax Error: Unexpected Name "invalid".'
    const invalid_schema = 'Expected {} to be a GraphQL schema.'
    const not_in_schema = 'Cannot query field "thanos" on type "Query".'

    try {
      process_source(schema)
    } catch (error) {
      affirm({
        that   : 'processing source',
        should : `throw ${ no_document.yellow } if there is no document`,
        because: error.message,
        is     : no_document,
      })
    }

    try {
      process_source(schema, 'invalid')
    } catch (error) {
      affirm({
        that   : 'processing source',
        should : `return ${ bad_document.yellow } if the document is invalid`,
        because: error.errors?.[0]?.message,
        is     : bad_document,
      })
    }

    try {
      process_source({}, '{ ping }')
    } catch (error) {
      affirm({
        that   : 'processing source',
        should : `throw ${ invalid_schema.yellow } if the schema is invalid`,
        because: error.message,
        is     : invalid_schema,
      })
    }

    try {
      process_source(schema, '{ thanos }')
    } catch (error) {
      affirm({
        that   : 'processing source',
        should : `return ${ not_in_schema.yellow } if an operation is invalid`,
        because: error.errors?.[0]?.message,
        is     : not_in_schema,
      })
    }
  }
}
