import React, { useState } from 'react';
import { ShieldCheck, QrCode, Sparkles, Copy, Check, Info, SunMedium } from 'lucide-react';
import { Modal } from '../common/Modal.js';
import { Badge } from '../common/Badge.js';
import { User } from '../../types/index.js';
import { useToast } from '../../context/ToastContext.js';

interface DigitalQrPassModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
}

export const DigitalQrPassModal: React.FC<DigitalQrPassModalProps> = ({
  isOpen,
  onClose,
  user
}) => {
  const [copied, setCopied] = useState(false);
  const { showToast } = useToast();

  if (!user) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(user.qr_code_token);
    setCopied(true);
    showToast('Pass token copied to clipboard!', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  const tierColors = {
    vip: 'from-amber-500/20 via-slate-900 to-amber-950/40 border-amber-500/40 text-amber-400',
    pro: 'from-lime-500/20 via-slate-900 to-lime-950/40 border-lime-500/40 text-lime-400',
    basic: 'from-sky-500/20 via-slate-900 to-sky-950/40 border-sky-500/40 text-sky-400',
    none: 'from-slate-700/20 via-slate-900 to-slate-950/40 border-slate-700/40 text-slate-400'
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="md">
      <div className="flex flex-col items-center text-center">
        {/* Pass Header Card */}
        <div
          className={`w-full p-6 rounded-3xl border neu-flat ${tierColors[user.membership_tier]} shadow-2xl relative overflow-hidden`}
        >
          {/* Subtle Background Badge Pattern */}
          <div className="absolute -right-8 -bottom-8 opacity-10 pointer-events-none">
            <QrCode className="w-48 h-48" />
          </div>

          <div className="flex items-center justify-between pb-4 border-b border-slate-700/50">
            <div className="flex items-center gap-2 text-left">
              <div className="w-8 h-8 rounded-xl bg-lime-500 flex items-center justify-center font-black text-black text-sm shadow-glow-lime">
                P
              </div>
              <div>
                <div className="font-extrabold tracking-wider text-xs uppercase text-slate-100 font-['Outfit']">
                  PULSEFIT ATHLETICS
                </div>
                <div className="text-[10px] text-slate-400 font-medium">DIGITAL ACCESS PASS</div>
              </div>
            </div>

            <Badge
              variant={user.membership_tier === 'vip' ? 'amber' : user.membership_tier === 'pro' ? 'lime' : 'cyan'}
              size="sm"
            >
              {user.membership_tier.toUpperCase()} MEMBER
            </Badge>
          </div>

          {/* Member Info */}
          <div className="flex items-center gap-4 my-6 text-left">
            <img
              src={user.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.name}`}
              alt={user.name}
              className="w-16 h-16 rounded-2xl border-2 border-slate-700 object-cover bg-slate-800 shrink-0 shadow-md"
            />
            <div>
              <h4 className="text-xl font-black text-slate-100 font-['Outfit']">{user.name}</h4>
              <p className="text-xs text-slate-400 font-medium">{user.email}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="inline-block w-2 h-2 rounded-full bg-lime-400 animate-pulse-dot" />
                <span className="text-[11px] font-bold text-lime-400 capitalize">
                  {user.membership_status} • Streak: {user.streak_days || 0}d
                </span>
              </div>
            </div>
          </div>

          {/* QR Code Container with High Contrast */}
          <div className="bg-white p-4 rounded-2xl shadow-inner inline-flex flex-col items-center justify-center mx-auto my-2 border border-slate-200">
            {/* SVG QR Code Simulation with accurate visual patterns */}
            <svg
              viewBox="0 0 100 100"
              className="w-48 h-48 text-black"
              fill="currentColor"
              shapeRendering="crispEdges"
            >
              {/* Corner 1 */}
              <rect x="5" y="5" width="28" height="28" fill="black" />
              <rect x="9" y="9" width="20" height="20" fill="white" />
              <rect x="13" y="13" width="12" height="12" fill="black" />

              {/* Corner 2 */}
              <rect x="67" y="5" width="28" height="28" fill="black" />
              <rect x="71" y="9" width="20" height="20" fill="white" />
              <rect x="75" y="13" width="12" height="12" fill="black" />

              {/* Corner 3 */}
              <rect x="5" y="67" width="28" height="28" fill="black" />
              <rect x="9" y="71" width="20" height="20" fill="white" />
              <rect x="13" y="75" width="12" height="12" fill="black" />

              {/* Data Pattern Matrix */}
              <rect x="38" y="8" width="5" height="5" />
              <rect x="48" y="8" width="10" height="5" />
              <rect x="38" y="18" width="5" height="15" />
              <rect x="48" y="23" width="10" height="5" />
              <rect x="58" y="13" width="5" height="10" />

              <rect x="8" y="38" width="15" height="5" />
              <rect x="8" y="48" width="5" height="10" />
              <rect x="18" y="53" width="15" height="5" />

              <rect x="38" y="38" width="8" height="8" />
              <rect x="50" y="38" width="8" height="8" />
              <rect x="62" y="38" width="8" height="8" />
              <rect x="74" y="38" width="8" height="8" />

              <rect x="38" y="50" width="8" height="8" />
              <rect x="50" y="50" width="8" height="8" />
              <rect x="62" y="50" width="8" height="8" />
              <rect x="74" y="50" width="8" height="8" />

              <rect x="38" y="68" width="10" height="5" />
              <rect x="52" y="68" width="5" height="10" />
              <rect x="68" y="68" width="10" height="10" />
              <rect x="82" y="68" width="5" height="5" />
              <rect x="82" y="78" width="10" height="10" />
              <rect x="68" y="82" width="10" height="5" />
              <rect x="38" y="82" width="20" height="8" />
            </svg>
            <span className="text-[10px] font-mono tracking-widest text-slate-800 font-bold mt-1">
              {user.qr_code_token}
            </span>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400 mt-4 pt-3 border-t border-slate-700/50 font-medium">
            <span>Valid Thru: <strong className="text-slate-200 font-mono">{user.membership_expiry}</strong></span>
            <span>Turnstile Pass ID: <strong className="text-slate-200 font-mono">#{user.id.slice(-6).toUpperCase()}</strong></span>
          </div>
        </div>

        {/* Copy / Actions Bar */}
        <div className="w-full mt-4 flex items-center justify-between gap-3 neu-pressed-sm p-3 rounded-2xl text-xs">
          <div className="text-left font-mono text-slate-200 font-bold truncate">
            {user.qr_code_token}
          </div>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3.5 py-1.5 neu-btn text-slate-200 rounded-xl transition-all shrink-0 font-bold text-xs"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-lime-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>

        {/* Tip for Kiosk Screen Brightness */}
        <div className="flex items-center gap-2 text-xs text-slate-400 mt-4 neu-pressed-sm p-3.5 rounded-2xl w-full text-left">
          <SunMedium className="w-4 h-4 text-lime-400 shrink-0" />
          <span className="font-medium">
            <strong className="text-slate-200">Tip:</strong> Hold your screen 4–6 inches from the optical turnstile scanner at front desk check-in.
          </span>
        </div>
      </div>
    </Modal>
  );
};
