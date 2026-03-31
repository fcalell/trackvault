---
paths:
  - "packages/api/**"
  - "apps/desktop/src/main/**"
  - "apps/desktop/src/renderer/lib/api.ts"
---

## oRPC Patterns

Procedures use `os.$context<T>()` → `.input(zodSchema)` → `.use(middleware)` → `.handler(async ({ input, context }) => ...)`.

Router is a plain object: `export const appRouter = { library: libraryRouter }`. Export `type AppRouter = typeof appRouter`.

### Server (Hono integration)

```ts
import { RPCHandler } from '@orpc/server/fetch'
import { onError } from '@orpc/server'

const handler = new RPCHandler(appRouter, {
  interceptors: [onError((error) => console.error(error))],
})

app.use('/rpc/*', async (c, next) => {
  const { matched, response } = await handler.handle(c.req.raw, {
    prefix: '/rpc',
    context: c.get('appContext'),
  })
  if (matched) return c.newResponse(response.body, response)
  await next()
})
```

Use `interceptors` with `onError` — NOT the old `plugins` array with `RequestHeadersPlugin`/`ResponseHeadersPlugin`.

### Client (SolidJS)

```ts
import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import { createTanstackQueryUtils } from '@orpc/tanstack-query'

const client = createORPCClient(new RPCLink({ url: '/rpc', fetch: customFetch }))
export const orpc = createTanstackQueryUtils(client)
```

Use `createTanstackQueryUtils` from `@orpc/tanstack-query` (framework-agnostic). NOT `createORPCSolidQueryUtils` from `@orpc/solid-query` (deprecated).

### Usage in components

```ts
const query = createQuery(() => orpc.library.scan.queryOptions({}))
const mutation = createMutation(() => orpc.library.delete.mutationOptions())
```

### Errors

```ts
import { ORPCError } from '@orpc/server'
throw new ORPCError('NOT_FOUND', { message: 'File not found' })
```

`ORPCError` comes from `@orpc/server` — never from `@orpc/contract`. The `@orpc/contract` package is not needed in a server-first approach.

## Hono Context

Inject variables via `c.set()`/`c.get()` with type-safe generics:

```ts
const app = new Hono<{ Variables: { appContext: BaseOrpcContext } }>()
app.use('*', async (c, next) => {
  c.set('appContext', context)
  await next()
})
```

## Zod 4

Import `import { z } from 'zod'` works. Core API unchanged (`z.object`, `z.string`, `z.number`, `z.infer`).

Deprecated: `.strict()` → `z.strictObject()`, `.passthrough()` → `z.looseObject()`, `.merge()` → use spread/extend.
Changed: `.default()` now accepts output type. Use `.prefault()` for old behavior.
Top-level validators: prefer `z.email()`, `z.uuid()` over `z.string().email()`, `z.string().uuid()`.
