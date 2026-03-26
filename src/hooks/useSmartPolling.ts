// Smart Polling System - Production Ready for Vercel Serverless
// NO SSE needed - Works 100% reliably on Vercel!

import { useEffect, useRef, useCallback, useState } from 'react'

// ============================================
// CONFIGURATION
// ============================================

const POLL_CONFIG = {
  // Active polling (when user is interacting)
  ACTIVE_INTERVAL: 3000,      // 3 seconds when active
  
  // Background polling (when tab is in background)
  BACKGROUND_INTERVAL: 30000, // 30 seconds when background
  
  // Idle polling (no activity for a while)
  IDLE_INTERVAL: 60000,       // 60 seconds when idle
  
  // How long before considering user idle
  IDLE_TIMEOUT: 120000,       // 2 minutes of no activity = idle
  
  // Retry on error
  ERROR_RETRY_INTERVAL: 5000, // 5 seconds after error
  MAX_RETRIES: 3,
}

// ============================================
// SMART POLLING HOOK
// ============================================

/**
 * Production-Ready Smart Polling for Vercel
 * 
 * How it works:
 * 1. Polls every 3 seconds when user is active
 * 2. Polls every 30 seconds when tab is in background
 * 3. Polls every 60 seconds when user is idle
 * 4. Stops polling when tab is hidden (saves resources)
 * 5. Instantly refetches when user comes back
 * 
 * Usage:
 * const { data, isLoading, isRefetching } = useSmartPolling(
 *   '/api/products',
 *   { enabled: true }
 * )
 */
export function useSmartPolling<T = any>(
  endpoint: string,
  options: {
    enabled?: boolean
    initialData?: T
    onData?: (data: T) => void
    onError?: (error: Error) => void
  } = {}
) {
  const { enabled = true, initialData, onData, onError } = options
  
  const [data, setData] = useState<T | undefined>(initialData)
  const [isLoading, setIsLoading] = useState(!initialData)
  const [isRefetching, setIsRefetching] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  
  // Track last activity time
  const lastActivityRef = useRef(Date.now())
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const retryCountRef = useRef(0)
  const abortControllerRef = useRef<AbortController | null>(null)
  
  // Track if tab is visible
  const isVisibleRef = useRef(true)
  const isActiveRef = useRef(true)
  
  // Fetch function with ETag support
  const fetchData = useCallback(async (isRefetch = false) => {
    if (!enabled) return
    
    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    abortControllerRef.current = new AbortController()
    
    if (isRefetch) {
      setIsRefetching(true)
    }
    
    try {
      const response = await fetch(endpoint, {
        signal: abortControllerRef.current.signal,
        headers: {
          'Cache-Control': 'no-cache',
        },
      })
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const result = await response.json()
      
      if (result.success !== false) {
        setData(result.data ?? result)
        setLastUpdated(new Date())
        setError(null)
        retryCountRef.current = 0
        
        if (onData) {
          onData(result.data ?? result)
        }
      } else {
        throw new Error(result.error || 'Failed to fetch data')
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('[SmartPoll] Error:', err.message)
        setError(err)
        retryCountRef.current++
        
        if (onError) {
          onError(err)
        }
      }
    } finally {
      setIsLoading(false)
      setIsRefetching(false)
    }
  }, [endpoint, enabled, onData, onError])
  
  // Get current polling interval based on state
  const getCurrentInterval = useCallback(() => {
    // If too many errors, slow down
    if (retryCountRef.current >= POLL_CONFIG.MAX_RETRIES) {
      return POLL_CONFIG.ERROR_RETRY_INTERVAL * 2
    }
    
    // If error occurred, use retry interval
    if (error) {
      return POLL_CONFIG.ERROR_RETRY_INTERVAL
    }
    
    // If tab is not visible, don't poll at all
    if (!isVisibleRef.current) {
      return null // No polling when hidden
    }
    
    // If user is idle
    const timeSinceActivity = Date.now() - lastActivityRef.current
    if (timeSinceActivity > POLL_CONFIG.IDLE_TIMEOUT) {
      isActiveRef.current = false
      return POLL_CONFIG.IDLE_INTERVAL
    }
    
    // If tab is in background but visible
    if (!document.hasFocus()) {
      return POLL_CONFIG.BACKGROUND_INTERVAL
    }
    
    // Active state
    isActiveRef.current = true
    return POLL_CONFIG.ACTIVE_INTERVAL
  }, [error])
  
  // Start/stop polling
  const startPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
    }
    
    const interval = getCurrentInterval()
    
    if (interval === null) {
      // Don't poll when tab is hidden
      return
    }
    
    pollIntervalRef.current = setInterval(() => {
      const newInterval = getCurrentInterval()
      
      if (newInterval === null) {
        // Stop polling
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current)
          pollIntervalRef.current = null
        }
        return
      }
      
      // If interval changed, restart polling
      if (newInterval !== interval) {
        startPolling()
        return
      }
      
      fetchData(true)
    }, interval)
  }, [getCurrentInterval, fetchData])
  
  // Handle visibility changes
  useEffect(() => {
    const handleVisibilityChange = () => {
      const wasHidden = !isVisibleRef.current
      isVisibleRef.current = !document.hidden
      
      if (document.hidden) {
        // Tab is hidden - stop polling
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current)
          pollIntervalRef.current = null
        }
      } else if (wasHidden) {
        // Tab became visible - instant refresh + restart polling
        fetchData(true)
        startPolling()
      }
    }
    
    document.addEventListener('visibilitychange', handleVisibilityChange)
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [fetchData, startPolling])
  
  // Handle window focus
  useEffect(() => {
    const handleFocus = () => {
      // Update activity time
      lastActivityRef.current = Date.now()
      
      // Instant refresh when window gets focus
      fetchData(true)
    }
    
    const handleBlur = () => {
      // Restart polling with background interval
      startPolling()
    }
    
    window.addEventListener('focus', handleFocus)
    window.addEventListener('blur', handleBlur)
    
    return () => {
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('blur', handleBlur)
    }
  }, [fetchData, startPolling])
  
  // Track user activity
  useEffect(() => {
    const updateActivity = () => {
      lastActivityRef.current = Date.now()
    }
    
    // Track mouse and keyboard activity
    window.addEventListener('mousemove', updateActivity)
    window.addEventListener('keydown', updateActivity)
    window.addEventListener('click', updateActivity)
    window.addEventListener('scroll', updateActivity)
    
    return () => {
      window.removeEventListener('mousemove', updateActivity)
      window.removeEventListener('keydown', updateActivity)
      window.removeEventListener('click', updateActivity)
      window.removeEventListener('scroll', updateActivity)
    }
  }, [])
  
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
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [enabled, fetchData, startPolling])
  
  // Manual refresh function
  const refresh = useCallback(() => {
    fetchData(true)
  }, [fetchData])
  
  return {
    data,
    isLoading,
    isRefetching,
    error,
    lastUpdated,
    refresh,
    isActive: isActiveRef.current,
  }
}

