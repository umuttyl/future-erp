import axios, { type InternalAxiosRequestConfig } from "axios";

import {
  clearSession,
  getAccessToken,
  saveTokens,
} from "./authSession";

/** Göreli /api — Vite proxy ile backend. NLP: post('/chat') → /api/chat */
export const api = axios.create({
  baseURL: "/api",
  timeout: 20_000,
  withCredentials: true,
});

export type TokenPairOut = {
  access_token: string;
  refresh_token: string;
  token_type?: string;
};

export type AuthMe = {
  id: number;
  tenant_id: number;
  email: string;
  role: string;
  permissions: string[];
  tenant_name?: string | null;
  full_name?: string | null;
  department?: string | null;
  onboarding_completed: boolean;
};

export type SignupOut = TokenPairOut & { tenant_slug: string };

export type AuthUserRow = {
  id: number;
  tenant_id: number;
  email: string;
  role: string;
  is_active: boolean;
  full_name?: string | null;
  department?: string | null;
};

export type EmployeePerformanceRow = {
  id: number;
  full_name: string;
  email: string;
  is_active: boolean;
  role: string;
  department: string | null;
  ai_score: number;
  ai_insight: string;
};

/** GET /hr/employee-performance — admin / manager (hr.performance.read). */
export async function fetchEmployeePerformance(): Promise<
  EmployeePerformanceRow[]
> {
  const { data } = await api.get<EmployeePerformanceRow[]>(
    "/hr/employee-performance",
  );
  return data;
}

let refreshChain: Promise<void> | null = null;

async function refreshAccessToken(): Promise<void> {
  // refresh token is sent automatically via HttpOnly cookie (withCredentials: true)
  const { data } = await api.post<TokenPairOut>(
    "/auth/refresh",
    null,
    { skipAuth: true },
  );
  saveTokens(data.access_token, data.refresh_token);
}

api.interceptors.request.use((config) => {
  if (!config.skipAuth) {
    const t = getAccessToken();
    if (t) {
      config.headers.Authorization = `Bearer ${t}`;
    }
  }
  return config;
});

api.interceptors.response.use(
  (r) => r,
  async (error: unknown) => {
    if (!axios.isAxiosError(error) || !error.config) throw error;
    const orig = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };
    if (error.response?.status !== 401) throw error;
    if (orig.skipAuth) throw error;
    const url = String(orig.url ?? "");
    if (
      url.includes("/auth/refresh") ||
      url.includes("/auth/login") ||
      url.includes("/auth/signup")
    ) {
      throw error;
    }
    if (orig._retry) throw error;
    orig._retry = true;
    try {
      if (!refreshChain) {
        refreshChain = refreshAccessToken().finally(() => {
          refreshChain = null;
        });
      }
      await refreshChain;
      return api(orig);
    } catch {
      clearSession();
      throw error;
    }
  },
);

/** FastAPI global handler ``{ error: { code, message } }``; legacy ``detail`` desteklenir. */
export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    if (error.response == null) {
      const code = error.code;
      if (
        code === "ECONNREFUSED" ||
        code === "ERR_NETWORK" ||
        error.message === "Network Error"
      ) {
        return "Sunucuya bağlanılamadı. FastAPI http://127.0.0.1:8000 üzerinde çalışıyor mu ve Vite /api proxy hedefi aynı mı kontrol edin.";
      }
      if (code === "ECONNABORTED") return "İstek zaman aşımına uğradı.";
    }
    const raw = error.response?.data as
      | { error?: { message?: string }; detail?: unknown }
      | undefined;
    if (raw?.error?.message != null) return String(raw.error.message);
    const detail = raw?.detail;
    if (typeof detail === "string") return detail;
  }
  if (error instanceof Error) return error.message;
  return fallback;
}

export type DailySalesPoint = {
  date: string;
  quantity: number;
  revenue: number;
};

export type ForecastDailyPoint = {
  date: string;
  quantity?: number;
  value?: number;
  confidence?: number;
};

export type ForecastResult = {
  id: number;
  model_name: string;
  scope: string;
  product_id?: number | null;
  forecast_start: string;
  horizon_days: number;
  result_payload: {
    daily?: ForecastDailyPoint[];
    meta?: Record<string, unknown>;
  };
  created_at: string;
};

