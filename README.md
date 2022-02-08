<h1 align=center>@hydre/make_schema</h1>
<p align=center>
  <img src="https://img.shields.io/github/license/hydreio/make_schema.svg?style=for-the-badge" />
  <a href="https://www.npmjs.com/package/@hydre/make_schema">
    <img src="https://img.shields.io/npm/v/@hydre/make_schema.svg?logo=npm&style=for-the-badge" />
  </a>
  <img src="https://img.shields.io/npm/dw/@hydre/make_schema?logo=npm&style=for-the-badge" />
  <img src="https://img.shields.io/github/workflow/status/hydreio/make_schema/CI?logo=Github&style=for-the-badge" />
</p>

<h3 align=center>An utility function to build a graphql schema</h3>

```js
const schema = make_schema({
  document: 'type Query { ping: String! }',
  resolvers: {
    Query: {
      ping: () => 'pong',
    },
    Subscription: {
      ping: {
        resolve: () => 'pong',
        async *subscribe() {
          yield 0
        },
      },
    },
  },
  directives: {
    foo: ({
      resolve, // original resolver
      root, // resolver params in the same order
      parameters, // .
      context, // .
      info, // .
      directive_arguments, // parameters for the directive
    }) => {},
  },
})
```