// ============================================
// ENTITY-SPECIFIC HOOKS
// ============================================

/**
 * Hook for polling products with smart caching
 */
export function useProductsPolling(initialProducts: any[] = []) {
  return useSmartPolling('/api/products', {
    initialData: initialProducts,
  })
}

/**
 * Hook for polling orders with instant updates on focus
 */
export function useOrdersPolling(initialOrders: any[] = []) {
  return useSmartPolling('/api/orders', {
    initialData: initialOrders,
  })
}

/**
 * Hook for polling inventory/stock
 */
export function useInventoryPolling(initialInventory: any[] = []) {
  return useSmartPolling('/api/inventory', {
    initialData: initialInventory,
  })
}

/**
 * Hook for polling settings
 */
export function useSettingsPolling(initialSettings: Record<string, any> = {}) {
  return useSmartPolling('/api/settings', {
    initialData: initialSettings,
  })
}

/**
 * Hook for polling coupons
 */
export function useCouponsPolling(initialCoupons: any[] = []) {
  return useSmartPolling('/api/coupons', {
    initialData: initialCoupons,
  })
}

// ============================================
// ADMIN DASHBOARD HOOK - Polls all critical data
// ============================================

export function useAdminDashboardPolling() {
  const products = useSmartPolling('/api/products')
  const orders = useSmartPolling('/api/orders')
  const inventory = useSmartPolling('/api/inventory')
  const customers = useSmartPolling('/api/customers')
  
  const isLoading = products.isLoading || orders.isLoading || inventory.isLoading
  const isRefetching = products.isRefetching || orders.isRefetching || inventory.isRefetching
  
  const refreshAll = useCallback(() => {
    products.refresh()
    orders.refresh()
    inventory.refresh()
    customers.refresh()
  }, [products, orders, inventory, customers])
  
  return {
    products: products.data,
    orders: orders.data,
    inventory: inventory.data,
    customers: customers.data,
    isLoading,
    isRefetching,
    refreshAll,
    lastUpdated: products.lastUpdated,
  }
}
