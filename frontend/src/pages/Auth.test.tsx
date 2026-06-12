/**
 * Login akışı smoke testi (ADM-12).
 *
 * Doğrular:
 * - Login formu render olur; şirket kodu alanı "platform admin için boş bırakın" ipucunu gösterir.
 * - Form gönderimi useAuth.login()'i girilen kimlik bilgileriyle çağırır.
 * - Platform admin: şirket kodu boş bırakılıp gönderilince login boş slug ile çağrılır.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthPage } from "./Auth";

const mockLogin = vi.fn();
const mockUseAuth = vi.fn();

vi.mock("../context/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("../context/ThemeContext", () => ({
  useTheme: () => ({ theme: "light", toggleTheme: vi.fn() }),
}));

function renderLogin() {
  return render(
    <MemoryRouter>
      <AuthPage initialTab="login" />
    </MemoryRouter>,
  );
}

function getSubmitButton(): HTMLButtonElement {
  const buttons = screen.getAllByRole("button", { name: "Sign In" });
  const submit = buttons.find((b) => (b as HTMLButtonElement).type === "submit");
  if (!submit) throw new Error("submit button not found");
  return submit as HTMLButtonElement;
}

describe("Login form", () => {
  beforeEach(() => {
    mockLogin.mockReset();
    mockUseAuth.mockReturnValue({
      user: null,
      loading: false,
      error: null,
      login: mockLogin,
    });
  });

  it("renders the platform-admin hint on the company code field", () => {
    renderLogin();
    expect(screen.getByText(/leave empty for platform admin/i)).toBeInTheDocument();
  });

  it("calls login with entered company credentials", async () => {
    mockLogin.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText("Email"), "owner@acme.com");
    await user.type(screen.getByLabelText("Password"), "Secret123");
    await user.click(getSubmitButton());

    expect(mockLogin).toHaveBeenCalledTimes(1);
    const arg = mockLogin.mock.calls[0][0];
    expect(arg.email).toBe("owner@acme.com");
    expect(arg.password).toBe("Secret123");
    expect(arg.tenant_slug).toBe("default"); // default
  });

  it("platform admin: empty company code → login called with empty slug", async () => {
    mockLogin.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderLogin();

    const slug = screen.getByLabelText(/Company code/i);
    await user.clear(slug);
    await user.type(screen.getByLabelText("Email"), "admin@demo.example.com");
    await user.type(screen.getByLabelText("Password"), "Admin12345");
    await user.click(getSubmitButton());

    expect(mockLogin).toHaveBeenCalledTimes(1);
    const arg = mockLogin.mock.calls[0][0];
    expect(arg.tenant_slug).toBe(""); // empty slug → backend tries platform admin
    expect(arg.email).toBe("admin@demo.example.com");
  });
});
