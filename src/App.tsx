import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { I18nProvider } from "@/hooks/useI18n";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { AdminAuthProvider } from "@/hooks/useAdminAuth";
import { ThemeProvider } from "@/hooks/useTheme";
import { lazy, Suspense } from "react";
import AppLayout from "@/layouts/AppLayout";
import AdminLayout from "@/layouts/AdminLayout";
import ProtectedModule from "@/components/ProtectedModule";

const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Financeiro = lazy(() => import("@/pages/Financeiro"));
const Caixa = lazy(() => import("@/pages/Caixa"));
const ContasBancarias = lazy(() => import("@/pages/ContasBancarias"));
const Clientes = lazy(() => import("@/pages/Clientes"));
const Categorias = lazy(() => import("@/pages/Categorias"));
const Contratos = lazy(() => import("@/pages/Contratos"));
const Configuracoes = lazy(() => import("@/pages/Configuracoes"));
const Auditoria = lazy(() => import("@/pages/Auditoria"));
const Relatorios = lazy(() => import("@/pages/Relatorios"));
const CobradoresList = lazy(() => import("@/pages/Cobradores/CobradoresList"));
const AreaCobrador = lazy(() => import("@/pages/Cobradores/AreaCobrador"));
const Login = lazy(() => import("@/pages/Login"));
const AdminLogin = lazy(() => import("@/pages/AdminLogin"));
const AdminDashboard = lazy(() => import("@/pages/AdminDashboard"));
const AdminUsers = lazy(() => import("@/pages/AdminUsers"));
const AdminSettings = lazy(() => import("@/pages/AdminSettings"));
const CompanyBlocked = lazy(() => import("@/pages/CompanyBlocked"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const AssinarContrato = lazy(() => import("@/pages/AssinarContrato"));
const Perfil = lazy(() => import("@/pages/Perfil"));
const NotFound = lazy(() => import("@/pages/NotFound"));
import { Loader2 } from "lucide-react";

import { queryClient } from "@/lib/queryClient";

function AppRoutes() {
  const { isAuthenticated, isLoading, suspendedCompany } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0a1628' }}>
        <Loader2 size={32} className="text-secondary animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  if (suspendedCompany) {
    return <CompanyBlocked />;
  }

  return (
    <AppLayout>
      <Suspense fallback={
        <div className="min-h-[50vh] flex items-center justify-center">
          <Loader2 size={32} className="text-secondary animate-spin" />
        </div>
      }>
        <Routes>
          <Route path="/" element={<ProtectedModule module="dashboard"><Dashboard /></ProtectedModule>} />
          <Route path="/financeiro" element={<ProtectedModule module="financeiro"><Financeiro /></ProtectedModule>} />
          <Route path="/caixa" element={<ProtectedModule module="caixa"><Caixa /></ProtectedModule>} />
          <Route path="/contas-bancarias" element={<ProtectedModule module="contasBancarias"><ContasBancarias /></ProtectedModule>} />
          <Route path="/clientes" element={<ProtectedModule module="clientes"><Clientes /></ProtectedModule>} />
          <Route path="/categorias" element={<ProtectedModule module="categorias"><Categorias /></ProtectedModule>} />
          <Route path="/contratos" element={<ProtectedModule module="contratos"><Contratos /></ProtectedModule>} />
          <Route path="/cobradores" element={<ProtectedModule module="cobradores"><CobradoresList /></ProtectedModule>} />
          <Route path="/area-cobrador" element={<ProtectedModule module="cobradores"><AreaCobrador /></ProtectedModule>} />
          <Route path="/configuracoes" element={<ProtectedModule module="configuracoes"><Configuracoes /></ProtectedModule>} />
          <Route path="/relatorios" element={<ProtectedModule module="relatorios"><Relatorios /></ProtectedModule>} />
          <Route path="/auditoria" element={<ProtectedModule module="auditoria"><Auditoria /></ProtectedModule>} />
          <Route path="/perfil" element={<Perfil />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </AppLayout>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <I18nProvider>
        <ThemeProvider>
          <AuthProvider>
            <AdminAuthProvider>
              <Sonner />
              <BrowserRouter>
                <Suspense fallback={
                  <div className="min-h-screen flex items-center justify-center bg-[#0a1628]">
                    <Loader2 size={32} className="text-secondary animate-spin" />
                  </div>
                }>
                  <Routes>
                    <Route path="/reset-password" element={<ResetPassword />} />
                    <Route path="/assinar/:token" element={<AssinarContrato />} />
                    <Route path="/admin/login" element={<AdminLogin />} />
                    <Route path="/admin" element={<AdminLayout />}>
                      <Route path="dashboard" element={<AdminDashboard />} />
                      <Route path="users" element={<AdminUsers />} />
                      <Route path="settings" element={<AdminSettings />} />
                    </Route>
                    <Route path="/register" element={<Login initialShowRegister={true} />} />
                    <Route path="/*" element={<AppRoutes />} />
                  </Routes>
                </Suspense>
              </BrowserRouter>
            </AdminAuthProvider>
          </AuthProvider>
        </ThemeProvider>
      </I18nProvider>
    </TooltipProvider>
    <Toaster />
  </QueryClientProvider>
);

export default App;