export type Product = {
  id: number;
  sku: string;
  name: string;
  category?: string | null;
  unit_price: string | number;
  cost_price: string | number;
  stock_quantity: number;
  reorder_level: number;
  created_at: string;
  updated_at: string;
};

export type ProductCreate = {
  sku: string;
  name: string;
  category?: string | null;
  unit_price: number;
  cost_price?: number;
  stock_quantity?: number;
  reorder_level?: number;
};

export type ProductUpdate = Partial<Omit<ProductCreate, "stock_quantity">>;

export type StockAdjustRequest = {
  change: number;
  movement_type?: "in" | "out" | "adjust";
  reference?: string;
  note?: string;
};

export type StockMovement = {
  id: number;
  product_id: number;
  movement_type: "in" | "out" | "adjust";
  change: number;
  balance_after: number;
  reference?: string | null;
  note?: string | null;
  created_at: string;
};

export type AutoDraftSupplyOrder = {
  id: number;
  product_id: number;
  quantity: number;
  status: string;
  created_at: string;
};

export type AutoDraftSupplyResponse = {
  message: string;
  order: AutoDraftSupplyOrder;
  stock_before: number;
  critical_threshold_used: number;
  target_stock: number;
  quantity_from_target_gap: number;
  prophet_demand_sum_30d: number | null;
};

/** Actionable AI: kritik stokta taslak tedarik satırı oluşturur. `isAiOverride`: AI bildirimi — kritik kontrolü atlanır. */
export async function postInventoryAutoDraft(
  productId: number,
  options?: { isAiOverride?: boolean },
): Promise<AutoDraftSupplyResponse> {
  const params =
    options?.isAiOverride === true
      ? ({ is_ai_override: true } satisfies Record<string, boolean>)
      : undefined;
  const { data } = await api.post<AutoDraftSupplyResponse>(
    `/inventory/${productId}/auto-draft`,
    null,
    { params },
  );
  return data;
}

export type SalesItem = {
  id: number;
  sales_record_id: number;
  product_id: number;
  quantity: number;
  unit_price: string | number;
  line_total: string | number;
};

export type SalesRecord = {
  id: number;
  record_no: string;
  sale_date: string;
  customer_name?: string | null;
  total_amount: string | number;
  created_at: string;
  updated_at: string;
  items: SalesItem[];
};

export type Customer = {
  id: number
  tenant_id: number
  name: string
  email?: string | null
  phone?: string | null
  address?: string | null
  customer_type: 'B2B' | 'B2C'
  notes?: string | null
  created_at: string
}

export type CustomerCreate = {
  name: string
  email?: string | null
  phone?: string | null
  address?: string | null
  customer_type: 'B2B' | 'B2C'
  notes?: string | null
}

export type Supplier = {
  id: number
  tenant_id: number
  name: string
  contact_person?: string | null
  email?: string | null
  phone?: string | null
  payment_terms?: string | null
  notes?: string | null
  created_at: string
}

export type SupplierCreate = {
  name: string
  contact_person?: string | null
  email?: string | null
  phone?: string | null
  payment_terms?: string | null
  notes?: string | null
}

export type FinanceSummary = {
  start_date: string;
  end_date: string;
  revenue: number;
  cogs: number;
  gross_profit: number;
  margin_pct: number;
  total_quantity: number;
  order_count: number;
  customer_count: number;
  avg_order_value: number;
  inventory_value: number;
};

export type MonthlyPoint = {
  month: string;
  revenue: number;
  quantity: number;
  orders: number;
};

export type TopCustomer = {
  customer: string;
  revenue: number;
  orders: number;
};

export type TopProduct = {
  id: number;
  sku: string;
  name: string;
  quantity: number;
  revenue: number;
};

export function formatCurrency(
  value: number | string | undefined | null,
): string {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  if (!Number.isFinite(n as number)) return "—";
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 2,
  }).format(n as number);
}

export function formatNumber(
  value: number | string | undefined | null,
): string {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  if (!Number.isFinite(n as number)) return "—";
  return new Intl.NumberFormat("tr-TR").format(n as number);
}

export type NlpChartHint = {
  type: "bar" | "line" | "pie" | "none";
  x?: string | null;
  y?: string | null;
  title?: string | null;
};

export type NlpQueryResponse = {
  sql: string;
  columns: string[];
  data: Array<Record<string, unknown>>;
  answer: string;
  chart_hint?: NlpChartHint | null;
};

