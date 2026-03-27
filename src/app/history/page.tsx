'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import Orders from '@/components/orders/Orders'
import { useOrderStore } from '@/store'
import { useAppRouter } from '@/hooks/useAppRouter'
import { Order } from '@/types'

function HistoryContent() {
  const { navigate } = useAppRouter()
  const { orders, customerPhone, isLoading, fetchOrdersFromServer } = useOrderStore()
  const [showPhoneInput, setShowPhoneInput] = useState(false)
  const [phoneInput, setPhoneInput] = useState('')
  const [localLoading, setLocalLoading] = useState(true)
  const [hydrated, setHydrated] = useState(false)
  
  // Handle navigation
  const handleNavigate = useCallback(() => {
    navigate('shop')
  }, [navigate])

  // Wait for hydration
  useEffect(() => {
    // Small delay to ensure zustand persist has loaded
    const timer = setTimeout(() => {
      setHydrated(true)
    }, 100)
    return () => clearTimeout(timer)
  }, [])

  // Check for phone and fetch orders when hydrated
  useEffect(() => {
    if (!hydrated) return
    
    const checkAndFetch = async () => {
      // Check URL params for phone first
      const urlParams = new URLSearchParams(window.location.search)
      const urlPhone = urlParams.get('phone')
      
      if (urlPhone) {
        // Phone in URL - fetch orders from server
        console.log('[HISTORY] Phone found in URL:', urlPhone)
        await fetchOrdersFromServer(urlPhone)
        setLocalLoading(false)
        return
      }
      
      // Check store for customerPhone (from persist)
      if (customerPhone) {
        // Have phone in storage - fetch fresh from server
        console.log('[HISTORY] Phone found in storage:', customerPhone)
        await fetchOrdersFromServer(customerPhone)
        setLocalLoading(false)
        return
      }
      
      // No phone anywhere - show input
      console.log('[HISTORY] No phone found, showing input')
      setShowPhoneInput(true)
      setLocalLoading(false)
    }
    
    checkAndFetch()
  }, [hydrated, customerPhone, fetchOrdersFromServer])

  // Auto-refresh when page becomes visible (tab switch back)
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && hydrated) {
        const urlParams = new URLSearchParams(window.location.search)
        const urlPhone = urlParams.get('phone')
        const phoneToUse = urlPhone || customerPhone
        
        if (phoneToUse) {
          console.log('[HISTORY] Page visible, refreshing orders for:', phoneToUse)
          await fetchOrdersFromServer(phoneToUse)
        }
      }
    }
    
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [hydrated, customerPhone, fetchOrdersFromServer])

  // Handle phone submit
  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (phoneInput.length >= 10) {
      setLocalLoading(true)
      await fetchOrdersFromServer(phoneInput)
      setShowPhoneInput(false)
      setLocalLoading(false)
      // Update URL with phone param
      const url = new URL(window.location.href)
      url.searchParams.set('phone', phoneInput)
      window.history.pushState({}, '', url.toString())
    }
  }

  // Handle refresh
  const handleRefresh = async () => {
    const urlParams = new URLSearchParams(window.location.search)
    const urlPhone = urlParams.get('phone')
    const phoneToUse = urlPhone || customerPhone
    
    if (phoneToUse) {
      console.log('[HISTORY] Manual refresh for phone:', phoneToUse)
      await fetchOrdersFromServer(phoneToUse)
    }
  }

  // Loading state
  if (!hydrated || localLoading || isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center" style={{ fontFamily: "'Hind Siliguri', 'Noto Sans Bengali', sans-serif" }}>
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">অর্ডার লোড হচ্ছে...</p>
        </div>
      </div>
    )
  }

  // Phone input screen
  if (showPhoneInput) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4" style={{ fontFamily: "'Hind Siliguri', 'Noto Sans Bengali', sans-serif" }}>
        <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <i className="ri-file-list-3-line text-3xl text-green-600"></i>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">আপনার অর্ডার দেখুন</h2>
            <p className="text-sm text-gray-500">আপনার মোবাইল নম্বর দিয়ে অর্ডার খুঁজুন</p>
          </div>
          
          <form onSubmit={handlePhoneSubmit}>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">মোবাইল নম্বর</label>
              <input
                type="tel"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value.replace(/\D/g, '').slice(0, 11))}
                placeholder="01XXXXXXXXX"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
              />
              {phoneInput.length > 0 && phoneInput.length < 11 && (
                <p className="text-xs text-amber-600 mt-1">১১ সংখ্যার নম্বর দিন</p>
              )}
            </div>
            
            <button
              type="submit"
              disabled={phoneInput.length < 11}
              className="w-full py-3 bg-green-600 text-white font-semibold rounded-lg disabled:bg-gray-300 disabled:cursor-not-allowed hover:bg-green-700 transition-colors"
            >
              অর্ডার খুঁজুন
            </button>
          </form>
          
          <button
            onClick={handleNavigate}
            className="w-full mt-4 py-3 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition-colors"
          >
            <i className="ri-home-4-line mr-2"></i>
            হোম পেজে যান
          </button>
        </div>
      </div>
    )
  }

  // Show orders with refresh button
  return (
    <div className="min-h-screen bg-gray-50" style={{ fontFamily: "'Hind Siliguri', 'Noto Sans Bengali', sans-serif" }}>
      {/* Header with refresh */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <h1 className="text-lg font-bold text-gray-900">আমার অর্ডার</h1>
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-green-600 bg-green-50 rounded-lg hover:bg-green-100 transition-colors disabled:opacity-50"
          >
            <i className={`ri-refresh-line ${isLoading ? 'animate-spin' : ''}`}></i>
            <span>{isLoading ? 'লোড হচ্ছে...' : 'রিফ্রেশ'}</span>
          </button>
        </div>
      </div>
      
      <Orders orders={orders as Order[]} setView={handleNavigate} />
    </div>
  )
}

export default function HistoryPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="w-full h-full absolute inset-0 skeleton-shimmer" />
      </div>
    }>
      <MainLayout>
        <HistoryContent />
      </MainLayout>
    </Suspense>
  )
}
