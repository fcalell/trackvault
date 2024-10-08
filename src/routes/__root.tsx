import Header from '@/components/features/header'
import MusicPlayer from '@/components/features/music-player'
import { createTrpcClient, trpc } from '@/lib/trpc'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Outlet, createRootRoute } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'
import { useState } from 'react'
const App = () => {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: Number.POSITIVE_INFINITY,
            retry: false,
            refetchOnMount: false,
            refetchOnReconnect: false,
            refetchOnWindowFocus: false,
          },
        },
      })
  )
  const [trpcClient] = useState(() => createTrpcClient())
  return (
    <>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <div className='grid grid-rows-[56px_1fr_auto] gap-4 min-h-screen h-screen'>
            <Header />
            <div className='px-8 overflow-auto'>
              <Outlet />
            </div>
            <MusicPlayer />
          </div>
        </QueryClientProvider>
      </trpc.Provider>
      <TanStackRouterDevtools />
    </>
  )
}

export const Route = createRootRoute({
  component: App,
})
