/**
 * Roles are intentionally declared in one tiny module with no dependencies so
 * that both the configuration layer and the domain layer can import them
 * without creating a cycle.
 *
 * To add a role (for example a "reviewer" tier that sits below the full
 * committee), add it here and then grant it capabilities in
 * `src/config/permissions.config.ts`. Nothing else in the app hardcodes a role
 * list.
 */
export const ROLES = ['applicant', 'committee', 'admin'] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  applicant: 'Applicant',
  committee: 'Grant Committee',
  admin: 'Administrator',
};

/**
 * The landing area each role is routed to after authentication. Expo Router
 * group names, resolved in `app/index.tsx`.
 */
export const ROLE_HOME_ROUTE: Record<Role, string> = {
  applicant: '/(applicant)/dashboard',
  committee: '/(committee)/dashboard',
  admin: '/(admin)/dashboard',
};

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}
