import { MembershipStatus } from '../../types/index.js';

export function statusVariant(status: MembershipStatus): 'lime' | 'cyan' | 'crimson' | 'amber' {
  if (status === 'active') return 'lime';
  if (status === 'frozen') return 'cyan';
  if (status === 'expired') return 'crimson';
  return 'amber';
}
