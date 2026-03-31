# Frontend

UI component library, routing, and data fetching patterns for the SolidJS desktop app.

## UI Components (Kobalte + CVA + Tailwind v4)

Components live in `packages/ui/src/components/`. Each component has its own directory with `component.tsx` + `index.ts`.

### Component Pattern

```tsx
import * as Primitive from '@kobalte/core/component-name'
import type { PolymorphicProps } from '@kobalte/core/polymorphic'
import { cva } from 'class-variance-authority'
import type { ValidComponent } from 'solid-js'
import { splitProps } from 'solid-js'
import { cn } from '#lib/cn'

const variants = cva('base-classes', { variants: { ... }, defaultVariants: { ... } })

const Component = <T extends ValidComponent = 'div'>(
  props: PolymorphicProps<T, ComponentProps<T>>,
) => {
  const [local, others] = splitProps(props as ComponentProps, ['variant', 'class'])
  return <Primitive.Root class={cn(variants({ variant: local.variant }), local.class)} {...others} />
}
```

Key: cast `props as ComponentProps` (non-generic) when calling `splitProps`. Kobalte components accept `class` natively.

### Portal Pattern (Dialog, AlertDialog, DropdownMenu)

```tsx
<Dialog.Portal>
  <Dialog.Overlay />
  <Dialog.Content>{children}</Dialog.Content>
</Dialog.Portal>
```

### Animation

Use `data-expanded` attribute on Overlay/Content for CSS animations. Use `forceMount` for animation library control.

## Routing (TanStack Solid Router)

File-based routing in `apps/desktop/src/renderer/routes/`.

- Root: `export const Route = createRootRoute({ component })`
- Pages: `export const Route = createFileRoute('/path')({ component, loader })`
- Route tree auto-generated at `routeTree.gen.ts`

Vite plugin: `tanstackRouter({ target: 'solid', autoCodeSplitting: true })` — must come BEFORE `solidPlugin()`.

## Data Fetching (oRPC + TanStack Solid Query)

```tsx
import { createQuery, createMutation } from '@tanstack/solid-query'
import { orpc } from '#lib/api'

const query = createQuery(() => orpc.library.scan.queryOptions({}))
const mutation = createMutation(() => orpc.library.delete.mutationOptions())
```

Use safe query wrapper from `#lib/query` — returns `undefined` during pending instead of stale data.
