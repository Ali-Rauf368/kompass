import { screen } from "@testing-library/react";
import { Route, Routes } from "react-router";
import { LiveProvider } from "../lib/live";
import { ME, mockFetch, renderWithProviders } from "../test/utils";
import { Shell } from "./Shell";

const notifications = { path: "/notifications", body: { items: [{ id: "n1", kind: "leave", title: "Your leave was approved", readAt: null, createdAt: new Date().toISOString() }], unread: 1 } };
const app = (
  <LiveProvider enabled={false}>
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<p>Home</p>} />
      </Route>
    </Routes>
  </LiveProvider>
);

describe("Shell navigation", () => {
  it("shows only the areas a technician may use", async () => {
    mockFetch([ME(["EMPLOYEE"]), notifications]);
    renderWithProviders(app);
    expect(await screen.findByRole("link", { name: "Employees" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Pipeline" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Invoices" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Audit log" })).not.toBeInTheDocument();
  });

  it("shows everything to admins", async () => {
    mockFetch([ME(["ADMIN", "EMPLOYEE"]), notifications]);
    renderWithProviders(app);
    for (const name of ["Pipeline", "Service tickets", "Invoices", "Data pipelines", "Audit log"]) {
      expect(await screen.findByRole("link", { name })).toBeInTheDocument();
    }
  });

  it("shows the unread notification count", async () => {
    mockFetch([ME(), notifications]);
    renderWithProviders(app);
    expect(await screen.findByRole("button", { name: "Notifications (1)" })).toBeInTheDocument();
  });
});
