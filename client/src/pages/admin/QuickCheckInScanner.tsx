import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Camera, CheckCircle2, Clock, Loader2, QrCode, RefreshCw, XCircle } from 'lucide-react';
import { AttendanceLog, CheckInDenial, CheckInMember, CheckInResult, TrialPass } from '../../types/index.js';
import { ApiError, api, errorMessage } from '../../api/client.js';
import { Badge } from '../../components/common/Badge.js';
import { EmptyState, ErrorState, LoadingState } from '../../components/common/States.js';
import { AdminNav, Avatar, PageHeader, SectionCard, focusRing, inputClass, labelClass } from '../../components/admin/ui.js';
import { CameraScanner, canScanWithCamera } from '../../components/admin/CameraScanner.js';
import { statusVariant } from '../../components/admin/memberStatus.js';
import { useAuth } from '../../context/AuthContext.js';
import { useNavigation } from '../../context/NavigationContext.js';
import { STATUS_LABELS, TIER_LABELS, TIER_SHORT_LABELS, formatDate, formatDateTime, formatTime, gymToday } from '../../lib/format.js';

type Method = 'manual' | 'camera';

type Outcome =
  | { kind: 'granted'; result: CheckInResult; code: string }
  | { kind: 'denied'; reason: string; message: string; member?: CheckInMember; trial?: TrialPass; at: string; code: string }
  | { kind: 'error'; message: string; at: string; code: string };

const DENIAL_REASONS: Record<string, string> = {
  MEMBERSHIP_EXPIRED: 'Membership expired',
  MEMBERSHIP_FROZEN: 'Membership frozen',
  MEMBERSHIP_PENDING: 'No active plan',
  TRIAL_NOT_VALID_TODAY: 'Trial pass not valid today',
  TRIAL_ALREADY_USED: 'Trial pass already used',
  PASS_NOT_FOUND: 'Pass not recognised',
  GYM_CLOSED: 'Gym closed'
};

const FEED_LIMIT = 20;

const MemberSummary: React.FC<{ member: CheckInMember }> = ({ member }) => (
  <div className="flex items-start gap-3 min-w-0">
    <Avatar src={member.avatar_url} name={member.name} size="w-12 h-12" />
    <div className="min-w-0 space-y-1">
      <p className="text-lg font-black text-slate-100 font-['Outfit'] break-words">{member.name}</p>
      <p className="text-xs text-slate-400 break-all">{member.email}</p>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge size="sm" variant={statusVariant(member.membership_status)}>{STATUS_LABELS[member.membership_status]}</Badge>
        <span className="font-semibold text-slate-300">{TIER_LABELS[member.membership_tier]}</span>
        <span className="text-slate-400">Access until {formatDate(member.membership_expiry)}</span>
        {member.streak_days !== undefined && <span className="text-slate-400">Streak: {member.streak_days} {member.streak_days === 1 ? 'day' : 'days'}</span>}
      </div>
    </div>
  </div>
);

const TrialSummary: React.FC<{ trial: TrialPass }> = ({ trial }) => (
  <div className="space-y-1 min-w-0">
    <p className="text-lg font-black text-slate-100 font-['Outfit'] break-words">
      {trial.name} <Badge size="sm" variant="purple">Free trial</Badge>
    </p>
    <p className="text-xs text-slate-400 break-all">{trial.email} · {trial.phone}</p>
    <p className="text-xs text-slate-300">
      {trial.interest} · valid on {formatDate(trial.valid_on)} · <span className="font-mono">{trial.code}</span>
      {trial.redeemed_at && <> · used {formatDateTime(trial.redeemed_at)}</>}
    </p>
  </div>
);

