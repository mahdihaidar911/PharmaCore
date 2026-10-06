import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { NoAccess, Spinner } from "./components/ui";
import { useAuth } from "./context/AuthContext";
import type { Permission } from "./lib/api";
import AccountPage from "./pages/AccountPage";
import AssistantPage from "./pages/AssistantPage";
import BackupPage from "./pages/BackupPage";
import DashboardPage from "./pages/DashboardPage";
import InventoryPage from "./pages/InventoryPage";
import LoginPage from "./pages/LoginPage";
import MophPage from "./pages/MophPage";
import POSPage from "./pages/POSPage";
import ProductsPage from "./pages/ProductsPage";
import ProfilePage from "./pages/ProfilePage";
import ReceiveStockPage from "./pages/ReceiveStockPage";
import ReportsPage from "./pages/ReportsPage";
import ReturnsPage from "./pages/ReturnsPage";
import SalesPage from "./pages/SalesPage";
import SettingsPage from "./pages/SettingsPage";
import UsersPage from "./pages/UsersPage";

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function Guard({ anyOf, children }: { anyOf: Permission[]; children: ReactNode }) {
  const { can } = useAuth();
  return anyOf.some((p) => can(p)) ? <>{children}</> : <NoAccess />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route path="/pos" element={<Guard anyOf={["pos.sell"]}><POSPage /></Guard>} />
        <Route path="/products" element={<Guard anyOf={["products.view"]}><ProductsPage /></Guard>} />
        <Route path="/moph" element={<Guard anyOf={["catalog.import"]}><MophPage /></Guard>} />
        <Route path="/receive" element={<Guard anyOf={["inventory.receive"]}><ReceiveStockPage /></Guard>} />
        <Route path="/inventory" element={<Guard anyOf={["inventory.view"]}><InventoryPage /></Guard>} />
        <Route path="/sales" element={<Guard anyOf={["sales.view"]}><SalesPage /></Guard>} />
        <Route path="/returns" element={<Guard anyOf={["returns.create"]}><ReturnsPage /></Guard>} />
        <Route path="/reports" element={<Guard anyOf={["reports.inventory", "reports.sales"]}><ReportsPage /></Guard>} />
        <Route path="/assistant" element={<Guard anyOf={["ai.use"]}><AssistantPage /></Guard>} />
        <Route path="/backup" element={<Guard anyOf={["backup.create"]}><BackupPage /></Guard>} />
        <Route path="/users" element={<Guard anyOf={["users.manage"]}><UsersPage /></Guard>} />
        <Route path="/profile" element={<Guard anyOf={["settings.manage"]}><ProfilePage /></Guard>} />
        <Route path="/settings" element={<Guard anyOf={["settings.manage", "settings.exchange_rate"]}><SettingsPage /></Guard>} />
        <Route path="/account" element={<AccountPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
