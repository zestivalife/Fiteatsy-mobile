const CONSULTANT_DIET_WORKFLOW_ROLE_VALUES = [
  'consultant',
  'provider',
  'dietician',
  'senior_consultant',
] as const;

export const CONSULTANT_DIET_WORKFLOW_ROLES: ReadonlySet<string> = new Set(CONSULTANT_DIET_WORKFLOW_ROLE_VALUES);

export const normalizeApplicationRole = (role: string | null | undefined) =>
  String(role ?? '').trim().toLowerCase();

export const isConsultantDietWorkflowRole = (role: string | null | undefined) =>
  CONSULTANT_DIET_WORKFLOW_ROLES.has(normalizeApplicationRole(role));
