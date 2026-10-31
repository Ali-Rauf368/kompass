import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router";
import { mockFetch, renderWithProviders } from "../test/utils";
import { LoginPage } from "./Login";

const app = (
  <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/" element={<p>Dashboard</p>} />
  </Routes>
);

describe("LoginPage", () => {
  it("signs in with directory credentials and sends the CSRF header", async () => {
    const calls = mockFetch([
      { path: "/auth/me", status: 401, body: { error: "Please sign in" } },
      { method: "POST", path: "/auth/login", body: { user: { id: 1, username: "anna.schmidt", displayName: "Anna Schmidt", roles: ["ADMIN"], employeeId: 1 } } },
    ]);
    renderWithProviders(app, { route: "/login" });
    await userEvent.type(await screen.findByLabelText("Username"), "anna.schmidt");
    await userEvent.type(screen.getByLabelText("Password"), "kompass");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Dashboard")).toBeInTheDocument();
    const login = calls.find((c) => c.method === "POST")!;
    expect(login.body).toEqual({ username: "anna.schmidt", password: "kompass" });
    expect((global.fetch as jest.Mock).mock.calls.find(([, init]) => init?.method === "POST")[1].headers["X-Kompass-Client"]).toBe("web");
  });

  it("shows the server's error message", async () => {
    mockFetch([
      { path: "/auth/me", status: 401, body: { error: "Please sign in" } },
      { method: "POST", path: "/auth/login", status: 401, body: { error: "Username or password is incorrect" } },
    ]);
    renderWithProviders(app, { route: "/login" });
    await userEvent.type(await screen.findByLabelText("Username"), "anna.schmidt");
    await userEvent.type(screen.getByLabelText("Password"), "nope");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Username or password is incorrect");
  });

  it("fills in a demo account", async () => {
    mockFetch([{ path: "/auth/me", status: 401, body: { error: "Please sign in" } }]);
    renderWithProviders(app, { route: "/login" });
    await userEvent.click(await screen.findByRole("button", { name: /jonas.weber/ }));
    expect(screen.getByLabelText("Username")).toHaveValue("jonas.weber");
    expect(screen.getByLabelText("Password")).toHaveValue("kompass");
  });

  it("switches the interface to German", async () => {
    mockFetch([{ path: "/auth/me", status: 401, body: { error: "Please sign in" } }]);
    renderWithProviders(app, { route: "/login" });
    await userEvent.click(await screen.findByRole("button", { name: "de" }));
    await waitFor(() => expect(screen.getByLabelText("Benutzername")).toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "Anmelden" })).toBeInTheDocument();
  });
});
