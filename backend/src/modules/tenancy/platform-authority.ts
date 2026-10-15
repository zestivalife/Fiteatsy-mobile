export const PLATFORM_GLOBAL_ROLES = ['platform_owner', 'super_admin'] as const;

export type PlatformGlobalRole = typeof PLATFORM_GLOBAL_ROLES[number];

const IN_HOUSE_TENANT_TYPE = 'ZESTIVA_INTERNAL';

export const isPlatformGlobalRole = (role: string | null | undefined): role is PlatformGlobalRole =>
  PLATFORM_GLOBAL_ROLES.includes(String(role ?? '').trim().toLowerCase() as PlatformGlobalRole);

// Platform authority is deliberately separate from tenant context. Callers must
// authorize an explicit platform operation; this never manufactures membership.
export const assertPlatformOperationAuthority = (
  role: string | null | undefined,
  operationAllowed: boolean,
  tenantType?: string | null,
) => {
  const normalizedRole = String(role ?? '').trim().toLowerCase();
  const isInHouseSeniorConsultant =
    normalizedRole === 'senior_consultant'
    && String(tenantType ?? '').trim().toUpperCase() === IN_HOUSE_TENANT_TYPE;
  if ((!isPlatformGlobalRole(role) && !isInHouseSeniorConsultant) || !operationAllowed) {
    throw new Error('PLATFORM_AUTHORITY_REQUIRED');
  }
  return true;
};
