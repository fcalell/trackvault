---
paths:
  - "apps/desktop/src/main/**"
  - "apps/desktop/src/preload/**"
---

## Electron Patterns

### Protocol Registration

`protocol.registerFileProtocol` is removed. Use `protocol.handle`:

```ts
import { net, protocol } from 'electron'

protocol.handle('local-file', (request) => {
  const filePath = decodeURIComponent(request.url.replace('local-file://', ''))
  return net.fetch(`file://${filePath}`)
})
```

`protocol.registerSchemesAsPrivileged` must still be called before `app.whenReady()`.

### Context Bridge

Never expose entire `ipcRenderer` — use safe wrappers:

```ts
contextBridge.exposeInMainWorld('appApi', {
  fetch: (req: IpcRequest): Promise<IpcResponse> => ipcRenderer.invoke('fetch', req),
})
```

### IPC Bridge (oRPC via RPCHandler)

The Electron main process uses `RPCHandler` from `@orpc/server/fetch` directly — NOT through Hono.
Hono is only for the server deployment (Node.js, Cloudflare Workers).

```ts
import { RPCHandler } from '@orpc/server/fetch'
import { onError } from '@orpc/server'
import { appRouter } from '@repo/api/orpc'

const handler = new RPCHandler(appRouter, {
  interceptors: [onError((error) => console.error(error))],
})

ipcMain.handle('fetch', async (_event, ipcReq) => {
  const request = new Request(`https://electron.local${ipcReq.url}`, { ... })
  const { matched, response } = await handler.handle(request, {
    prefix: '/rpc',
    context: appContext,
  })
  // serialize response back
})
```

## Build: vite-plugin-electron + Vite 8

Uses `vite-plugin-electron/simple` — NOT Electron Forge. Single `vite.config.ts` for main, preload, and renderer.

```ts
import electron from 'vite-plugin-electron/simple'

export default defineConfig({
  plugins: [
    electron({
      main: { entry: 'src/main/index.ts', vite: { build: { rollupOptions: { external: [...] } } } },
      preload: { input: 'src/preload/index.ts' },
      renderer: {},
    }),
    // ...other renderer plugins (solid, tailwind, tanstack-router)
  ],
})
```

- Output: `dist-electron/` for main+preload, `dist/` for renderer
- Dev server URL: `process.env.VITE_DEV_SERVER_URL` (set automatically by the plugin)
- ESM output (`"type": "module"`): use `import.meta.url` polyfill for `__dirname`:
  ```ts
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  ```
- Scripts: `dev` → `vite`, `build` → `vite build`
