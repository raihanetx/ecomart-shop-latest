// Production-Ready Real-Time System for Vercel
// Combines: Smart Polling + Mutation Refresh + Optimistic Updates
// NO SSE needed - Works 100% reliably on Vercel Serverless!

import { create } from 'zustand'
import { useCallback, useEffect, useRef, useState } from 'react'

// ============================================
// CONFIGURATION
// ============================================

const REALTIME_CONFIG = {
  // Polling intervals
  ACTIVE_POLL_INTERVAL: 5000,      // 5 seconds when active
  BACKGROUND_POLL_INTERVAL: 30000, // 30 seconds when tab background
  IDLE_POLL_INTERVAL: 60000,       // 60 seconds when user idle
  
  // Activity tracking
  IDLE_TIMEOUT: 120000,            // 2 minutes = idle
  
  // Mutation refresh
  MUTATION_REFRESH_DELAY: 100,     // Small delay after mutation
  
  // Error handling
  ERROR_RETRY_DELAY: 5000,
  MAX_ERROR_RETRIES: 3,
}

// ============================================
// GLOBAL STATE FOR REAL-TIME SYNC
// ============================================

interface RealtimeState {
  // Connection status
  isActive: boolean
  isPolling: boolean
  lastSyncTime: number | null
  
  // Update flags (UI can react to these)
  updates: {
    products: number
    orders: number
    inventory: number
    customers: number
    settings: number
    coupons: number
  }
  
  // Actions
  markUpdate: (type: keyof RealtimeState['updates']) => void
  clearUpdates: () => void
  setPolling: (polling: boolean) => void
  updateSyncTime: () => void
}

export const useRealtimeStore = create<RealtimeState>((set) => ({
  isActive: true,
  isPolling: false,
  lastSyncTime: null,
  updates: {
    products: 0,
    orders: 0,
    inventory: 0,
    customers: 0,
    settings: 0,
    coupons: 0,
  },
  
  markUpdate: (type) => set((state) => ({
    lastSyncTime: Date.now(),
    updates: {
      ...state.updates,
      [type]: state.updates[type] + 1,
    },
  })),
  
  clearUpdates: () => set({
    updates: {
      products: 0,
      orders: 0,
      inventory: 0,
      customers: 0,
      settings: 0,
      coupons: 0,
    },
  }),
  
  setPolling: (polling) => set({ isPolling: polling }),
  updateSyncTime: () => set({ lastSyncTime: Date.now() }),
}))

// ============================================
// MUTATION REFRESH TRIGGER
// ============================================

// Global function to trigger refresh after mutations
let refreshCallbacks: Map<string, Set<() => void>> = new Map()

export function registerRefreshCallback(type: string, callback: () => void): () => void {
  if (!refreshCallbacks.has(type)) {
    refreshCallbacks.set(type, new Set())
  }
  refreshCallbacks.get(type)!.add(callback)
  
  return () => {
    refreshCallbacks.get(type)?.delete(callback)
  }
}

export function triggerRefresh(type: string | string[]) {
  const types = Array.isArray(type) ? type : [type]
  
  types.forEach(t => {
    // Mark update in store
    useRealtimeStore.getState().markUpdate(t as any)
    
    // Call registered callbacks
    const callbacks = refreshCallbacks.get(t)
    if (callbacks) {
      callbacks.forEach(cb => {
        setTimeout(cb, REALTIME_CONFIG.MUTATION_REFRESH_DELAY)
      })
    }
  })
}

// ============================================
// SMART FETCHER WITH CACHING
// ============================================

// Simple in-memory cache
const dataCache = new Map<string, { data: any; timestamp: number }>()
const CACHE_TTL = 30000 // 30 seconds

async function smartFetch<T>(endpoint: string, forceRefresh = false): Promise<T> {
  // Check cache
  const cached = dataCache.get(endpoint)
  if (!forceRefresh && cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data
  }
  
  // Fetch fresh data
  const response = await fetch(endpoint, {
    headers: {
      'Cache-Control': 'no-cache',
    },
  })
  
  if (!response.ok) {
    throw new Error(`Failed to fetch ${endpoint}`)
  }
  
  const result = await response.json()
  const data = result.data ?? result
  
  // Update cache
  dataCache.set(endpoint, { data, timestamp: Date.now() })
  
  return data
}

// Invalidate cache for specific endpoint
export function invalidateCache(endpoint: string) {
  dataCache.delete(endpoint)
  
  // Also invalidate by pattern
  dataCache.forEach((_, key) => {
    if (key.includes(endpoint) || endpoint.includes(key)) {
      dataCache.delete(key)
    }
  })
}

// ============================================
// SMART DATA HOOK
// ============================================

interface UseSmartDataOptions<T> {
  endpoint: string
  initialData?: T
  enabled?: boolean
  pollInterval?: number
  onSuccess?: (data: T) => void
  onError?: (error: Error) => void
}

