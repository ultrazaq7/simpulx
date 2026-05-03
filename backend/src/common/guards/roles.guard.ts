// ============================================================
// Roles Guard & Decorator — with Role Hierarchy Support
// ============================================================
import { SetMetadata, Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../common/entities/user.entity';

// ── Role Hierarchy (higher number = more authority) ─────────
export const ROLE_HIERARCHY: Record<UserRole, number> = {
  [UserRole.OWNER]: 5,
  [UserRole.ADMIN]: 4,
  [UserRole.MANAGER]: 3,
  [UserRole.SUPERVISOR]: 2,
  [UserRole.AGENT]: 1,
};

export function getRoleLevel(role: UserRole): number {
  return ROLE_HIERARCHY[role] || 0;
}

export function isRoleAtLeast(userRole: UserRole, minRole: UserRole): boolean {
  return getRoleLevel(userRole) >= getRoleLevel(minRole);
}

// ── Exact-match decorator: user must have one of these roles ─
export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

// ── Hierarchy decorator: user must be at least this role level ─
export const MIN_ROLE_KEY = 'min_role';
export const MinRole = (role: UserRole) => SetMetadata(MIN_ROLE_KEY, role);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Check @MinRole() first (hierarchy-based)
    const minRole = this.reflector.getAllAndOverride<UserRole>(MIN_ROLE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const { user } = context.switchToHttp().getRequest();

    if (minRole) {
      return isRoleAtLeast(user.role, minRole);
    }

    // Then check @Roles() (exact-match)
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) return true;

    return requiredRoles.includes(user.role);
  }
}
