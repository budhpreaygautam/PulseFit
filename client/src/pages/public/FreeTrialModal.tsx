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
          : 'Experience unlimited gym floor access, group fitness classes, and recovery hydrotherapy suites at PulseFit Gurugram.'
      }
      maxWidth="md"
    >
      {claimedPass ? (
        <div className="space-y-5 text-center">
          <div className="p-5 sm:p-6 rounded-2xl bg-gradient-to-b from-amber-500/20 via-slate-900 to-amber-950/40 border border-amber-500/50 shadow-glow-amber">
            <div className="w-12 h-12 rounded-2xl bg-amber-500 text-black font-black flex items-center justify-center mx-auto mb-2.5">
              <Award className="w-7 h-7" />
            </div>
            <h4 className="text-base sm:text-lg font-black text-slate-100 uppercase tracking-wide">
              PulseFit 1-Day VIP All-Access
            </h4>
            <p className="text-xs text-amber-300 mt-1">Issued for: {name || 'VIP Guest'}</p>

            {/* Voucher Code Box */}
            <div className="mt-4 p-3.5 rounded-xl bg-black/60 border border-amber-500/40 inline-block font-mono text-xl sm:text-2xl font-black text-amber-400 tracking-widest">
              {claimedPass}
            </div>

            <div className="mt-3.5 flex items-center justify-center gap-3 text-[11px] text-slate-400">
              <span>Expires in 14 Days</span>
              <span>•</span>
              <span>Valid at Cyber Hub, Gurugram</span>
            </div>
          </div>

          <div className="space-y-2 text-left text-xs text-slate-300 bg-gym-950 p-3.5 sm:p-4 rounded-xl border border-slate-800">
            <div className="flex items-center gap-2 text-lime-400 font-bold">
              <CheckCircle2 className="w-4 h-4" /> Pass Includes:
            </div>
            <ul className="list-disc list-inside space-y-1 text-slate-400 pl-1">
              <li>24/7 Unlimited Gym Floor & Olympic Platforms</li>
              <li>All Coach-Led HIIT, Boxing, Power Yoga & CrossFit Sessions</li>
              <li>Infrared Sauna & Contrast Cold Plunge Suites</li>
              <li>Complimentary InBody Biometric Body Composition Scan</li>
            </ul>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleReset}
              className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl transition-colors text-xs sm:text-sm"
            >
              Done
            </button>
            <button
              onClick={() => {
                handleReset();
                onRegisterInstead();
              }}
              className="flex-1 py-3 bg-gradient-to-r from-lime-500 to-lime-400 hover:from-lime-400 text-black font-extrabold rounded-xl shadow-glow-lime transition-all text-xs sm:text-sm"
            >
              Create Account
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleClaim} className="space-y-3.5">
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
              className="w-full px-3.5 py-2.5 bg-gym-950 border border-slate-800 rounded-xl text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-lime-500 focus:ring-1 focus:ring-lime-500"
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
              className="w-full px-3.5 py-2.5 bg-gym-950 border border-slate-800 rounded-xl text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-lime-500 focus:ring-1 focus:ring-lime-500"
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
              className="w-full px-3.5 py-2.5 bg-gym-950 border border-slate-800 rounded-xl text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-lime-500 focus:ring-1 focus:ring-lime-500"
            />
          </div>

          <div className="p-3 bg-lime-500/5 border border-lime-500/20 rounded-xl text-[11px] text-slate-400 leading-relaxed">
            <span className="font-semibold text-lime-400">Zero payment required.</span> Free pass activates at Cyber Hub turnstile.
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3.5 bg-gradient-to-r from-lime-500 to-lime-400 hover:from-lime-400 hover:to-lime-300 text-black font-extrabold rounded-xl shadow-glow-lime transition-all active:scale-[0.98] disabled:opacity-50 text-xs sm:text-sm flex items-center justify-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            {isSubmitting ? 'Generating Pass...' : 'Get Instant VIP Free Pass'}
          </button>
        </form>
      )}
    </Modal>
  );
};
