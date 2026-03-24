import { Navigate } from 'react-router-dom';
import { usePermissions } from '@/hooks/usePermissions';
import { AppModule } from '@/types';

interface ProtectedModuleProps {
  module: AppModule;
  children: React.ReactNode;
}

/**
 * Wraps a route's page component to enforce module-level view permission.
 * Redirects to the dashboard if the user cannot view the module.
 */
export default function ProtectedModule({ module, children }: ProtectedModuleProps) {
  const { canView, isOwner } = usePermissions();

  if (isOwner || canView(module)) {
    return <>{children}</>;
  }

  if (!canView('dashboard')) {
    if (canView('cobradores')) return <Navigate to="/area-cobrador" replace />;
    if (canView('clientes')) return <Navigate to="/clientes" replace />;
  }

  return <Navigate to="/" replace />;
}
