import { useAuth } from "./auth-context";
import { useSettings, type RolePermission } from "./settings-context";

const ADMIN_PERM: RolePermission = { create: true, edit: true, delete: true, print: true };

export function usePermissions(): RolePermission {
  const { user } = useAuth();
  const { rolePermissions } = useSettings();

  if (!user) return { create: false, edit: false, delete: false, print: false };
  if (user.role === "admin") return ADMIN_PERM;

  const role = user.role as keyof typeof rolePermissions;
  return rolePermissions[role] ?? { create: false, edit: false, delete: false, print: false };
}
