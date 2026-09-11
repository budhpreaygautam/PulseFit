import React, { useState, useEffect } from 'react';
import {
  QrCode,
  Scan,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles
} from 'lucide-react';
import { AttendanceLog } from '../../types/index.js';
import { api } from '../../api/client.js';
import { Badge } from '../../components/common/Badge.js';
import { useToast } from '../../context/ToastContext.js';
import { useAuth } from '../../context/AuthContext.js';

interface CheckInUser {
  id?: string;
  name?: string;
  email?: string;
  tier?: string;
  membership_tier?: string;
  streak_days?: number;
  expiry?: string;
  membership_expiry?: string;
}

export const QuickCheckInScanner: React.FC = () => {
  const [tokenInput, setTokenInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [scanResult, setScanResult] = useState<{
    status: 'success' | 'denied' | 'idle';
    message: string;
    user?: CheckInUser;
    timestamp?: string;
  }>({ status: 'idle', message: 'Scanner ready. Scan member optical QR token or enter pass code.' });

  const [recentLogs, setRecentLogs] = useState<AttendanceLog[]>([]);
  const { showToast } = useToast();
  const { triggerCelebration } = useAuth();

  const fetchLogs = async () => {
    try {
      const logs = await api.getAttendanceLogs();
      setRecentLogs(logs);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const handleProcessCheckIn = async (codeToProcess: string) => {
    const code = codeToProcess.trim();
    if (!code) {
      showToast('Please enter a QR pass token or member ID', 'warning');
      return;
    }

    setIsProcessing(true);
    try {
      const res = await api.checkInMember(code, 'qr');
      setScanResult({
        status: 'success',
        message: res.message,
        user: res.data.user as CheckInUser,
        timestamp: new Date().toLocaleTimeString()
      });
      triggerCelebration();
      showToast(res.message, 'success', 'Access Granted');
      setTokenInput('');
      fetchLogs();
    } catch (err: any) {
      setScanResult({
        status: 'denied',
        message: err.message || 'Check-in denied',
        timestamp: new Date().toLocaleTimeString()
      });
      showToast(err.message || 'Check-in denied', 'error', 'Turnstile Blocked');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleProcessCheckIn(tokenInput);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-8 sm:space-y-10">
      {/* Header */}
      <div className="border-b border-slate-800/80 pb-6">
        <Badge variant="lime">FRONT-DESK TURNSTILE</Badge>
        <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight mt-2 font-['Outfit']">
          OPTICAL QR CHECK-IN SCANNER
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-xl">
          Simulate rapid member badge turnstile scans with instantaneous biometric validation, streak tracking, and attendance logging at Cyber Hub Gurugram.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Scanner & Test Panel (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Scanner Simulation Card */}
          <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-slate-800 space-y-6 relative overflow-hidden bg-gradient-to-b from-gym-900 to-gym-950">
            {/* Visual Scan Beam Line */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2 text-slate-200 font-bold text-sm">
                <Scan className="w-5 h-5 text-lime-400" />
                Optical Laser Turnstile Kiosk #1
              </div>
              <span className="flex items-center gap-1.5 text-xs text-lime-400 font-mono font-bold bg-lime-500/10 px-2.5 py-1 rounded-full border border-lime-500/30">
                <span className="w-2 h-2 rounded-full bg-lime-400 animate-pulse-dot" /> LIVE TURNSTILE
              </span>
            </div>

            {/* Scan Result Feedback Screen */}
            <div
              className={`p-5 sm:p-6 rounded-2xl border transition-all duration-300 ${
                scanResult.status === 'success'
                  ? 'bg-lime-500/10 border-lime-500/50 shadow-glow-lime'
                  : scanResult.status === 'denied'
                  ? 'bg-rose-500/10 border-rose-500/50 shadow-glow-crimson'
                  : 'bg-gym-950 border-slate-800'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className="mt-1">
                  {scanResult.status === 'success' && (
                    <div className="w-12 h-12 rounded-2xl bg-lime-500 text-black flex items-center justify-center font-black">
                      <CheckCircle2 className="w-7 h-7" />
                    </div>
                  )}
                  {scanResult.status === 'denied' && (
                    <div className="w-12 h-12 rounded-2xl bg-rose-500 text-white flex items-center justify-center font-black">
                      <XCircle className="w-7 h-7" />
                    </div>
                  )}
                  {scanResult.status === 'idle' && (
                    <div className="w-12 h-12 rounded-2xl bg-slate-800 text-slate-400 flex items-center justify-center">
                      <QrCode className="w-6 h-6" />
                    </div>
                  )}
                </div>

                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-black uppercase tracking-wider ${
                        scanResult.status === 'success'
                          ? 'text-lime-400'
                          : scanResult.status === 'denied'
                          ? 'text-rose-400'
                          : 'text-slate-400'
                      }`}
                    >
                      {scanResult.status === 'success'
                        ? 'ACCESS GRANTED • TURNSTILE UNLOCKED'
                        : scanResult.status === 'denied'
                        ? 'ACCESS DENIED • TURNSTILE LOCKED'
                        : 'READY FOR SCAN'}
                    </span>
                    {scanResult.timestamp && (
                      <span className="text-[10px] font-mono text-slate-500">{scanResult.timestamp}</span>
                    )}
                  </div>

                  <p className="text-sm font-bold text-white leading-relaxed">{scanResult.message}</p>

                  {scanResult.user && (
                    <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center gap-4 text-xs text-slate-300">
                      <span>Tier: <strong className="text-lime-400 uppercase">{scanResult.user.tier || scanResult.user.membership_tier}</strong></span>
                      <span>Streak: <strong className="text-amber-400">{scanResult.user.streak_days || 1}d</strong></span>
                      <span>Valid Thru: <strong className="text-slate-200">{scanResult.user.expiry || scanResult.user.membership_expiry}</strong></span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Input Form for Manual Scanner Simulation */}
            <form onSubmit={handleSubmit} className="space-y-3">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
                Scan Pass Barcode / Enter QR Token:
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <QrCode className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    value={tokenInput}
                    onChange={e => setTokenInput(e.target.value)}
                    placeholder="e.g. PULSE-MEM-AARAV-8821 or member email"
                    className="w-full pl-10 pr-4 py-2.5 bg-gym-950 border border-slate-700 rounded-xl text-xs font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:border-lime-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="px-5 py-2.5 bg-lime-500 hover:bg-lime-400 text-black font-extrabold text-xs rounded-xl shadow-glow-lime transition-all shrink-0 disabled:opacity-50"
                >
                  {isProcessing ? 'Verifying...' : 'Scan / Verify'}
                </button>
              </div>
            </form>

            {/* Quick Test Shortcuts */}
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" /> 1-Click Demo Test Scans:
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => handleProcessCheckIn('PULSE-MEM-AARAV-8821')}
                  className="p-2.5 bg-slate-900 border border-slate-800 hover:border-lime-500/50 hover:bg-lime-500/10 rounded-xl text-left transition-all truncate"
                >
                  <div className="text-xs font-bold text-white truncate">Aarav Sharma</div>
                  <div className="text-[10px] text-lime-400 truncate">Pro (Active)</div>
                </button>

                <button
                  type="button"
                  onClick={() => handleProcessCheckIn('PULSE-MEM-ANANYA-7734')}
                  className="p-2.5 bg-slate-900 border border-slate-800 hover:border-amber-500/50 hover:bg-amber-500/10 rounded-xl text-left transition-all truncate"
                >
                  <div className="text-xs font-bold text-white truncate">Ananya Gupta</div>
                  <div className="text-[10px] text-amber-400 truncate">VIP (Active)</div>
                </button>

                <button
                  type="button"
                  onClick={() => handleProcessCheckIn('PULSE-MEM-DEV-1100')}
                  className="p-2.5 bg-slate-900 border border-slate-800 hover:border-rose-500/50 hover:bg-rose-500/10 rounded-xl text-left transition-all truncate"
                >
                  <div className="text-xs font-bold text-white truncate">Devansh Patel</div>
                  <div className="text-[10px] text-rose-400 truncate">Expired Pass</div>
                </button>

                <button
                  type="button"
                  onClick={() => handleProcessCheckIn('FAKE-INVALID-TOKEN-999')}
                  className="p-2.5 bg-slate-900 border border-slate-800 hover:border-slate-600 rounded-xl text-left transition-all truncate"
                >
                  <div className="text-xs font-bold text-slate-300 truncate">Invalid Pass</div>
                  <div className="text-[10px] text-slate-500 truncate">Unrecognized</div>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Attendance Feed Stream (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-extrabold text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-lime-400" />
              Live Turnstile Stream ({recentLogs.length})
            </h3>
            <span className="text-[10px] font-mono text-slate-500">Auto-Refreshed</span>
          </div>

          <div className="glass-panel rounded-2xl border border-slate-800 divide-y divide-slate-800/80 overflow-hidden max-h-[520px] overflow-y-auto">
            {recentLogs.length > 0 ? (
              recentLogs.map(log => (
                <div key={log.id} className="p-3.5 sm:p-4 flex items-center justify-between gap-3 hover:bg-slate-800/20 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-lime-500/10 text-lime-400 flex items-center justify-center font-bold text-xs shrink-0">
                      ✓
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white">{log.user_name || 'Member'}</div>
                      <div className="text-[10px] text-slate-400">{log.user_email}</div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <Badge variant={log.user_tier === 'vip' ? 'amber' : 'lime'} size="sm">
                      {log.user_tier || 'PRO'}
                    </Badge>
                    <div className="text-[10px] font-mono text-slate-500 mt-1">
                      {new Date(log.check_in_time).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-slate-500 text-xs">
                No check-ins recorded yet today.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
