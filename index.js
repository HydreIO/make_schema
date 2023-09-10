import {
  defaultFieldResolver,
  buildSchema,
  getDirectiveValues,
  isObjectType,
} from 'graphql'

export default ({ document, resolvers = {}, directives = {} }) => {
  const built_schema = buildSchema(document, { noLocation: true })

  const wrap_subscription_result = (resolver, field_name) => {
    return async function* (...args) {
      for await (const value of resolver(...args)) {
        yield { [field_name]: value }
      }
    }
  }

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
          handler.constructor.name,
        )
      ) {
        field.subscribe = wrap_subscription_result(handler, field_name)
      } else if (typeof handler === 'function') {
        field.resolve = handler
      } else {
        if (handler.resolve) field.resolve = handler.resolve
        if (handler.subscribe) {
          field.subscribe = wrap_subscription_result(
            handler.subscribe,
            field_name,
          )
        }
      }
    })
  })

  const wrap_with_directive = (
    original_function,
    directive_resolver,
    directive_arguments,
    field_name,
  ) => {
    return async (...args) => {
      const [root, parameters, context, info] = args

      if (info.operation.operation !== 'subscription') {
        // The original behavior for non-subscription operations
        return await directive_resolver({
          resolve: () => original_function(root, parameters, context, info),
          root,
          parameters,
          context,
          info,
          directive_arguments,
        })
      } else {
        // If it's a subscription, the wrapping should return an async generator
        async function* subscription_generator() {
          const asyncIterable = await directive_resolver({
            resolve: async function* () {
              for await (const value of original_function(
                root,
                parameters,
                context,
                info,
              )) {
                yield value
              }
            },
            root,
            parameters,
            context,
            info,
            directive_arguments,
          })

          // Check if the directive resolver returns an asyncIterable.
          if (Symbol.asyncIterator in Object(asyncIterable)) {
            for await (const item of asyncIterable) {
              yield item
            }
          } else {
            throw new Error(
              `Directive resolver must return an AsyncIterator when used on a Subscription.`,
            )
          }
        }

        return subscription_generator()
      }
    }
  }

  const attach_directive = field => {
    const node = field.astNode
    const field_name = field.name

    node?.directives?.forEach(node_directive => {
      const directive_name = node_directive.name.value
      const directive_resolver = directives[directive_name]

      if (directive_resolver) {
        const directive_arguments = getDirectiveValues(
          built_schema.getDirective(directive_name),
          node,
        )

        if (field.subscribe)
          field.subscribe = wrap_with_directive(
            field.subscribe,
            directive_resolver,
            directive_arguments,
            field_name,
          )
        else if (field.resolve)
          field.resolve = wrap_with_directive(
            field.resolve,
            directive_resolver,
            directive_arguments,
            field_name,
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
