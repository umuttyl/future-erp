import axios, { type InternalAxiosRequestConfig } from "axios";

import i18n from "../i18n";
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
  tenant_id: number | null;
  email: string;
  is_platform_admin: boolean;
  role_kind: string;
  role: string;                    // computed_field: 'admin' | 'manager' | 'employee'
  permissions: string[];
  tenant_name?: string | null;
  tenant_slug?: string | null;
  full_name?: string | null;
  department?: string | null;
  onboarding_completed: boolean;
  currency?: string;
  language?: string;
};

export type SignupOut = TokenPairOut & { tenant_slug: string };

export type AuthUserRow = {
  id: number;
  tenant_id: number | null;
  email: string;
  is_platform_admin: boolean;
  role: string;       // computed: 'admin'|'manager'|'employee'
  role_kind: string;
  job_role_id?: number | null;
  is_active: boolean;
  full_name?: string | null;
  department?: string | null;
};


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
  // Impersonation header must not reach auth endpoints (login, me, refresh, logout)
  const url = String(config.url ?? "");
  if (url.includes("/auth/")) {
    delete (config.headers as Record<string, unknown>)["X-Impersonate-Tenant-Id"];
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
        return i18n.t("apiError.networkError");
      }
      if (code === "ECONNABORTED") return i18n.t("apiError.timeout");
    }
    const raw = error.response?.data as
      | { error?: { message?: string; code?: string }; detail?: unknown }
      | undefined;
    if (raw?.error?.message != null) return String(raw.error.message);
    // Fall back to a localized message keyed by the stable error code.
    const errCode = raw?.error?.code;
    if (errCode) {
      const key = `apiError.${errCode}`;
      const translated = i18n.t(key);
      if (translated !== key) return translated;
    }
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
  tax_rate: string | number;
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
  tax_rate?: number;
  stock_quantity?: number;
  reorder_level?: number;
};

export type ProductUpdate = Partial<Omit<ProductCreate, "stock_quantity">>;

export type StockAdjustRequest = {
  change: number;
  movement_type?: "in" | "out" | "adjust";
  reference?: string;
  note?: string;
  unit_cost?: number;
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
  is_existing_order: boolean;
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
  tax_rate: string | number;
  tax_amount: string | number;
};

