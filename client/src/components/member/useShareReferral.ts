import { useCallback } from 'react';
import { useToast } from '../../context/ToastContext.js';
import { API_BASE } from '../../api/client.js';
import { GYM_NAME } from '../public/gymInfo.js';
import { isNativeApp, shareText } from '../../lib/native.js';

/** The site to send friends to: the app's own pages live at a local address, so it names the server. */
const siteAddress = () => (isNativeApp ? API_BASE.replace(/\/api$/, '') : window.location.origin);

/** Shares an invitation with the member's referral code (Rewards page), or copies it. */
export function useShareReferral(): (code: string) => Promise<void> {
  const { showToast } = useToast();
  return useCallback(
    async (code: string) => {
      const result = await shareText(`Join me at ${GYM_NAME}: use my code ${code} when you sign up. ${siteAddress()}`.trim());
      if (result === 'copied') showToast('The invitation was copied. Paste it into a message to a friend.', 'success', undefined, 'shared');
      else if (result === 'failed') showToast(`Sharing is not available here. Your code is ${code}.`, 'warning', undefined, 'failed');
    },
    [showToast]
  );
}
