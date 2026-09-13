export const SESSION_ROLES = ['ADMIN', 'DRIVER', 'CALL_CENTER'] as const;

export type Session = {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    role: (typeof SESSION_ROLES)[number];
    active: boolean;
  };
};

export function isAllowedRole(value: unknown): value is Session['user']['role'] {
  return typeof value === 'string' && SESSION_ROLES.includes(value as Session['user']['role']);
}

export function isValidSession(value: unknown): value is Session {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, any>;
  if (
    typeof candidate.accessToken !== 'string' ||
    candidate.accessToken.trim().length === 0 ||
    typeof candidate.refreshToken !== 'string' ||
    candidate.refreshToken.trim().length === 0
  ) {
    return false;
  }
  if (!candidate.user || typeof candidate.user !== 'object') {
    return false;
  }

  const user = candidate.user as Record<string, any>;
  return (
    typeof user.id === 'string' &&
    user.id.trim().length > 0 &&
    typeof user.name === 'string' &&
    user.name.trim().length > 0 &&
    typeof user.email === 'string' &&
    user.email.trim().length > 0 &&
    (user.phone === null || typeof user.phone === 'string') &&
    isAllowedRole(user.role) &&
    typeof user.active === 'boolean'
  );
}
