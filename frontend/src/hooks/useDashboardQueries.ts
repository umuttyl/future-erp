import { useQuery } from "@tanstack/react-query";
import {
  api,
  fetchActiveModules,
  fetchCashflowForecast,
  type DailySalesPoint,
  type FinanceSummary,
  type ForecastResult,
  type Product,
} from "../lib/api";

export function useActiveModules(enabled = true) {
  return useQuery({
    queryKey: ["active-modules"],
    queryFn: fetchActiveModules,
    enabled,
  });
}

// ADM-9: tenant-scoped kullanıcı sayısı (manager view için)
export function useUsers(enabled = true) {
  return useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<unknown[]>("/auth/users").then((r) => r.data.length),
    enabled,
  });
}

// ADM-9: platform geneli istatistikler (admin dashboard için)
export function useAdminPlatformStats(enabled = true) {
  return useQuery({
    queryKey: ["admin", "stats"],
    queryFn: () =>
      api
        .get<{
          total_tenants: number;
          active_tenants: number;
          total_users: number;
          onboarded_tenants: number;
        }>("/admin/stats")
        .then((r) => r.data),
    enabled,
  });
}

export function useDailySales(startDate: string, endDate: string, enabled = true) {
  return useQuery({
    queryKey: ["sales-daily", startDate, endDate],
    queryFn: () =>
      api
        .get<DailySalesPoint[]>("/sales/analytics/daily", {
          params: { start_date: startDate, end_date: endDate },
        })
        .then((r) => r.data),
    enabled,
  });
}

export function useSalesRecordsCount(startDate: string, endDate: string, enabled = true) {
  return useQuery({
    queryKey: ["sales-records-count", startDate, endDate],
    queryFn: () =>
      api
        .get<unknown[]>("/sales/records", {
          params: { start_date: startDate, end_date: endDate, limit: 500 },
        })
        .then((r) => r.data.length),
    enabled,
  });
}

export function useForecastResults(enabled = true) {
  return useQuery({
    queryKey: ["forecast-results"],
    queryFn: () => api.get<ForecastResult[]>("/forecast/results").then((r) => r.data),
    enabled,
  });
}

export function useProducts(enabled = true) {
  return useQuery({
    queryKey: ["products"],
    queryFn: () => api.get<Product[]>("/products").then((r) => r.data),
    enabled,
  });
}

export function useFinanceSummary(startDate: string, endDate: string, enabled = true) {
  return useQuery({
    queryKey: ["finance-summary", startDate, endDate],
    queryFn: () =>
      api
        .get<FinanceSummary>("/finance/summary", {
          params: { start_date: startDate, end_date: endDate },
        })
        .then((r) => r.data),
    enabled,
  });
}

export function useCashflowForecast(enabled = true) {
  return useQuery({
    queryKey: ["cashflow-forecast"],
    queryFn: fetchCashflowForecast,
    enabled,
    staleTime: 5 * 60 * 1000, // 5 min — cashflow doesn't change every second
  });
}
