import { useQuery } from "@tanstack/react-query";
import {
  api,
  fetchActiveModules,
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

export function useUsers(enabled = true) {
  return useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<unknown[]>("/auth/users").then((r) => r.data.length),
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
