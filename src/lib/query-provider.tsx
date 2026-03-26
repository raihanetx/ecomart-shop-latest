'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 0, // Always stale - fetch fresh data immediately
            gcTime: 0, // No cache retention - always fresh fetch
            refetchOnWindowFocus: true, // Refetch when window gets focus
            refetchOnMount: true, // Always refetch on component mount
            refetchOnReconnect: true, // Refetch on network reconnect
            retry: 1,
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}
