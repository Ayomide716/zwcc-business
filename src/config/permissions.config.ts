/**
 * Role capabilities.
 *
 * Authorisation is enforced in two places, deliberately:
 *   1. Here, so the UI never offers an action the user cannot take.
 *   2. In PostgreSQL Row Level Security, which is what actually protects the
 *      data. A tampered client gets a database error, not access.
 *
 * To change what a role may do, edit `ROLE_CAPABILITIES` and the matching RLS
 * policy in `supabase/migrations/0002_policies.sql`.
 */
import type { Role } from '@/types/roles';

export const CAPABILITIES = [
  // Applicant surface
  'application:create',
  'application:read:own',
  'application:edit:own',
  'application:submit:own',
  'application:withdraw:own',
  'document:upload:own',
  'document:read:own',
  'document:delete:own',
  'agreement:read:own',
  'agreement:sign:own',
  'report:submit:own',
  'report:read:own',

  // Committee surface
  'application:read:all',
  'application:verify',
  'application:review',
  'application:decide',
  'application:note',
  'document:verify',
  'document:read:all',
  'agreement:issue',
  'agreement:read:all',
  'disbursement:authorise',
  'monitoring:manage',
  'report:read:all',
  'report:review',
  'outcome:evaluate',

  // Administration
  'user:read',
  'user:manage',
  'role:assign',
  'program:manage',
  'documenttype:manage',
  'workflow:manage',
  'notification:broadcast',
  'audit:read',
  'settings:manage',
] as const;

export type Capability = (typeof CAPABILITIES)[number];

const APPLICANT_CAPABILITIES: Capability[] = [
  'application:create',
  'application:read:own',
  'application:edit:own',
  'application:submit:own',
  'application:withdraw:own',
  'document:upload:own',
  'document:read:own',
  'document:delete:own',
  'agreement:read:own',
  'agreement:sign:own',
  'report:submit:own',
  'report:read:own',
];

const COMMITTEE_CAPABILITIES: Capability[] = [
  'application:read:all',
  'application:verify',
  'application:review',
  'application:decide',
  'application:note',
  'document:verify',
  'document:read:all',
  'agreement:issue',
  'agreement:read:all',
  'disbursement:authorise',
  'monitoring:manage',
  'report:read:all',
  'report:review',
  'outcome:evaluate',
];

/** Administrators inherit everything the committee can do, plus management. */
const ADMIN_CAPABILITIES: Capability[] = [
  ...COMMITTEE_CAPABILITIES,
  'user:read',
  'user:manage',
  'role:assign',
  'program:manage',
  'documenttype:manage',
  'workflow:manage',
  'notification:broadcast',
  'audit:read',
  'settings:manage',
];

export const ROLE_CAPABILITIES: Record<Role, Capability[]> = {
  applicant: APPLICANT_CAPABILITIES,
  committee: COMMITTEE_CAPABILITIES,
  admin: ADMIN_CAPABILITIES,
};

export function can(role: Role | null | undefined, capability: Capability): boolean {
  if (!role) return false;
  return ROLE_CAPABILITIES[role]?.includes(capability) ?? false;
}

export function canAny(role: Role | null | undefined, capabilities: Capability[]): boolean {
  return capabilities.some((capability) => can(role, capability));
}

/** Roles that see the staff-side surface (committee dashboards, queues). */
export const STAFF_ROLES: Role[] = ['committee', 'admin'];

export function isStaff(role: Role | null | undefined): boolean {
  return !!role && STAFF_ROLES.includes(role);
}
