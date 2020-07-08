import {
  defaultFieldResolver,
  buildSchema,
  getDirectiveValues,
} from 'graphql/index.mjs'

export default ({ document, resolvers = {}, directives = {} }) => {
  const built_schema = buildSchema(document, { noLocation: true })

  Object.entries(resolvers).forEach(([type_name, fields_handlers]) => {
    const type = built_schema.getType(type_name)
    const fields = type.getFields()

    Object.entries(fields_handlers).forEach(([field_name, handler]) => {
      if (typeof handler === 'function') fields[field_name].resolve = handler
      else {
        const { resolve, subscribe } = handler

        fields[field_name].resolve = resolve
        fields[field_name].subscribe = subscribe
      }
    })
  })

  Object.values(built_schema.getTypeMap()).forEach(type => {
    const fields = type?.getFields?.()

    if (!fields) return

    const attach_directive = field => {
      const node = field.astNode

      field.resolve = node?.directives
        // eslint-disable-next-line unicorn/no-reduce
        ?.reduce((resolve, node_directive) => {
          const {
            name: { value: directive_name },
          } = node_directive
          const directive_resolver = directives[directive_name]

          if (!directive_resolver) return resolve

          const directive_definition = built_schema.getDirective(directive_name)
          const directive_arguments = getDirectiveValues(
              directive_definition,
              node,
          )

          return (root = {}, parameters = {}, context = {}, info) =>
            directive_resolver({
              resolve: async () => resolve(root, parameters, context, info),
              root,
              parameters,
              context,
              info,
              directive_arguments,
            })
        }, field.resolve ?? defaultFieldResolver)
    }

    Object.values(fields).forEach(attach_directive)
  })

  return built_schema
}
