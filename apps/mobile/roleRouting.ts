export type MobileRole = 'ADMIN' | 'DRIVER' | 'CALL_CENTER';

export function resolveHomeRoute(role: MobileRole): 'DriverHome' | 'AdminHome' | 'CallCenterHome' {
  switch (role) {
    case 'DRIVER':
      return 'DriverHome';
    case 'ADMIN':
      return 'AdminHome';
    case 'CALL_CENTER':
      return 'CallCenterHome';
    default:
      return 'DriverHome';
  }
}

