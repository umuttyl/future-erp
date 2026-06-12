/**
 * AppSidebar rol-bazlı navigasyon smoke testi (ADM-10/13).
 *
 * Doğrular:
 * - Platform admin (role='admin') → platform nav (Platform Paneli, Tenant & Kullanıcı);
 *   şirket ERP nav'ı (Satış, Stok) GÖRÜNMEZ.
 * - Tenant owner (role='manager') → şirket ERP nav'ı (Dashboard, Satış);
 *   platform nav GÖRÜNMEZ.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppSidebar } from "./AppSidebar";

// --- Mocks --------------------------------------------------------------

const mockUseAuth = vi.fn();
vi.mock("../../context/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("../../lib/api", () => ({
  fetchActiveModules: vi.fn().mockResolvedValue({ active_modules: [] }),
}));

vi.mock("../../lib/impersonation", () => ({
  useImpersonation: () => ({ tenantId: null, tenantName: null }),
  stopImpersonation: vi.fn(),
}));

vi.mock("./HelpModal", () => ({
  HelpModal: () => null,
}));

function renderSidebar() {
  return render(
    <MemoryRouter>
      <AppSidebar />
    </MemoryRouter>,
  );
}

describe("AppSidebar role-based navigation", () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
  });

  it("platform admin sees platform nav, not company ERP nav", async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 1, email: "admin@x.com", role: "admin", is_platform_admin: true, role_kind: "" },
      logout: vi.fn(),
      hasPermission: () => true,
    });

    renderSidebar();

    await waitFor(() => {
      expect(screen.getByText("Platform Panel")).toBeInTheDocument();
    });
    expect(screen.getByText("Tenants & Users")).toBeInTheDocument();
    expect(screen.queryByText("Sales")).not.toBeInTheDocument();
    expect(screen.queryByText("Stock")).not.toBeInTheDocument();
  });

  it("tenant owner sees company ERP nav, not platform nav", async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 2, email: "owner@x.com", role: "manager", is_platform_admin: false, role_kind: "owner" },
      logout: vi.fn(),
      hasPermission: () => true,
    });

    renderSidebar();

    await waitFor(() => {
      expect(screen.getByText("Dashboard")).toBeInTheDocument();
    });
    expect(screen.getByText("Sales")).toBeInTheDocument();
    expect(screen.queryByText("Platform Panel")).not.toBeInTheDocument();
    expect(screen.queryByText("Tenants & Users")).not.toBeInTheDocument();
  });
});
