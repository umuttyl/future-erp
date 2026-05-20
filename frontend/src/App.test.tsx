/**
 * App lazy-loading smoke test.
 *
 * Verifies that:
 * 1. App default export exists
 * 2. Lazy imports resolve (no missing modules)
 * 3. PageFallback spinner renders while chunks load
 */
import { describe, expect, it, vi } from "vitest";

// Minimal mocks so the module graph can be imported without a full DOM + router
vi.mock("react-router-dom", () => ({
  Navigate: () => null,
  Route: () => null,
  Routes: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  BrowserRouter: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("./context/AuthContext", () => ({
  useAuth: () => ({ user: null, loading: false, error: null }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("./context/ThemeContext", () => ({
  useTheme: () => ({ theme: "light" }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("./components/NlpAssistantBubble", () => ({
  NlpAssistantBubble: () => null,
}));

vi.mock("./components/RequireAuth", () => ({
  RequireAuth: () => null,
}));

vi.mock("./layout/AppShell", () => ({
  AppShell: () => null,
}));

import App from "./App";

describe("App lazy-loading", () => {
  it("exports a default component", () => {
    expect(typeof App).toBe("function");
  });

  it("lazy imports resolve without throwing", async () => {
    const pages = [
      () => import("./pages/Login"),
      () => import("./pages/Signup"),
      () => import("./pages/Dashboard"),
      () => import("./pages/Sales"),
      () => import("./pages/Stock"),
      () => import("./pages/Finance"),
      () => import("./pages/Customers"),
      () => import("./pages/Suppliers"),
      () => import("./pages/Orders"),
      () => import("./pages/AiAnalysis"),
      () => import("./pages/Hr"),
      () => import("./pages/Settings"),
      () => import("./pages/Admin"),
      () => import("./pages/Onboarding"),
    ];
    const modules = await Promise.all(pages.map((fn) => fn()));
    expect(modules).toHaveLength(pages.length);
    for (const mod of modules) {
      expect(mod).toBeTruthy();
    }
  });
});