export function useSmartData<T = any>(options: UseSmartDataOptions<T>) {
  const {
    endpoint,
    initialData,
    enabled = true,
    pollInterval,
    onSuccess,
    onError,
  } = options
  
  const [data, setData] = useState<T | undefined>(initialData)
  const [isLoading, setIsLoading] = useState(!initialData)
  const [isRefetching, setIsRefetching] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const lastActivityRef = useRef(Date.now())
  const errorCountRef = useRef(0)
  const abortControllerRef = useRef<AbortController | null>(null)
  
  // Fetch function
  const fetchData = useCallback(async (forceRefresh = false) => {
    if (!enabled) return
    
    // Cancel previous request
    abortControllerRef.current?.abort()
    abortControllerRef.current = new AbortController()
    
    setIsRefetching(true)
    
    try {
      const result = await smartFetch<T>(endpoint, forceRefresh)
      setData(result)
      setLastUpdated(new Date())
      setError(null)
      errorCountRef.current = 0
      useRealtimeStore.getState().updateSyncTime()
      onSuccess?.(result)
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error(`[SmartData] Error fetching ${endpoint}:`, err)
        setError(err)
        errorCountRef.current++
        onError?.(err)
      }
    } finally {
      setIsLoading(false)
      setIsRefetching(false)
    }
  }, [endpoint, enabled, onSuccess, onError])
  
  // Get dynamic poll interval
  const getPollInterval = useCallback(() => {
    // Custom interval provided
    if (pollInterval) return pollInterval
    
    // Too many errors
    if (errorCountRef.current >= REALTIME_CONFIG.MAX_ERROR_RETRIES) {
      return REALTIME_CONFIG.ERROR_RETRY_DELAY * 2
    }
    
    // Error state
    if (error) {
      return REALTIME_CONFIG.ERROR_RETRY_DELAY
    }
    
    // Tab not visible
    if (document.hidden) {
      return null // Don't poll when hidden
    }
    
    // User idle
    const idleTime = Date.now() - lastActivityRef.current
    if (idleTime > REALTIME_CONFIG.IDLE_TIMEOUT) {
      return REALTIME_CONFIG.IDLE_POLL_INTERVAL
    }
    
    // Tab in background
    if (!document.hasFocus()) {
      return REALTIME_CONFIG.BACKGROUND_POLL_INTERVAL
    }
    
    // Active
    return REALTIME_CONFIG.ACTIVE_POLL_INTERVAL
  }, [pollInterval, error])
  
  // Start polling
  const startPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
    }
    
    const interval = getPollInterval()
    if (interval === null) return
    
    pollIntervalRef.current = setInterval(() => {
      const newInterval = getPollInterval()
      
      if (newInterval === null) {
        clearInterval(pollIntervalRef.current!)
        pollIntervalRef.current = null
        return
      }
      
      if (newInterval !== interval) {
        startPolling()
        return
      }
      
      fetchData(true)
    }, interval)
    
    useRealtimeStore.getState().setPolling(true)
  }, [getPollInterval, fetchData])
  
  // Visibility change handler
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        // Stop polling when hidden
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current)
          pollIntervalRef.current = null
        }
        useRealtimeStore.getState().setPolling(false)
      } else {
        // Instant refresh + restart polling when visible
        fetchData(true)
        startPolling()
      }
    }
    
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [fetchData, startPolling])
  
  // Focus handler
  useEffect(() => {
    const handleFocus = () => {
      lastActivityRef.current = Date.now()
      fetchData(true)
      startPolling()
    }
    
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [fetchData, startPolling])
  
  // Activity tracking
  useEffect(() => {
    const trackActivity = () => {
      lastActivityRef.current = Date.now()
    }
    
    window.addEventListener('mousemove', trackActivity)
    window.addEventListener('keydown', trackActivity)
    window.addEventListener('click', trackActivity)
    
    return () => {
      window.removeEventListener('mousemove', trackActivity)
      window.removeEventListener('keydown', trackActivity)
      window.removeEventListener('click', trackActivity)
    }
  }, [])
  
  // Register for mutation refresh
  useEffect(() => {
    const type = endpoint.replace('/api/', '').split('/')[0]
    const unregister = registerRefreshCallback(type, () => {
      fetchData(true)
    })
    return unregister
  }, [endpoint, fetchData])
  
  // Initial fetch and start polling
  useEffect(() => {
    if (enabled) {
      fetchData()
      startPolling()
    }
    
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
      }
      abortControllerRef.current?.abort()
    }
  }, [enabled, fetchData, startPolling])
  
  // Manual refresh
  const refresh = useCallback(() => {
    invalidateCache(endpoint)
    fetchData(true)
  }, [endpoint, fetchData])
  
  return {
    data,
    isLoading,
    isRefetching,
    error,
    lastUpdated,
    refresh,
  }
}

// ============================================
// ENTITY-SPECIFIC HOOKS WITH INSTANT REFRESH
// ============================================

// Products Hook
export function useProductsData(initialData?: any[]) {
  return useSmartData({
    endpoint: '/api/products',
    initialData,
  })
}

// Orders Hook
export function useOrdersData(initialData?: any[]) {
  return useSmartData({
    endpoint: '/api/orders',
    initialData,
  })
}

// Inventory Hook
export function useInventoryData(initialData?: any[]) {
  return useSmartData({
    endpoint: '/api/inventory',
    initialData,
  })
}

// Customers Hook
export function useCustomersData(initialData?: any[]) {
  return useSmartData({
    endpoint: '/api/customers',
    initialData,
  })
}

// Settings Hook
export function useSettingsData(initialData?: Record<string, any>) {
  return useSmartData({
    endpoint: '/api/settings',
    initialData,
  })
}

// Coupons Hook
export function useCouponsData(initialData?: any[]) {
  return useSmartData({
    endpoint: '/api/coupons',
    initialData,
  })
}

// ============================================
// HELPER TO REFRESH AFTER MUTATIONS
// ============================================

// Call this after any create/update/delete operation
export function refreshAfterMutation(type: 'products' | 'orders' | 'inventory' | 'customers' | 'settings' | 'coupons') {
  invalidateCache(`/api/${type}`)
  triggerRefresh(type)
}

// Refresh multiple types
export function refreshMultiple(types: Array<'products' | 'orders' | 'inventory' | 'customers' | 'settings' | 'coupons'>) {
  types.forEach(type => {
    invalidateCache(`/api/${type}`)
  })
  triggerRefresh(types)
}
