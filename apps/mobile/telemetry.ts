export function normalizeNetworkStatus(type?: string | null, isConnected?: boolean | null): string {
  if (!isConnected) return 'offline';

  switch (type) {
    case 'wifi':
      return 'wifi';
    case 'cellular':
      return 'cellular';
    case 'ethernet':
      return 'ethernet';
    case 'bluetooth':
      return 'bluetooth';
    case 'vpn':
      return 'vpn';
    case 'none':
      return 'none';
    default:
      return 'unknown';
  }
}
