'use client'

import { Suspense, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import MainLayout from '@/components/layout/MainLayout'
import Shop from '@/components/shop/Shop'
import ContentPage from '@/components/content/ContentPage'
import { useShopStore, useCartStore } from '@/store'
import { useAppRouter } from '@/hooks/useAppRouter'
import { useVisitorTracking } from '@/hooks/useVisitorTracking'
import { ShopPageSkeleton } from '@/components/ui/skeleton'

function HomeContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { navigate } = useAppRouter()
  
  const { fetchData, isLoading, settingsLoaded, products, settings } = useShopStore()
  const { addItem: addToCart } = useCartStore()
  
  // Track visitor session for analytics
  useVisitorTracking()
  
  // SMART: Fetch data in background - don't block UI
  // The store will use cached data if available
  useEffect(() => {
    fetchData()
  }, [fetchData])
  
  // Handle category click - navigate to category page
  const handleCategoryClick = useCallback((categoryName: string) => {
    navigate('category', { categoryName })
  }, [navigate])

  // Handle navigation
  const handleNavigate = useCallback(() => {
    navigate('shop')
  }, [navigate])
  
  // SMART: Show content IMMEDIATELY if we have cached data
  // Only show skeleton on VERY first visit (no cache)
  const hasCachedData = products.length > 0 || settingsLoaded
  
  if (!hasCachedData && isLoading) {
    return (
      <MainLayout>
        <ShopPageSkeleton />
      </MainLayout>
    )
  }
  
  // Handle content pages (about, terms, etc.)
  const page = searchParams.get('page')
  if (page && ['about', 'terms', 'refund', 'privacy'].includes(page)) {
    return (
      <MainLayout>
        <ContentPage type={page as 'about' | 'terms' | 'refund' | 'privacy'} setView={() => router.push('/')} />
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <Shop 
        setView={handleNavigate} 
        addToCart={addToCart}
        onCategoryClick={handleCategoryClick}
      />
    </MainLayout>
  )
}

// Professional skeleton loading fallback
function LoadingFallback() {
  return (
    <MainLayout>
      <ShopPageSkeleton />
    </MainLayout>
  )
}

export default function Home() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <HomeContent />
    </Suspense>
  )
}
