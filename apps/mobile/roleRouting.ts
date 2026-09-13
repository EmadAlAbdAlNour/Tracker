export type MobileRole = 'ADMIN' | 'DRIVER' | 'CALL_CENTER';

export function resolveHomeRoute(role: MobileRole): 'DriverHome' | 'OperatorHome' {
  return role === 'DRIVER' ? 'DriverHome' : 'OperatorHome';
}