export type SalesRecord = {
  id: number;
  record_no: string;
  sale_date: string;
  customer_id?: number | null;
  customer_name?: string | null;
  total_amount: string | number;
  payment_type: 'nakit' | 'kredi' | 'banka_havalesi';
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
  // Accrual P&L
  revenue: number;
  revenue_excl_tax: number;
  tax_total: number;
  cogs: number;
  gross_profit: number;
  margin_pct: number;
  total_op_expenses: number;
  net_profit: number;
  // Volume
  total_quantity: number;
  order_count: number;
  customer_count: number;
  avg_order_value: number;
  inventory_value: number;
  // Cash basis (cashbook)
  cash_income: number;
  cash_expense: number;
  cash_net: number;
  net_result: number; // alias for net_profit
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

// ---------------------------------------------------------------------------
// Aktif yerelleştirme (tenant'tan login'de set edilir) — global para/dil temeli
// ---------------------------------------------------------------------------
let _activeCurrency = "TRY";
let _activeLocale = "en-GB";

const LANG_TO_LOCALE: Record<string, string> = { tr: "tr-TR", en: "en-US" };

/** Login/onboarding sonrası tenant tercihini uygular; tüm formatCurrency çağrıları bunu kullanır. */
export function setActiveLocale(currency?: string | null, language?: string | null): void {
  if (currency) _activeCurrency = currency;
  if (language) _activeLocale = LANG_TO_LOCALE[language] ?? _activeLocale;
}

export function getActiveCurrency(): string {
  return _activeCurrency;
}

export function getActiveLocale(): string {
  return _activeLocale;
}

export function formatCurrency(
  value: number | string | undefined | null,
  opts?: { maximumFractionDigits?: number; compact?: boolean },
): string {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  if (!Number.isFinite(n as number)) return "—";
  return new Intl.NumberFormat(_activeLocale, {
    style: "currency",
    currency: _activeCurrency,
    maximumFractionDigits: opts?.maximumFractionDigits ?? 2,
    notation: opts?.compact ? "compact" : "standard",
  }).format(n as number);
}

export function formatNumber(
  value: number | string | undefined | null,
): string {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  if (!Number.isFinite(n as number)) return "—";
  return new Intl.NumberFormat(_activeLocale).format(n as number);
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
    return new Date(value).toLocaleDateString(_activeLocale);
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
  currency: string;
  language: string;
  supported_currencies: string[];
  supported_languages: string[];
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

/** PATCH /auth/me — update own profile (full_name, department). */
export async function updateMe(data: {
  full_name?: string | null;
  department?: string | null;
}): Promise<AuthMe> {
  const { data: me } = await api.patch<AuthMe>("/auth/me", data);
  return me;
}

/** POST /auth/me/change-password — change own password. */
export async function changeOwnPassword(payload: {
  current_password: string;
  new_password: string;
}): Promise<void> {
  await api.post("/auth/me/change-password", payload);
}

/** POST /onboarding/setup — sektör + modül + para birimi/dil seçimini kaydeder. */
export async function postOnboardingSetup(body: {
  sector: string;
  active_modules: string[];
  currency?: string;
  language?: string;
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

// ─── Roles ────────────────────────────────────────────────────────────────────

export type RoleOut = {
  id: number
  tenant_id: number
  name: string
  permissions: string[]
  is_system: boolean
  created_at: string
}

export async function fetchRoles(): Promise<RoleOut[]> {
  const { data } = await api.get<RoleOut[]>('/roles')
  return data
}

export async function createRole(payload: { name: string; permissions: string[] }): Promise<RoleOut> {
  const { data } = await api.post<RoleOut>('/roles', payload)
  return data
}

export async function updateRole(id: number, payload: { name?: string; permissions?: string[] }): Promise<RoleOut> {
  const { data } = await api.patch<RoleOut>(`/roles/${id}`, payload)
  return data
}

export async function deleteRole(id: number): Promise<void> {
  await api.delete(`/roles/${id}`)
}

// ─── Cashbook ─────────────────────────────────────────────────────────────────

export type CashAccountOut = {
  id: number
  tenant_id: number
  name: string
  account_type: 'cash' | 'bank'
  currency: string
  balance: number
  is_active: boolean
  created_at: string
}

export type CashTransactionOut = {
  id: number
  tenant_id: number
  account_id: number
  transaction_type: 'income' | 'expense' | 'transfer_in' | 'transfer_out'
  amount: number
  balance_after: number
  description: string | null
  reference: string | null
  sales_record_id: number | null
  transaction_date: string
  created_at: string
}

export type DailyReportEntry = {
  account_id: number
  account_name: string
  account_type: string
  opening_balance: number
  total_income: number
  total_expense: number
  closing_balance: number
  transaction_count: number
}

export type DailyReportOut = {
  report_date: string
  accounts: DailyReportEntry[]
  total_opening: number
  total_income: number
  total_expense: number
  total_closing: number
}

export type CashAccountCreate = {
  name: string
  account_type: 'cash' | 'bank'
  currency?: string
  opening_balance?: number
}

export type CashTransactionCreate = {
  transaction_type: 'income' | 'expense' | 'transfer_in' | 'transfer_out'
  amount: number
  description?: string | null
  reference?: string | null
  transaction_date: string
}

export async function fetchCashAccounts(): Promise<CashAccountOut[]> {
  const { data } = await api.get<CashAccountOut[]>('/cashbook/accounts')
  return data
}

export async function createCashAccount(payload: CashAccountCreate): Promise<CashAccountOut> {
  const { data } = await api.post<CashAccountOut>('/cashbook/accounts', payload)
  return data
}

export async function updateCashAccount(id: number, payload: { name?: string; is_active?: boolean }): Promise<CashAccountOut> {
  const { data } = await api.patch<CashAccountOut>(`/cashbook/accounts/${id}`, payload)
  return data
}

export async function fetchCashTransactions(
  accountId: number,
  params?: { date_from?: string; date_to?: string },
): Promise<CashTransactionOut[]> {
  const { data } = await api.get<CashTransactionOut[]>(
    `/cashbook/accounts/${accountId}/transactions`,
    { params },
  )
  return data
}

export async function addCashTransaction(
  accountId: number,
  payload: CashTransactionCreate,
): Promise<CashTransactionOut> {
  const { data } = await api.post<CashTransactionOut>(
    `/cashbook/accounts/${accountId}/transactions`,
    payload,
  )
  return data
}

export async function fetchDailyReport(reportDate?: string): Promise<DailyReportOut> {
  const { data } = await api.get<DailyReportOut>('/cashbook/daily-report', {
    params: reportDate ? { report_date: reportDate } : undefined,
  })
  return data
}

// ─── Cari Hesap (Accounts) ───────────────────────────────────────────────────

export type CustomerBalanceOut = {
  customer_id: number
  customer_name: string
  balance: string
}

export type StatementEntry = {
  id: number
  movement_date: string
  movement_type: string
  description: string | null
  reference: string | null
  debit: string
  credit: string
  balance: string
}

export type StatementOut = {
  customer_id: number
  customer_name: string
  opening_balance: string
  closing_balance: string
  entries: StatementEntry[]
}

export type PaymentCreate = {
  amount: number
  description?: string
  movement_date: string
  invoice_no?: string | null
}

export async function fetchCustomers(): Promise<Customer[]> {
  const { data } = await api.get<Customer[]>('/customers', { params: { limit: 500 } })
  return data
}

export async function fetchCustomerBalances(): Promise<CustomerBalanceOut[]> {
  const { data } = await api.get<CustomerBalanceOut[]>('/accounts/customers')
  return data
}

export async function fetchCustomerStatement(
  customerId: number,
  params?: { start_date?: string; end_date?: string },
): Promise<StatementOut> {
  const { data } = await api.get<StatementOut>(
    `/accounts/customers/${customerId}/statement`,
    { params },
  )
  return data
}

export async function recordPayment(
  customerId: number,
  payload: PaymentCreate,
): Promise<void> {
  await api.post(`/accounts/customers/${customerId}/payments`, payload)
}

// ─── HR / Team ───────────────────────────────────────────────────────────────

export type EmployeePerformance = {
  id: number
  full_name: string
  email: string
  is_active: boolean
  role: string
  role_kind: string | null
  department: string | null
  ai_score: number
  ai_insight: string
  sales_count: number
  sales_revenue: number
  tasks_total: number
  tasks_done: number
}

export type TeamTask = {
  id: number
  tenant_id: number
  title: string
  description: string | null
  assignee_id: number | null
  assignee_name: string | null
  created_by_user_id: number | null
  due_date: string | null
  priority: 'low' | 'medium' | 'high'
  status: 'todo' | 'in_progress' | 'done'
  customer_id: number | null
  customer_name: string | null
  supply_order_id: number | null
  created_at: string
  updated_at: string
}

export type TeamTaskCreate = {
  title: string
  description?: string | null
  assignee_id?: number | null
  due_date?: string | null
  priority: 'low' | 'medium' | 'high'
  status: 'todo' | 'in_progress' | 'done'
  customer_id?: number | null
  supply_order_id?: number | null
}

export type TeamTaskUpdate = Partial<TeamTaskCreate>

export async function fetchEmployeePerformance(): Promise<EmployeePerformance[]> {
  const { data } = await api.get<EmployeePerformance[]>('/hr/employee-performance')
  return data
}

export async function fetchTeamTasks(params?: { assignee_id?: number; status?: string }): Promise<TeamTask[]> {
  const { data } = await api.get<TeamTask[]>('/hr/tasks', { params })
  return data
}

export async function createTeamTask(payload: TeamTaskCreate): Promise<TeamTask> {
  const { data } = await api.post<TeamTask>('/hr/tasks', payload)
  return data
}

export async function updateTeamTask(taskId: number, payload: TeamTaskUpdate): Promise<TeamTask> {
  const { data } = await api.patch<TeamTask>(`/hr/tasks/${taskId}`, payload)
  return data
}

export async function deleteTeamTask(taskId: number): Promise<void> {
  await api.delete(`/hr/tasks/${taskId}`)
}

// ─── Customer Orders ──────────────────────────────────────────────────────────

export type CustomerOrderItem = {
  id: number
  product_id: number
  quantity: number
  unit_price: string | number
  tax_rate: string | number
  line_total: string | number
  tax_amount: string | number
}

export type CustomerOrder = {
  id: number
  order_no: string
  order_date: string
  customer_id?: number | null
  customer_name?: string | null
  status: 'draft' | 'confirmed' | 'shipped' | 'invoiced' | 'cancelled'
  notes?: string | null
  total_amount: string | number
  tax_total: string | number
  created_by_user_id?: number | null
  created_at: string
  updated_at: string
  items: CustomerOrderItem[]
}

// ─── Stok Sayımı ─────────────────────────────────────────────────────────────

export type StockCountItem = {
  id: number
  product_id: number
  system_qty: number
  counted_qty: number
  difference: number
}

export type StockCount = {
  id: number
  count_no: string
  count_date: string
  status: 'draft' | 'completed' | 'cancelled'
  notes?: string | null
  created_by_user_id?: number | null
  created_at: string
  completed_at?: string | null
  items: StockCountItem[]
}

export type StockCountCreate = {
  count_no: string
  count_date: string
  notes?: string | null
  items: { product_id: number; counted_qty: number }[]
}

export async function fetchStockCounts(params?: { skip?: number; limit?: number }): Promise<StockCount[]> {
  const { data } = await api.get<StockCount[]>('/stock-counts', { params })
  return data
}

export async function createStockCount(payload: StockCountCreate): Promise<StockCount> {
  const { data } = await api.post<StockCount>('/stock-counts', payload)
  return data
}

export async function completeStockCount(countId: number): Promise<StockCount> {
  const { data } = await api.post<StockCount>(`/stock-counts/${countId}/complete`)
  return data
}

export async function cancelStockCount(countId: number): Promise<StockCount> {
  const { data } = await api.post<StockCount>(`/stock-counts/${countId}/cancel`)
  return data
}

export async function fetchStockMovements(params?: { product_id?: number; limit?: number }): Promise<StockMovement[]> {
  const { data } = await api.get<StockMovement[]>('/products/movements', { params })
  return data
}

export type CustomerOrderItemCreate = {
  product_id: number
  quantity: number
  unit_price: number
  tax_rate?: number
}

export type CustomerOrderCreate = {
  order_no: string
  order_date: string
  customer_id?: number | null
  customer_name?: string | null
  notes?: string | null
  items: CustomerOrderItemCreate[]
}

export type DeliveryNoteItem = {
  id: number
  product_id: number
  order_item_id?: number | null
  quantity: number
}

export type DeliveryNote = {
  id: number
  order_id: number
  delivery_no: string
  delivery_date: string
  status: string
  notes?: string | null
  created_by_user_id?: number | null
  created_at: string
  items: DeliveryNoteItem[]
}

export type DeliveryNoteCreate = {
  delivery_no: string
  delivery_date: string
  notes?: string | null
  items: { product_id: number; quantity: number; order_item_id?: number | null }[]
}

export type Invoice = {
  id: number
  order_id: number
  delivery_note_id?: number | null
  invoice_no: string
  invoice_date: string
  customer_id?: number | null
  customer_name?: string | null
  total_amount: string | number
  tax_total: string | number
  status: string
  notes?: string | null
  created_by_user_id?: number | null
  created_at: string
  updated_at: string
}

export type InvoiceCreate = {
  invoice_no: string
  invoice_date: string
  notes?: string | null
}

export async function fetchOrders(params?: { order_status?: string; skip?: number; limit?: number }): Promise<CustomerOrder[]> {
  const { data } = await api.get<CustomerOrder[]>('/orders', { params })
  return data
}

export async function fetchOrder(orderId: number): Promise<CustomerOrder> {
  const { data } = await api.get<CustomerOrder>(`/orders/${orderId}`)
  return data
}

export async function createOrder(payload: CustomerOrderCreate): Promise<CustomerOrder> {
  const { data } = await api.post<CustomerOrder>('/orders', payload)
  return data
}

export async function confirmOrder(orderId: number): Promise<CustomerOrder> {
  const { data } = await api.post<CustomerOrder>(`/orders/${orderId}/confirm`)
  return data
}

export async function cancelOrder(orderId: number): Promise<CustomerOrder> {
  const { data } = await api.post<CustomerOrder>(`/orders/${orderId}/cancel`)
  return data
}

export async function createDeliveryNote(orderId: number, payload: DeliveryNoteCreate): Promise<DeliveryNote> {
  const { data } = await api.post<DeliveryNote>(`/orders/${orderId}/delivery-notes`, payload)
  return data
}

export async function fetchDeliveryNotes(orderId: number): Promise<DeliveryNote[]> {
  const { data } = await api.get<DeliveryNote[]>(`/orders/${orderId}/delivery-notes`)
  return data
}

export async function createInvoice(orderId: number, payload: InvoiceCreate, deliveryNoteId?: number): Promise<Invoice> {
  const { data } = await api.post<Invoice>(
    `/orders/${orderId}/invoices`,
    payload,
    { params: deliveryNoteId ? { delivery_note_id: deliveryNoteId } : undefined },
  )
  return data
}

export async function fetchInvoices(orderId: number): Promise<Invoice[]> {
  const { data } = await api.get<Invoice[]>(`/orders/${orderId}/invoices`)
  return data
}

export type InvoicePrintItem = {
  product_id: number
  product_name: string
  quantity: number
  unit_price: string
  tax_rate: string
  line_total: string
  tax_amount: string
}

export type InvoicePrintData = {
  invoice_id: number
  invoice_no: string
  invoice_date: string
  order_id: number
  order_no: string
  order_date: string
  customer_name: string | null
  notes: string | null
  subtotal: string
  tax_total: string
  total_amount: string
  items: InvoicePrintItem[]
  company_name: string
  company_address: string | null
  company_phone: string | null
  company_tax_number: string | null
  company_logo_url: string | null
  currency: string
}

export async function fetchInvoicePrintData(orderId: number, invoiceId: number): Promise<InvoicePrintData> {
  const { data } = await api.get<InvoicePrintData>(`/orders/${orderId}/invoices/${invoiceId}/print-data`)
  return data
}

export async function downloadEFaturaXml(orderId: number, invoiceId: number, invoiceNo: string): Promise<void> {
  const res = await api.get(`/orders/${orderId}/invoices/${invoiceId}/efatura-xml`, { responseType: 'blob' })
  const url = URL.createObjectURL(new Blob([res.data], { type: 'application/xml' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `efatura_${invoiceNo.replace(/\//g, '-')}.xml`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ─── Veri İçe Aktarma (Import) ───────────────────────────────────────────────

export type ImportResult = {
  imported: number;
  skipped: number;
  errors: Array<{ row: number; message: string }>;
};

export type ImportResource = "products" | "customers";

export async function importFromFile(
  resource: ImportResource,
  file: File,
): Promise<ImportResult> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post<ImportResult>(`/import/${resource}`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function downloadImportTemplate(resource: ImportResource): Promise<void> {
  const filename = resource === "products" ? "urun_sablon.xlsx" : "musteri_sablon.xlsx";
  const response = await api.get(`/import/template/${resource}`, { responseType: "blob" });
  const blob = new Blob([response.data as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

// ─── Veri Dışa Aktarma ────────────────────────────────────────────────────────

export type ExportResource = "sales" | "products" | "customers" | "accounts" | "orders"

export async function downloadExport(
  resource: ExportResource,
  filename: string,
  params?: Record<string, string>,
): Promise<void> {
  // api.baseURL = "/api" — bu yüzden sadece "/export/..." kullanıyoruz
  let url = `/export/${resource}`
  if (params && Object.keys(params).length > 0) {
    url += `?${new URLSearchParams(params).toString()}`
  }
  const response = await api.get(url, { responseType: "blob" })
  const blob = new Blob([response.data as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
  const link = document.createElement("a")
  link.href = URL.createObjectURL(blob)
  link.download = filename
  link.click()
  URL.revokeObjectURL(link.href)
}

// ─── Şirket Profili ───────────────────────────────────────────────────────────

export type CompanyProfile = {
  name: string
  address?: string | null
  phone?: string | null
  tax_number?: string | null
  bank_info?: string | null
  logo_url?: string | null
  currency?: string
  language?: string
  supported_currencies?: string[]
  supported_languages?: string[]
}

export async function fetchCompanyProfile(): Promise<CompanyProfile> {
  const { data } = await api.get<CompanyProfile>('/onboarding/profile')
  return data
}

export async function patchCompanyProfile(payload: Partial<CompanyProfile>): Promise<CompanyProfile> {
  const { data } = await api.patch<CompanyProfile>('/onboarding/profile', payload)
  return data
}

export async function uploadCompanyLogo(file: File): Promise<string> {
  const form = new FormData()
  form.append('file', file)
  const { data } = await api.post<{ logo_url: string }>('/onboarding/profile/logo', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data.logo_url
}

// ─── Audit Log ────────────────────────────────────────────────────────────────

export type AuditLogOut = {
  id: number
  actor_tenant_id: number
  actor_user_id: number
  action: string
  target_tenant_id?: number | null
  target_entity_type?: string | null
  target_entity_id?: number | null
  payload?: Record<string, unknown> | null
  ip_address?: string | null
  created_at: string
}

export async function fetchAuditLogs(params?: {
  tenant_id?: number
  action?: string
  skip?: number
  limit?: number
}): Promise<AuditLogOut[]> {
  const { data } = await api.get<AuditLogOut[]>('/admin/audit-logs', { params })
  return data
}

// ─── 5 Uzman AI (2C-2) ───────────────────────────────────────────────────────

export type ExpertInfo = {
  key: string
  name: string
  icon: string
  description: string
}

export type ExpertQueryOut = {
  expert_key: string
  expert_name: string
  expert_icon: string
  answer: string
  sql: string
  columns: string[]
  data: Record<string, unknown>[]
  chart_hint?: Record<string, unknown> | null
}

export async function fetchExperts(): Promise<ExpertInfo[]> {
  const { data } = await api.get<ExpertInfo[]>('/ai/experts')
  return data
}

export async function queryExpert(
  expertKey: string,
  text: string,
  context?: string,
): Promise<ExpertQueryOut> {
  const { data } = await api.post<ExpertQueryOut>(`/ai/expert/${expertKey}/query`, {
    text,
    context,
  }, { timeout: 90_000 })
  return data
}

export async function autoRouteQuery(
  text: string,
  context?: string,
): Promise<ExpertQueryOut> {
  const { data } = await api.post<ExpertQueryOut>('/ai/auto-route', { text, context })
  return data
}

export type BriefingItem = {
  title: string
  body: string
  priority: 'high' | 'medium' | 'low'
  icon: string
  action_label?: string | null
  action_url?: string | null
}

export type MorningBriefingOut = {
  date: string
  items: BriefingItem[]
}

export async function fetchMorningBriefing(): Promise<MorningBriefingOut> {
  const { data } = await api.get<MorningBriefingOut>('/ai/morning-briefing')
  return data
}

// ─── 2C-4 Inline AI Signals ───────────────────────────────────────────────────

export type CustomerSignalOut = {
  customer_id: number
  signals: string[]
}

export type ProductSignalOut = {
  product_id: number
  signals: string[]
}

export async function fetchCustomerSignals(): Promise<CustomerSignalOut[]> {
  const { data } = await api.get<CustomerSignalOut[]>('/ai/signals/customers')
  return data
}

export async function fetchProductSignals(): Promise<ProductSignalOut[]> {
  const { data } = await api.get<ProductSignalOut[]>('/ai/signals/products')
  return data
}

export type CustomerHealthOut = {
  customer_id: number
  customer_name: string
  score: number
  tier: 'healthy' | 'good' | 'at_risk' | 'critical'
  last_order_days: number | null
  orders_90d: number
  balance: number
  signals: string[]
}

// ─── 3-7 AI Cashflow Simülasyon ──────────────────────────────────────────────

export type CashflowDayPoint = {
  date: string
  balance: number
  status: 'ok' | 'warning' | 'danger'
}

export type CashflowForecast = {
  current_balance: number
  daily_income_avg: number
  daily_expense_avg: number
  net_daily: number
  horizon_days: number
  projection: CashflowDayPoint[]
  first_danger_date: string | null
  first_warning_date: string | null
  status: 'ok' | 'warning' | 'danger'
  alert_message: string | null
  lookback_days: number
  has_cashbook_data: boolean
}

export async function fetchCashflowForecast(): Promise<CashflowForecast> {
  const { data } = await api.get<CashflowForecast>('/ai/cashflow-forecast')
  return data
}

export async function fetchCustomerHealth(limit = 50): Promise<CustomerHealthOut[]> {
  const { data } = await api.get<CustomerHealthOut[]>('/ai/customer-health', { params: { limit } })
  return data
}

export async function loadDemoData(): Promise<void> {
  await api.post('/onboarding/demo-data')
}

export async function clearDemoData(): Promise<void> {
  await api.delete('/onboarding/demo-data')
}

export type ReorderRecommendation = {
  product_id: number;
  sku: string;
  name: string;
  current_stock: number;
  reorder_level: number;
  daily_sales_avg: number;
  days_remaining: number | null;
  deficit: number;
  suggested_order_qty: number;
  urgency: "critical" | "warning";
  has_pending_order: boolean;
};

export type ReorderRecommendationsOut = {
  recommendations: ReorderRecommendation[];
  total_needing_attention: number;
  critical_count: number;
  warning_count: number;
  analysis_period_days: number;
};

export async function fetchReorderRecommendations(topN = 20): Promise<ReorderRecommendationsOut> {
  const { data } = await api.get<ReorderRecommendationsOut>('/ai/reorder-recommendations', {
    params: { top_n: topN },
  })
  return data
}

// ── Comments & Tags ───────────────────────────────────────────────────────────

export type CommentOut = {
  id: number
  author_name: string
  body: string
  created_at: string
  user_id: number
}

export type RecordDataOut = {
  tags: string[]
  comments: CommentOut[]
  preset_tags: string[]
}

export type EntityType = 'customer' | 'product' | 'order'

export async function fetchRecordData(entityType: EntityType, entityId: number): Promise<RecordDataOut> {
  const { data } = await api.get<RecordDataOut>(`/comments-tags/${entityType}/${entityId}`)
  return data
}

export async function addComment(entityType: EntityType, entityId: number, body: string): Promise<CommentOut> {
  const { data } = await api.post<CommentOut>(`/comments-tags/${entityType}/${entityId}/comments`, { body })
  return data
}

export async function deleteComment(commentId: number): Promise<void> {
  await api.delete(`/comments-tags/comments/${commentId}`)
}

export async function addTag(entityType: EntityType, entityId: number, tag: string): Promise<void> {
  await api.post(`/comments-tags/${entityType}/${entityId}/tags`, { tag })
}

export async function removeTag(entityType: EntityType, entityId: number, tag: string): Promise<void> {
  await api.delete(`/comments-tags/${entityType}/${entityId}/tags/${encodeURIComponent(tag)}`)
}

export async function fetchAllTagsForType(entityType: EntityType): Promise<Record<number, string[]>> {
  const { data } = await api.get<Record<number, string[]>>(`/comments-tags/${entityType}/all-tags`)
  return data
}

// ── Customer Timeline ─────────────────────────────────────────────────────────

export type TimelineEventKind = 'sale' | 'payment' | 'credit' | 'comment'

export type TimelineEvent = {
  kind: TimelineEventKind
  timestamp: string
  title: string
  subtitle: string | null
  amount: number | null
}

export async function fetchCustomerTimeline(customerId: number, limit = 30): Promise<TimelineEvent[]> {
  const { data } = await api.get<TimelineEvent[]>(`/customers/${customerId}/timeline`, { params: { limit } })
  return data
}

// ── Expenses ──────────────────────────────────────────────────────────────────

export type ExpenseOut = {
  id: number
  tenant_id: number
  category: string
  description: string
  amount: number
  currency: string
  expense_date: string
  vendor: string | null
  receipt_ref: string | null
  created_by: number | null
  created_at: string
}

export type ExpenseCreate = {
  category: string
  description: string
  amount: number
  currency?: string
  expense_date: string
  vendor?: string | null
  receipt_ref?: string | null
}

export type ExpenseUpdate = Partial<ExpenseCreate>

export type ExpenseSummary = {
  grand_total: number
  by_category: { category: string; total: number; count: number }[]
}

export async function fetchExpenses(params?: {
  start_date?: string
  end_date?: string
  category?: string
}): Promise<ExpenseOut[]> {
  const { data } = await api.get<ExpenseOut[]>('/expenses', { params })
  return data
}

export async function fetchExpenseSummary(params?: {
  start_date?: string
  end_date?: string
}): Promise<ExpenseSummary> {
  const { data } = await api.get<ExpenseSummary>('/expenses/summary', { params })
  return data
}

export async function createExpense(payload: ExpenseCreate): Promise<ExpenseOut> {
  const { data } = await api.post<ExpenseOut>('/expenses', payload)
  return data
}

export async function updateExpense(id: number, payload: ExpenseUpdate): Promise<ExpenseOut> {
  const { data } = await api.patch<ExpenseOut>(`/expenses/${id}`, payload)
  return data
}

export async function deleteExpense(id: number): Promise<void> {
  await api.delete(`/expenses/${id}`)
}

// ── Notifications ─────────────────────────────────────────────────────────────

export type NotificationOut = {
  id: number
  kind: string
  message: string
  source: string
  payload_json: string | null
  read_at: string | null
  created_at: string
}

export async function fetchNotifications(): Promise<NotificationOut[]> {
  const { data } = await api.get<NotificationOut[]>('/notifications')
  return data
}

export async function markNotificationRead(id: number): Promise<void> {
  await api.patch(`/notifications/${id}/read`)
}

export async function markAllNotificationsRead(): Promise<void> {
  await api.patch('/notifications/read-all')
}

export async function deleteReadNotifications(): Promise<void> {
  await api.delete('/notifications/read')
}

// ── Password Reset ────────────────────────────────────────────────────────────

export async function forgotPassword(payload: {
  tenant_slug: string
  email: string
}): Promise<void> {
  await api.post('/auth/forgot-password', payload, { skipAuth: true })
}

export async function resetPassword(payload: {
  token: string
  new_password: string
}): Promise<void> {
  await api.post('/auth/reset-password', payload, { skipAuth: true })
}
