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
      const field = fields[field_name]
      const handler_type = handler?.constructor?.name

      if (!field) throw new Error(`${field_name} is not in schema`)
      switch (handler_type) {
        case 'GeneratorFunction':
        case 'AsyncGeneratorFunction':
          field.subscribe = handler
          break
        case 'AsyncFunction':
        case 'Function':
          field.resolve = handler
          break
        default: {
          const { resolve, subscribe } = handler

          field.resolve = resolve
          field.subscribe = subscribe
          break
        }
      }
    })
  })

  const attach_directive = field => {
    const node = field.astNode

    field.resolve = node?.directives?.reduce((resolve, node_directive) => {
      const {
        name: { value: directive_name },
      } = node_directive
      const directive_resolver = directives[directive_name]

      if (!directive_resolver) return resolve

      const directive_arguments = getDirectiveValues(
        built_schema.getDirective(directive_name),
        node
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

  Object.values(built_schema.getTypeMap())
    .filter(({ name }) => name?.startsWith?.('__') === false)
    .forEach(type => {
      const fields = type?.getFields?.()

      if (!fields) return

      Object.values(fields).forEach(attach_directive)
    })

  return built_schema
}
