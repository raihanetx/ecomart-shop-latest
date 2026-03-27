'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import Orders from '@/components/orders/Orders'
import { useOrderStore } from '@/store'
import { useAppRouter } from '@/hooks/useAppRouter'
import { Order } from '@/types'

function HistoryContent() {
  const { navigate } = useAppRouter()
  const { orders, customerPhone, isLoading, fetchOrdersFromServer, refreshOrders } = useOrderStore()
  const [showPhoneInput, setShowPhoneInput] = useState(false)
  const [phoneInput, setPhoneInput] = useState('')
  const [localLoading, setLocalLoading] = useState(true)
  
  // Handle navigation
  const handleNavigate = useCallback(() => {
    navigate('shop')
  }, [navigate])

  // Check for phone in URL params or localStorage on mount
  useEffect(() => {
    const checkAndFetch = async () => {
      // Check URL params for phone
      const urlParams = new URLSearchParams(window.location.search)
      const urlPhone = urlParams.get('phone')
      
      if (urlPhone) {
        // Phone in URL - fetch orders
        await fetchOrdersFromServer(urlPhone)
        setLocalLoading(false)
        return
      }
      
      if (customerPhone && orders.length > 0) {
        // Already have phone and orders - try to refresh
        await refreshOrders()
        setLocalLoading(false)
        return
      }
      
      // No phone - show input
      setShowPhoneInput(true)
      setLocalLoading(false)
    }
    
    checkAndFetch()
  }, [])

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

  // Loading state
  if (localLoading || isLoading) {
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

  // Show orders
  return <Orders orders={orders as Order[]} setView={handleNavigate} />
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
