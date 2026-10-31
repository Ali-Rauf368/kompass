import { ShieldX } from "lucide-react";
import type { ReactNode } from "react";
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from "react-router";
import { Shell } from "./components/Shell";
import { EmptyState, Spinner } from "./components/ui";
import { AuthProvider, useAuth } from "./lib/auth";
import { I18nProvider, useI18n } from "./lib/i18n";
import { LiveProvider } from "./lib/live";
import { ToastProvider } from "./lib/toast";
import type { Role } from "./lib/types";
import { AuditPage, PipelinesPage, PrivacyPage } from "./pages/Admin";
import { DashboardPage } from "./pages/Dashboard";
import { EmployeeDetailPage, EmployeesPage } from "./pages/Employees";
import { InvoicesPage } from "./pages/Invoices";
import { LeavePage } from "./pages/Leave";
import { LoginPage } from "./pages/Login";
import { SignupPage } from "./pages/Signup";
import { CustomerDetailPage, CustomersPage, PipelinePage } from "./pages/Sales";
import { TicketDetailPage, TicketsPage } from "./pages/Tickets";

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <Spinner />;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />;
  return <LiveProvider enabled>{children}</LiveProvider>;
}

/** UI-level guard for nicer UX; the API enforces the same roles. */
function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { can } = useAuth();
  const { t } = useI18n();
  if (!can(...roles)) return <EmptyState icon={ShieldX} title={t("error.forbidden")}><Link to="/" className="text-accent hover:underline">{t("nav.dashboard")}</Link></EmptyState>;
  return children;
}

function NotFound() {
  const { t } = useI18n();
  return <EmptyState title={t("error.notFound")}><Link to="/" className="text-accent hover:underline">{t("nav.dashboard")}</Link></EmptyState>;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route element={<RequireAuth><Shell /></RequireAuth>}>
        <Route index element={<DashboardPage />} />
        <Route path="hr/employees" element={<EmployeesPage />} />
        <Route path="hr/employees/:id" element={<EmployeeDetailPage />} />
        <Route path="hr/leave" element={<LeavePage />} />
        <Route path="sales/pipeline" element={<RequireRole roles={["SALES", "MANAGER", "ACCOUNTING"]}><PipelinePage /></RequireRole>} />
        <Route path="sales/customers" element={<RequireRole roles={["SALES", "MANAGER", "ACCOUNTING", "AFTERSALES"]}><CustomersPage /></RequireRole>} />
        <Route path="sales/customers/:id" element={<RequireRole roles={["SALES", "MANAGER", "ACCOUNTING", "AFTERSALES"]}><CustomerDetailPage /></RequireRole>} />
        <Route path="after-sales/tickets" element={<RequireRole roles={["AFTERSALES", "MANAGER", "SALES"]}><TicketsPage /></RequireRole>} />
        <Route path="after-sales/tickets/:id" element={<RequireRole roles={["AFTERSALES", "MANAGER", "SALES"]}><TicketDetailPage /></RequireRole>} />
        <Route path="accounting/invoices" element={<RequireRole roles={["ACCOUNTING", "MANAGER"]}><InvoicesPage /></RequireRole>} />
        <Route path="data/pipelines" element={<RequireRole roles={["ADMIN", "ACCOUNTING", "SALES"]}><PipelinesPage /></RequireRole>} />
        <Route path="admin/audit" element={<RequireRole roles={["ADMIN"]}><AuditPage /></RequireRole>} />
        <Route path="admin/privacy" element={<PrivacyPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <I18nProvider>
        <ToastProvider>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </ToastProvider>
      </I18nProvider>
    </BrowserRouter>
  );
}
