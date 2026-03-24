import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { I18nProvider } from "@/hooks/useI18n";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { AdminAuthProvider } from "@/hooks/useAdminAuth";
import { ThemeProvider } from "@/hooks/useTheme";
import AppLayout from "@/layouts/AppLayout";
import AdminLayout from "@/layouts/AdminLayout";
import ProtectedModule from "@/components/ProtectedModule";
import Dashboard from "@/pages/Dashboard";
import Financeiro from "@/pages/Financeiro";
import Caixa from "@/pages/Caixa";
import ContasBancarias from "@/pages/ContasBancarias";
import Clientes from "@/pages/Clientes";
import Categorias from "@/pages/Categorias";
import Contratos from "@/pages/Contratos";
import Configuracoes from "@/pages/Configuracoes";
import Auditoria from "@/pages/Auditoria";
import Relatorios from "@/pages/Relatorios";
import CobradoresList from "@/pages/Cobradores/CobradoresList";
import AreaCobrador from "@/pages/Cobradores/AreaCobrador";
import Login from "@/pages/Login";
import AdminLogin from "@/pages/AdminLogin";
import AdminDashboard from "@/pages/AdminDashboard";
import AdminUsers from "@/pages/AdminUsers";
import AdminSettings from "@/pages/AdminSettings";
import CompanyBlocked from "@/pages/CompanyBlocked";
import ResetPassword from "@/pages/ResetPassword";
import AssinarContrato from "@/pages/AssinarContrato";
import Perfil from "@/pages/Perfil";
import NotFound from "@/pages/NotFound";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient();

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
                <Routes>
                  <Route path="/reset-password" element={<ResetPassword />} />
                  <Route path="/assinar/:token" element={<AssinarContrato />} />
                  <Route path="/admin/login" element={<AdminLogin />} />
                  <Route path="/admin" element={<AdminLayout />}>
                    <Route path="dashboard" element={<AdminDashboard />} />
                    <Route path="users" element={<AdminUsers />} />
                    <Route path="settings" element={<AdminSettings />} />
                  </Route>
                  <Route path="/*" element={<AppRoutes />} />
                </Routes>
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
