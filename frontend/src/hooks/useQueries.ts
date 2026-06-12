import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  api,
  fetchCustomerBalances,
  fetchCustomerHealth,
  fetchAllTagsForType,
  type Customer,
  type CustomerCreate,
  type CustomerHealthOut,
  type SalesRecord,
  type Product,
} from '../lib/api'

// ── Query Keys ────────────────────────────────────────────────────────────────
export const QK = {
  customers:       (search?: string) => ['customers', search ?? ''] as const,
  customerBalance: ()                => ['customer-balances'] as const,
  customerHealth:  ()                => ['customer-health'] as const,
  customerTags:    ()                => ['customer-tags'] as const,
  sales:           (start: string, end: string) => ['sales', start, end] as const,
  products:        (search?: string) => ['products', search ?? ''] as const,
  stock:           ()                => ['stock'] as const,
}

// ── Customers ─────────────────────────────────────────────────────────────────

export function useCustomers(search = '', limit = 500) {
  return useQuery({
    queryKey: QK.customers(search),
    queryFn: () =>
      api.get<Customer[]>('/customers', { params: { limit, search: search || undefined } })
         .then(r => r.data),
    staleTime: 60_000,
  })
}

export function useCustomerBalances() {
  return useQuery({
    queryKey: QK.customerBalance(),
    queryFn: () => fetchCustomerBalances().then(list => {
      const map = new Map<number, number>()
      for (const b of list) map.set(b.customer_id, Number(b.balance))
      return map
    }),
    staleTime: 30_000,
  })
}

export function useCustomerHealth() {
  return useQuery({
    queryKey: QK.customerHealth(),
    queryFn: () => fetchCustomerHealth(500).then(scores => {
      const map = new Map<number, CustomerHealthOut>()
      for (const h of scores) map.set(h.customer_id, h)
      return map
    }),
    staleTime: 120_000,
  })
}

export function useCustomerTags() {
  return useQuery({
    queryKey: QK.customerTags(),
    queryFn: () => fetchAllTagsForType('customer').then(raw => {
      const map = new Map<number, string[]>()
      for (const [id, tags] of Object.entries(raw)) map.set(Number(id), tags)
      return map
    }),
    staleTime: 60_000,
  })
}

export function useCreateCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CustomerCreate) => api.post<Customer>('/customers', data).then(r => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['customers'] })
      void qc.invalidateQueries({ queryKey: ['customer-balances'] })
    },
  })
}

export function useUpdateCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CustomerCreate> }) =>
      api.patch<Customer>(`/customers/${id}`, data).then(r => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['customers'] })
    },
  })
}

export function useDeleteCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.delete(`/customers/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['customers'] })
      void qc.invalidateQueries({ queryKey: ['customer-balances'] })
      void qc.invalidateQueries({ queryKey: ['customer-health'] })
    },
  })
}

// ── Sales ─────────────────────────────────────────────────────────────────────

export function useSales(startDate: string, endDate: string, enabled = true) {
  return useQuery({
    queryKey: QK.sales(startDate, endDate),
    queryFn: () =>
      api.get<SalesRecord[]>('/sales/records', {
        params: { start_date: startDate, end_date: endDate, limit: 500 },
      }).then(r => r.data),
    enabled,
    staleTime: 30_000,
  })
}

export function useDeleteSale() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.delete(`/sales/records/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['sales'] })
      // Dashboard'u da güncelle
      void qc.invalidateQueries({ queryKey: ['sales-daily'] })
      void qc.invalidateQueries({ queryKey: ['sales-records-count'] })
      void qc.invalidateQueries({ queryKey: ['finance-summary'] })
    },
  })
}

// ── Products ──────────────────────────────────────────────────────────────────

export function useProducts(search = '', limit = 500) {
  return useQuery({
    queryKey: QK.products(search),
    queryFn: () =>
      api.get<Product[]>('/products', { params: { limit, search: search || undefined } })
         .then(r => r.data),
    staleTime: 60_000,
  })
}

export function useDeleteProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.delete(`/products/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['products'] })
      void qc.invalidateQueries({ queryKey: ['stock'] })
    },
  })
}
