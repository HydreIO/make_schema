import {
  defaultFieldResolver,
  buildSchema,
  getDirectiveValues,
  isObjectType,
} from 'graphql'

export default ({ document, resolvers = {}, directives = {} }) => {
  const built_schema = buildSchema(document, { noLocation: true })

  Object.entries(resolvers).forEach(([type_name, fields_handlers]) => {
    const type = built_schema.getType(type_name)

    if (!isObjectType(type)) return // Skip if not an object type

    const fields = type.getFields()

    Object.entries(fields_handlers).forEach(([field_name, handler]) => {
      const field = fields[field_name]
      if (!field) throw new Error(`${field_name} is not in schema`)

      field.resolve = defaultFieldResolver

      if (
        ['GeneratorFunction', 'AsyncGeneratorFunction'].includes(
          handler.constructor.name
        )
      ) {
        field.subscribe = handler
      } else if (typeof handler === 'function') {
        field.resolve = handler
      } else {
        if (handler.resolve) field.resolve = handler.resolve
        if (handler.subscribe) field.subscribe = handler.subscribe
      }
    })
  })

  const wrap_with_directive =
    (original_function, directive_resolver, directive_arguments) =>
    async (root = {}, parameters = {}, context = {}, info) => {
      try {
        const result = await directive_resolver({
          resolve: async () =>
            original_function(root, parameters, context, info),
          root,
          parameters,
          context,
          info,
          directive_arguments,
        })

        if (info.operation.operation !== 'subscription') return result

        async function* wrap_in_async_iterable(value) {
          yield value
        }

        return wrap_in_async_iterable(result)
      } catch (error) {
        if (info.operation.operation !== 'subscription') throw error

        async function* yield_error() {
          yield {
            candles: () => {
              throw error
            },
          }
        }

        return yield_error()
      }
    }

  const attach_directive = field => {
    const node = field.astNode

    node?.directives?.forEach(node_directive => {
      const directive_name = node_directive.name.value
      const directive_resolver = directives[directive_name]

      if (directive_resolver) {
        const directive_arguments = getDirectiveValues(
          built_schema.getDirective(directive_name),
          node
        )

        if (field.subscribe)
          field.subscribe = wrap_with_directive(
            field.subscribe,
            directive_resolver,
            directive_arguments
          )
        else if (field.resolve)
          field.resolve = wrap_with_directive(
            field.resolve,
            directive_resolver,
            directive_arguments
          )
      }
    })
  }

  Object.values(built_schema.getTypeMap())
    .filter(type => isObjectType(type) && !type.name.startsWith('__'))
    .forEach(type => {
      const fields = type.getFields()
      Object.values(fields).forEach(attach_directive)
    })

  return built_schema
}
