import { useAuth } from "./auth-context";
import { useSettings, type RolePermission } from "./settings-context";

const ADMIN_PERM: RolePermission = { create: true, edit: true, delete: true, print: true };

export function usePermissions(): RolePermission {
  const { user } = useAuth();
  const { rolePermissions } = useSettings();

  const NO_ACCESS: RolePermission = { create: false, edit: false, delete: false, print: false };

  if (!user) return NO_ACCESS;
  if (user.role === "admin") return ADMIN_PERM;

  // m-12: runtime guard — kalau role di auth tak dikenal di settings, log warning
  // sekali dan kembalikan NO_ACCESS (bukan undefined yang akan crash komponen).
  const knownRoles = ["user", "owner", "investor", "broker", "admin"] as const;
  if (!knownRoles.includes(user.role as typeof knownRoles[number])) {
    console.warn(`[permissions] role tidak dikenal: "${user.role}"`);
    return NO_ACCESS;
  }

  const role = user.role as keyof typeof rolePermissions;
  return rolePermissions[role] ?? NO_ACCESS;
}