const OutcomePanel: React.FC<{ outcome: Outcome | null }> = ({ outcome }) => {
  if (!outcome) {
    return (
      <div className="neu-pressed-sm rounded-2xl p-5 flex items-center gap-4 text-sm text-slate-400">
        <QrCode className="w-8 h-8 shrink-0" aria-hidden="true" />
        Ready. Scan a pass or type a pass code, member email or trial code.
      </div>
    );
  }

  if (outcome.kind === 'granted') {
    const { result } = outcome;
    return (
      <div className="rounded-2xl border-2 border-lime-500/60 bg-lime-500/10 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-lime-400 font-black uppercase tracking-wider text-sm">
            <CheckCircle2 className="w-6 h-6" aria-hidden="true" /> Access granted
          </p>
          <span className="text-xs text-slate-400">{formatTime(result.log.check_in_time)}</span>
        </div>
        {result.already_checked_in && (
          <p className="text-sm font-bold text-slate-200">Already checked in today, so no new visit was recorded. Let them through.</p>
        )}
        {result.member && <MemberSummary member={result.member} />}
        {result.trial && <TrialSummary trial={result.trial} />}
      </div>
    );
  }

  if (outcome.kind === 'denied') {
    return (
      <div className="rounded-2xl border-2 border-rose-500/60 bg-rose-500/10 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-rose-600 dark:text-rose-400 font-black uppercase tracking-wider text-sm">
            <XCircle className="w-6 h-6" aria-hidden="true" /> Access denied · {outcome.reason}
          </p>
          <span className="text-xs text-slate-400">{formatTime(outcome.at)}</span>
        </div>
        <p className="text-sm font-semibold text-slate-200">{outcome.message}</p>
        {outcome.member && <MemberSummary member={outcome.member} />}
        {outcome.trial && <TrialSummary trial={outcome.trial} />}
        {!outcome.member && !outcome.trial && <p className="text-xs text-slate-400 break-all">Code entered: <span className="font-mono">{outcome.code}</span></p>}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border-2 border-amber-500/60 bg-amber-500/10 p-5 space-y-2">
      <p className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-black uppercase tracking-wider text-sm">
        <XCircle className="w-6 h-6" aria-hidden="true" /> Check-in failed
      </p>
      <p className="text-sm font-semibold text-slate-200">{outcome.message}</p>
      <p className="text-xs text-slate-400">
        Nothing was recorded. Try again. Code entered: <span className="font-mono break-all">{outcome.code}</span>
      </p>
    </div>
  );
};

const LOG_METHODS: Record<string, string> = { qr: 'QR', manual: 'Desk', kiosk: 'Kiosk', camera: 'Camera' };

const LogRow: React.FC<{ log: AttendanceLog }> = ({ log }) => (
  <li className="px-4 py-3 flex items-center justify-between gap-3">
    <div className="min-w-0">
      <p className="text-sm font-bold text-slate-100 truncate">{log.user_name || 'Unknown'}</p>
      <p className="text-xs text-slate-400 truncate">{log.user_email}</p>
    </div>
    <div className="text-right shrink-0">
      <Badge size="sm" variant={log.trial_pass_id ? 'purple' : 'slate'}>
        {log.trial_pass_id ? 'Trial' : TIER_SHORT_LABELS[log.user_tier ?? ''] ?? log.user_tier ?? '—'}
      </Badge>
      <p className="text-[11px] text-slate-400 mt-1">
        {formatDateTime(log.check_in_time)} · {LOG_METHODS[log.check_in_method] ?? log.check_in_method}
      </p>
    </div>
  </li>
);

export const QuickCheckInScanner: React.FC = () => {
  const { user, triggerCelebration } = useAuth();
  const { navigate } = useNavigation();
  const isAdmin = user?.role === 'admin';

  const [code, setCode] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [sessionLog, setSessionLog] = useState<Outcome[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraAvailable = canScanWithCamera();

  const [feedView, setFeedView] = useState<'today' | 'latest'>('today');
  const [feed, setFeed] = useState<{ items: AttendanceLog[]; total: number } | null>(null);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedUpdatedAt, setFeedUpdatedAt] = useState<string | null>(null);

  const loadFeed = useCallback(async () => {
    if (!isAdmin) return;
    setFeedLoading(true);
    setFeedError(null);
    try {
      setFeed(await api.getAttendanceLogs(feedView === 'today' ? { date: gymToday(), limit: FEED_LIMIT } : { limit: FEED_LIMIT }));
      setFeedUpdatedAt(new Date().toISOString());
    } catch (err) {
      setFeedError(errorMessage(err));
    } finally {
      setFeedLoading(false);
    }
  }, [isAdmin, feedView]);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  const process = async (raw: string, method: Method) => {
    const value = raw.trim();
    if (!value || isProcessing) return;
    setIsProcessing(true);
    let next: Outcome;
    try {
      const result = await api.checkIn(value, method);
      next = { kind: 'granted', result, code: value };
      if (!result.already_checked_in) {
        triggerCelebration();
        loadFeed();
      }
    } catch (err) {
      const at = new Date().toISOString();
      if (err instanceof ApiError && err.code && DENIAL_REASONS[err.code]) {
        const data = (err.data ?? {}) as CheckInDenial;
        next = { kind: 'denied', reason: DENIAL_REASONS[err.code], message: err.message, member: data.member, trial: data.trial, at, code: value };
      } else {
        next = { kind: 'error', message: errorMessage(err), at, code: value };
      }
    } finally {
      setIsProcessing(false);
    }
    setOutcome(next);
    setSessionLog(log => [next, ...log].slice(0, 10));
    if (method === 'manual') {
      // Whatever the answer, the next scan starts in an empty box (a USB scanner types and presses
      // Enter, so a left-over code would be glued to the next one). The outcome panel still shows
      // what was entered. Anything typed while the check ran is kept.
      setCode(current => (current.startsWith(raw) ? current.slice(raw.length) : current));
      inputRef.current?.focus();
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-6">
      <PageHeader
        eyebrow="Front desk"
        title="Check-in"
        description="Scan a member's QR pass or type their pass code, email or free-trial code. Every granted check-in is recorded."
        actions={
          !isAdmin && (
            <button type="button" onClick={() => navigate('trainer-dashboard')} className={`px-4 py-2.5 neu-btn rounded-xl text-xs font-bold flex items-center gap-2 ${focusRing}`}>
              <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Coach dashboard
            </button>
          )
        }
      />
      {isAdmin && <AdminNav />}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <SectionCard id="scan-heading" className="lg:col-span-7" title="Scan a pass" icon={<QrCode className="w-4 h-4 text-lime-400" aria-hidden="true" />}>
          <div aria-live="polite" aria-atomic="true">
            <OutcomePanel outcome={outcome} />
          </div>

          {isCameraOpen ? (
            <CameraScanner
              onDetected={value => {
                setIsCameraOpen(false);
                process(value, 'camera');
              }}
              onClose={() => setIsCameraOpen(false)}
            />
          ) : (
            cameraAvailable && (
              <button
                type="button"
                onClick={() => setIsCameraOpen(true)}
                disabled={isProcessing}
                className={`w-full py-3 neu-btn rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60 ${focusRing}`}
              >
                <Camera className="w-4 h-4" aria-hidden="true" /> Scan with camera
              </button>
            )
          )}

          <form
            onSubmit={e => {
              e.preventDefault();
              process(code, 'manual');
            }}
            className="space-y-2"
          >
            <label htmlFor="checkin-code" className={labelClass}>
              Pass code, member email or trial code
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                id="checkin-code"
                ref={inputRef}
                type="text"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                autoFocus
                value={code}
                onChange={e => setCode(e.target.value)}
                placeholder="PULSE-… or name@example.com"
                className={`${inputClass} font-mono`}
              />
              <button
                type="submit"
                disabled={isProcessing || !code.trim()}
                className={`px-5 py-2.5 neu-btn-lime rounded-xl text-sm font-black flex items-center justify-center gap-2 shrink-0 disabled:opacity-60 ${focusRing}`}
              >
                {isProcessing && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                {isProcessing ? 'Checking…' : 'Check in'}
              </button>
            </div>
            {!cameraAvailable && <p className="text-xs text-slate-400">Camera scanning needs a browser that can read QR codes (Chrome or Edge on Android). A USB scanner that types the code works here too.</p>}
          </form>
        </SectionCard>

        {isAdmin ? (
          <SectionCard
            id="feed-heading"
            className="lg:col-span-5"
            title={feedView === 'today' ? "Today's check-ins" : 'Latest check-ins'}
            icon={<Clock className="w-4 h-4 text-lime-400" aria-hidden="true" />}
            description={
              feed
                ? `Showing ${feed.items.length} of ${feed.total}${feedUpdatedAt ? ` · updated ${formatTime(feedUpdatedAt)}` : ''}. Refreshes after each check-in made here.`
                : undefined
            }
            actions={
              <button type="button" onClick={loadFeed} disabled={feedLoading} className={`p-2 neu-btn rounded-lg disabled:opacity-60 ${focusRing}`} aria-label="Refresh check-ins">
                <RefreshCw className={`w-4 h-4 ${feedLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
              </button>
            }
          >
            <div role="group" aria-label="Which check-ins" className="flex gap-2">
              {(['today', 'latest'] as const).map(view => (
                <button
                  key={view}
                  type="button"
                  aria-pressed={feedView === view}
                  onClick={() => setFeedView(view)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold ${focusRing} ${feedView === view ? 'neu-pressed-sm text-lime-400' : 'neu-btn text-slate-300'}`}
                >
                  {view === 'today' ? 'Today' : 'All recent'}
                </button>
              ))}
            </div>
            {feedError ? (
              <ErrorState message={`Could not load check-ins. ${feedError}`} onRetry={loadFeed} />
            ) : !feed ? (
              <LoadingState label="Loading check-ins…" />
            ) : feed.items.length === 0 ? (
              <EmptyState title={feedView === 'today' ? 'No check-ins yet today' : 'No check-ins recorded'} />
            ) : (
              <ul className="neu-pressed-sm rounded-2xl divide-y divide-slate-800/60 max-h-[520px] overflow-y-auto">
                {feed.items.map(log => (
                  <LogRow key={log.id} log={log} />
                ))}
              </ul>
            )}
          </SectionCard>
        ) : (
          <SectionCard
            id="session-heading"
            className="lg:col-span-5"
            title="Scans on this screen"
            icon={<Clock className="w-4 h-4 text-lime-400" aria-hidden="true" />}
            description="Only the scans made here since you opened this page. The full check-in log is for admins."
          >
            {sessionLog.length === 0 ? (
              <EmptyState title="No scans yet" />
            ) : (
              <ul className="neu-pressed-sm rounded-2xl divide-y divide-slate-800/60">
                {sessionLog.map((o, i) => {
                  const name = o.kind === 'granted' ? o.result.member?.name ?? o.result.trial?.name : o.kind === 'denied' ? o.member?.name ?? o.trial?.name : undefined;
                  const at = o.kind === 'granted' ? o.result.log.check_in_time : o.at;
                  return (
                    <li key={`${at}-${i}`} className="px-4 py-3 flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate text-slate-100 font-semibold">{name ?? o.code}</span>
                      <span className={`shrink-0 text-xs font-bold ${o.kind === 'granted' ? 'text-lime-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {o.kind === 'granted' ? 'Granted' : o.kind === 'denied' ? o.reason : 'Failed'} · {formatTime(at)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionCard>
        )}
      </div>
    </div>
  );
};
