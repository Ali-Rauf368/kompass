import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router";
import { mockFetch, renderWithProviders } from "../test/utils";
import { passwordStrength, SignupPage } from "./Signup";

const app = (
  <Routes>
    <Route path="/signup" element={<SignupPage />} />
    <Route path="/" element={<p>Dashboard</p>} />
  </Routes>
);

describe("passwordStrength", () => {
  it("rates length and variety", () => {
    expect(passwordStrength("short")).toBe(0);
    expect(passwordStrength("alllowercase")).toBe(1);
    expect(passwordStrength("lower1234567")).toBe(2);
    expect(passwordStrength("Longer-Pass-2026")).toBe(3);
  });
});

describe("SignupPage", () => {
  it("suggests a username, creates the account and opens the app", async () => {
    const calls = mockFetch([
      { path: "/auth/me", status: 401, body: { error: "Please sign in" } },
      { method: "POST", path: "/auth/signup", status: 201, body: { user: { id: 9, username: "max.mueller", displayName: "Max Müller", roles: ["EMPLOYEE"], employeeId: null } } },
    ]);
    renderWithProviders(app, { route: "/signup" });
    await userEvent.type(await screen.findByLabelText("Full name"), "Max Müller");
    expect(screen.getByLabelText("Username")).toHaveValue("max.mueller");
    await userEvent.type(screen.getByLabelText("Email"), "max@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "a-long-secret");
    await userEvent.type(screen.getByLabelText("Confirm password"), "a-long-secret");
    await userEvent.click(screen.getByLabelText("I accept the privacy notice."));
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText("Dashboard")).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST")!.body).toEqual({ username: "max.mueller", displayName: "Max Müller", email: "max@example.com", password: "a-long-secret" });
  }, 15000);

  it("flags mismatched passwords and keeps submit disabled", async () => {
    mockFetch([{ path: "/auth/me", status: 401, body: { error: "Please sign in" } }]);
    renderWithProviders(app, { route: "/signup" });
    await userEvent.type(await screen.findByLabelText("Password"), "a-long-secret");
    await userEvent.type(screen.getByLabelText("Confirm password"), "different");
    expect(screen.getByText("Passwords do not match")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create account" })).toBeDisabled();
  });
});
