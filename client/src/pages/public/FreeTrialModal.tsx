import React, { useState } from 'react';
import { Modal } from '../../components/common/Modal.js';
import { useAuth } from '../../context/AuthContext.js';
import { useToast } from '../../context/ToastContext.js';
import { Sparkles, CheckCircle2, Award } from 'lucide-react';

interface FreeTrialModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRegisterInstead: () => void;
}

export const FreeTrialModal: React.FC<FreeTrialModalProps> = ({
  isOpen,
  onClose,
  onRegisterInstead
}) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [claimedPass, setClaimedPass] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { triggerCelebration } = useAuth();
  const { showToast } = useToast();

  const handleClaim = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    setTimeout(() => {
      const code = `PULSE-VIP-${Math.floor(100000 + Math.random() * 900000)}`;
      setClaimedPass(code);
      setIsSubmitting(false);
      triggerCelebration();
      showToast('VIP Free Pass Generated! Show this code at the Cyber Hub reception.', 'success');
    }, 400);
  };

  const handleReset = () => {
    setClaimedPass(null);
    setName('');
    setEmail('');
    setPhone('');
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleReset}
      title={claimedPass ? '🎉 Your VIP Pass is Ready!' : 'Claim 1-Day VIP Trial Pass'}
      description={
        claimedPass
          ? 'Show this digital voucher code to the Cyber Hub front desk on your visit.'
          : 'Experience unlimited workout & strength floor access and high-energy Zumba cardio classes at PulseFit Gurugram.'
      }
      maxWidth="md"
    >
      {claimedPass ? (
        <div className="space-y-5 text-center">
          <div className="p-6 rounded-3xl neu-flat border border-amber-500/40 shadow-glow-amber">
            <div className="w-12 h-12 rounded-2xl bg-amber-500 text-black font-black flex items-center justify-center mx-auto mb-2.5 neu-btn">
              <Award className="w-7 h-7 text-black" />
            </div>
            <h4 className="text-base sm:text-lg font-black text-slate-100 uppercase tracking-wide font-['Outfit']">
              PulseFit 1-Day VIP All-Access
            </h4>
            <p className="text-xs text-amber-400 mt-1 font-semibold">Issued for: {name || 'VIP Guest'}</p>

            {/* Voucher Code Box */}
            <div className="mt-4 p-3.5 rounded-2xl neu-pressed font-mono text-xl sm:text-2xl font-black text-amber-400 tracking-widest border border-amber-500/30">
              {claimedPass}
            </div>

            <div className="mt-3.5 flex items-center justify-center gap-3 text-[11px] text-slate-400">
              <span>Expires in 14 Days</span>
              <span>•</span>
              <span>Valid at Cyber Hub, Gurugram</span>
            </div>
          </div>

          <div className="space-y-2 text-left text-xs text-slate-300 neu-pressed-sm p-4 rounded-2xl">
            <div className="flex items-center gap-2 text-lime-400 font-bold">
              <CheckCircle2 className="w-4 h-4" /> Pass Includes:
            </div>
            <ul className="list-disc list-inside space-y-1 text-slate-400 pl-1">
              <li>Full Gym Floor & Strength Training Free Weights</li>
              <li>High-Energy Zumba & Cardio Dance Sessions</li>
              <li>Locker Room & High-Pressure Showers</li>
              <li>Digital QR Pass & 1-Day Trial Turnstile Access</li>
            </ul>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleReset}
              className="flex-1 py-3 neu-btn text-slate-200 font-bold rounded-xl text-xs sm:text-sm"
            >
              Done
            </button>
            <button
              onClick={() => {
                handleReset();
                onRegisterInstead();
              }}
              className="flex-1 py-3 neu-btn-lime text-black font-extrabold rounded-xl text-xs sm:text-sm"
            >
              Create Account
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleClaim} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
              Full Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Aarav Sharma"
              className="w-full px-3.5 py-2.5 text-xs sm:text-sm text-slate-100 placeholder-slate-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
              Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="aarav@example.com"
              className="w-full px-3.5 py-2.5 text-xs sm:text-sm text-slate-100 placeholder-slate-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
              Phone Number
            </label>
            <input
              type="tel"
              required
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+91 98110 12345"
              className="w-full px-3.5 py-2.5 text-xs sm:text-sm text-slate-100 placeholder-slate-500"
            />
          </div>

          <div className="p-3.5 neu-pressed-sm rounded-xl text-[11px] text-slate-400 leading-relaxed border border-lime-500/20">
            <span className="font-bold text-lime-400">Zero payment required.</span> Free pass activates at Cyber Hub turnstile.
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3.5 neu-btn-lime text-black font-black rounded-2xl text-xs sm:text-sm flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4" />
            {isSubmitting ? 'Generating Pass...' : 'Get Instant VIP Free Pass'}
          </button>
        </form>
      )}
    </Modal>
  );
};