export type AiHighlight = {
  title: string;
  body: string;
  severity: "positive" | "info" | "warning" | "critical";
  metric?: string | null;
};

export type TenantStat = {
  id: number;
  name: string;
  sector: string;
  revenue_last_30: number;
  revenue_growth_pct: number;
  product_count: number;
  user_count: number;
};

export type AiInsights = {
  headline: string;
  highlights: AiHighlight[];
  context: {
    today: string;
    summary_last_30: FinanceSummary & { total_tenants?: number };
    summary_prev_30: FinanceSummary;
    revenue_growth_pct: number;
    monthly_revenue: MonthlyPoint[];
    top_customers_last_30: TopCustomer[];
    top_products_last_30: TopProduct[];
    low_stock_products: Array<{
      id?: number;
      sku: string;
      name: string;
      stock_quantity: number;
      reorder_level: number;
      tenant_name?: string | null;
    }>;
    total_skus: number;
    // Admin-only extras
    total_tenants?: number;
    total_users?: number;
    critical_stock_count?: number;
    top_tenants_by_revenue?: TenantStat[];
  };
};

export type StockAlert = {
  id: number;
  sku: string;
  name: string;
  category?: string | null;
  stock_quantity: number;
  reorder_level: number;
  deficit: number;
  tenant_name?: string | null;
};

export function formatDate(value: string | undefined | null): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString("tr-TR");
  } catch {
    return value;
  }
}

// ---------------------------------------------------------------------------
// Onboarding & Modül Yönetimi
// ---------------------------------------------------------------------------

export type ModuleInfo = {
  key: string;
  label: string;
  icon: string;
  description: string;
  is_active: boolean;
};

export type SectorInfo = {
  key: string;
  label: string;
  icon: string;
  description: string;
  default_modules: string[];
};

export type OnboardingConfigResponse = {
  sectors: SectorInfo[];
  all_modules: ModuleInfo[];
  current_sector: string | null;
  current_modules: string[];
  onboarding_completed: boolean;
};

export type TenantModulesResponse = {
  sector: string | null;
  active_modules: string[];
  onboarding_completed: boolean;
};

/** GET /onboarding/config — sektör/modül konfigürasyonunu getirir. */
export async function fetchOnboardingConfig(): Promise<OnboardingConfigResponse> {
  const { data } = await api.get<OnboardingConfigResponse>("/onboarding/config");
  return data;
}

/** POST /onboarding/setup — sektör + modül seçimini kaydeder. */
export async function postOnboardingSetup(body: {
  sector: string;
  active_modules: string[];
}): Promise<TenantModulesResponse> {
  const { data } = await api.post<TenantModulesResponse>("/onboarding/setup", body);
  return data;
}

/** GET /onboarding/modules — mevcut aktif modülleri getirir (sidebar için). */
export async function fetchActiveModules(): Promise<TenantModulesResponse> {
  const { data } = await api.get<TenantModulesResponse>("/onboarding/modules");
  return data;
}

/** PATCH /onboarding/modules — modülleri günceller (ayarlar sayfası). */
export async function patchActiveModules(body: {
  active_modules: string[];
}): Promise<TenantModulesResponse> {
  const { data } = await api.patch<TenantModulesResponse>("/onboarding/modules", body);
  return data;
}

// ---------------------------------------------------------------------------
// Anomali Tespiti
// ---------------------------------------------------------------------------

export type AnomalyResultOut = {
  source: string;
  severity: "critical" | "warning" | "info";
  title: string;
  message: string;
  score: number;
  entity_id?: number | null;
  entity_label?: string | null;
  extra?: Record<string, unknown>;
};

export type AnomalyRunResponse = {
  tenant_id: number;
  total: number;
  anomalies: AnomalyResultOut[];
};

/** GET /anomaly/run — anomali tespitini çalıştırır + WS üzerinden yayınlar. */
export async function runAnomalyDetection(): Promise<AnomalyRunResponse> {
  const { data } = await api.get<AnomalyRunResponse>("/anomaly/run");
  return data;
}

/** GET /anomaly/latest — son tespit sonuçlarını getirir. */
export async function fetchLatestAnomalies(): Promise<AnomalyRunResponse> {
  const { data } = await api.get<AnomalyRunResponse>("/anomaly/latest");
  return data;
}
