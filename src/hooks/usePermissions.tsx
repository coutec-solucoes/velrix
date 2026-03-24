import { useAuth } from '@/hooks/useAuth';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { AppModule, ModulePermission, getDefaultPermissions, User } from '@/types';

/**
 * Hook to check permissions for the current logged-in user.
 * 
 * For collaborators: uses permissions stored directly on the auth profile
 * (populated during login from the users table).
 * 
 * For owners/direct auth: always has full access.
 * 
 * Fallback: matches auth user email against the company's users table.
 */
export function usePermissions() {
  const { user: authUser } = useAuth();
  const [users] = useRealtimeData('users');

  // Owner always has full access
  const isOwner = authUser?.role === 'proprietario';

  // Check if this is a collaborator with permissions stored on profile
  const profilePermissions = authUser?.permissions;

  // Find matching company user by email (fallback for non-collaborator flows)
  const companyUser = users.find(
    (u: User) => u.email === authUser?.email
  ) as User | undefined;

  const getPermission = (module: AppModule): ModulePermission => {
    if (isOwner) return { view: true, edit: true, delete: true };

    // 1. Use permissions from profile (set during collaborator login)
    if (profilePermissions?.[module]) {
      return profilePermissions[module];
    }

    // 2. Use permissions from users table match
    if (companyUser?.permissions?.[module]) {
      return companyUser.permissions[module];
    }

    // 3. Fallback to role-based defaults
    const role = companyUser?.role || authUser?.role || 'visualizador';
    const defaults = getDefaultPermissions(role);
    return defaults[module];
  };

  const canView = (module: AppModule) => getPermission(module).view;
  const canEdit = (module: AppModule) => getPermission(module).edit;
  const canDelete = (module: AppModule) => getPermission(module).delete;

  return { canView, canEdit, canDelete, getPermission, isOwner, companyUser };
}
