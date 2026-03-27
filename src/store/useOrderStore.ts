import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Order } from '@/types'

interface OrderState {
  orders: Order[]
  customerPhone: string | null
  isLoading: boolean
  lastFetched: number | null
  addOrder: (order: Order) => void
  clearOrders: () => void
  setCustomerPhone: (phone: string) => void
  fetchOrdersFromServer: (phone: string) => Promise<void>
  refreshOrders: () => Promise<void>
}

// Cache duration: 30 seconds
const CACHE_DURATION = 30000

export const useOrderStore = create<OrderState>()(
  persist(
    (set, get) => ({
      orders: [],
      customerPhone: null,
      isLoading: false,
      lastFetched: null,

      addOrder: (order: Order) => {
        set((state) => ({
          orders: [order, ...state.orders]
        }))
      },

      clearOrders: () => {
        set({ orders: [], customerPhone: null, lastFetched: null })
      },

      setCustomerPhone: (phone: string) => {
        set({ customerPhone: phone })
      },

      fetchOrdersFromServer: async (phone: string) => {
        const cleanPhone = phone.replace(/\D/g, '')
        if (cleanPhone.length < 10) {
          console.log('Phone number too short:', cleanPhone)
          return
        }

        set({ isLoading: true })
        
        try {
          const response = await fetch(`/api/orders?phone=${encodeURIComponent(cleanPhone)}`)
          const result = await response.json()
          
          if (result.success && result.data) {
            // Transform API data to match Order type
            const orders: Order[] = result.data.map((o: any) => ({
              id: o.id,
              customer: o.customerName,
              phone: o.phone,
              address: o.address,
              note: o.note,
              date: o.date,
              time: o.time,
              paymentMethod: o.paymentMethod,
              status: o.status,
              courierStatus: o.courierStatus,
              subtotal: parseFloat(o.subtotal) || 0,
              delivery: parseFloat(o.delivery) || 0,
              discount: parseFloat(o.discount) || 0,
              couponAmount: parseFloat(o.couponAmount) || 0,
              total: parseFloat(o.total) || 0,
              items: (o.items || []).map((item: any) => ({
                name: item.name,
                variant: item.variant,
                qty: item.qty,
                basePrice: parseFloat(item.basePrice) || 0,
                offerText: item.offerText,
                offerDiscount: parseFloat(item.offerDiscount) || 0,
                couponCode: item.couponCode,
                couponDiscount: parseFloat(item.couponDiscount) || 0,
              })),
              canceledBy: o.canceledBy,
            }))
            
            set({ 
              orders, 
              customerPhone: phone,
              lastFetched: Date.now()
            })
            console.log('Fetched', orders.length, 'orders for phone:', cleanPhone)
          }
        } catch (error) {
          console.error('Error fetching orders:', error)
        } finally {
          set({ isLoading: false })
        }
      },

      refreshOrders: async () => {
        const { customerPhone, lastFetched } = get()
        
        // Check if we need to refresh (cache expired or no phone)
        if (!customerPhone) {
          console.log('No customer phone set, skipping refresh')
          return
        }
        
        // Skip if recently fetched (within cache duration)
        if (lastFetched && (Date.now() - lastFetched) < CACHE_DURATION) {
          console.log('Cache still valid, skipping refresh')
          return
        }
        
        await get().fetchOrdersFromServer(customerPhone)
      },
    }),
    {
      name: 'ecomart-orders',
      partialize: (state) => ({ 
        orders: state.orders, 
        customerPhone: state.customerPhone 
      }),
    }
  )
)
