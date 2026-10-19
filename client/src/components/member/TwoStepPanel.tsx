import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, Download, ShieldCheck, ShieldOff } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { useToast } from '../../context/ToastContext.js';
import { api, errorMessage, isApiError } from '../../api/client.js';
import { MfaSetup } from '../../types/index.js';
import { saveFile } from '../../lib/native.js';
import { copyText } from './clipboard.js';

// "Two-step sign-in" in My account: authenticator-app codes on top of the password (optional).

type Stage = 'idle' | 'confirm-password' | 'scan' | 'codes' | 'disable' | 'regenerate';

const inputClass = (invalid: boolean) =>
  `w-full px-4 py-2.5 rounded-xl text-sm text-slate-100 placeholder-slate-500 ${invalid ? 'outline outline-2 outline-rose-500/80' : ''}`;

const Field: React.FC<{
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  type?: 'password' | 'code';
  hint?: string;
}> = ({ id, label, value, onChange, error, type = 'code', hint }) => (
  <div>
    <label htmlFor={id} className="block text-xs font-bold text-slate-300 mb-1.5">
      {label}
    </label>
    <input
      id={id}
      type={type === 'password' ? 'password' : 'text'}
      autoComplete={type === 'password' ? 'current-password' : 'one-time-code'}
      inputMode={type === 'password' ? undefined : 'text'}
      maxLength={type === 'password' ? 1000 : 20}
      value={value}
      onChange={e => onChange(e.target.value)}
      aria-invalid={Boolean(error)}
      aria-describedby={[hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined}
      className={inputClass(Boolean(error))}
    />
    {hint && (
      <p id={`${id}-hint`} className="text-[11px] text-slate-500 mt-1">
        {hint}
      </p>
    )}
    {error && (
      <p id={`${id}-error`} className="text-xs text-rose-600 dark:text-rose-300 mt-1">
        {error}
      </p>
    )}
  </div>
);

export const TwoStepPanel: React.FC = () => {
  const { user, setSession, updateUser } = useAuth();
  const { showToast } = useToast();
  const [stage, setStage] = useState<Stage>('idle');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [setup, setSetup] = useState<MfaSetup | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [codesLeft, setCodesLeft] = useState<number | null>(null);
  const [errors, setErrors] = useState<{ password?: string; code?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const enabled = Boolean(user?.mfa_enabled);
  const needsPassword = user?.has_password !== false;

  useEffect(() => {
    if (!enabled) return;
    api
      .getMfaStatus()
      .then(s => setCodesLeft(s.recovery_codes_left))
      .catch(() => setCodesLeft(null));
  }, [enabled, stage]);

  useEffect(() => {
    if (!setup) return setQr(null);
    QRCode.toDataURL(setup.otpauth_url, { margin: 1, width: 220 })
      .then(setQr)
      .catch(() => setQr(null));
  }, [setup]);

  const reset = (next: Stage = 'idle') => {
    setStage(next);
    setPassword('');
    setCode('');
    setErrors({});
    setCopied(false);
    if (next === 'idle') setSetup(null);
  };

  const fail = (err: unknown) => {
    if (isApiError(err) && err.code === 'WRONG_PASSWORD') setErrors({ password: err.message });
    else if (isApiError(err) && err.code === 'INVALID_MFA_CODE') setErrors({ code: err.message });
    else if (isApiError(err) && err.code === 'VALIDATION_ERROR' && /password/i.test(err.message)) setErrors({ password: 'Enter your password.' });
    else setErrors({ form: errorMessage(err) });
  };

  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    setErrors({});
    try {
      await task();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const startSetup = () =>
    run(async () => {
      if (needsPassword && !password) return setErrors({ password: 'Enter your password.' });
      setSetup(await api.setupMfa(needsPassword ? password : undefined));
      setPassword('');
      setStage('scan');
    });

  const confirmSetup = () =>
    run(async () => {
      if (!code.trim()) return setErrors({ code: 'Enter the 6-digit code from your authenticator app.' });
      const { data, message } = await api.enableMfa(code.trim());
      setSession(data);
      setRecoveryCodes(data.recovery_codes);
      setCode('');
      setStage('codes');
      if (message) showToast(message, 'success');
    });

  const turnOff = () =>
    run(async () => {
      if (needsPassword && !password) return setErrors({ password: 'Enter your password.' });
      if (!code.trim()) return setErrors({ code: 'Enter a code from your authenticator app, or a backup code.' });
      const { data, message } = await api.disableMfa({ code: code.trim(), password: needsPassword ? password : undefined });
      updateUser(data);
      reset();
      showToast(message || 'Two-step sign-in is off.', 'success');
    });

  const newCodes = () =>
    run(async () => {
      if (!code.trim()) return setErrors({ code: 'Enter a code from your authenticator app.' });
      const { recovery_codes } = await api.regenerateRecoveryCodes(code.trim());
      setRecoveryCodes(recovery_codes);
      setCode('');
      setStage('codes');
    });

  const codesText = () => `PulseFit backup codes for ${user?.email}\nEach code works once.\n\n${recoveryCodes.join('\n')}\n`;

  const formError = errors.form && (
    <p role="alert" className="text-sm text-rose-600 dark:text-rose-300">
      {errors.form}
    </p>
  );

  return (
    <section aria-labelledby="mfa-heading" className="max-w-2xl neu-flat p-5 sm:p-8 rounded-3xl space-y-5">
      <div className="flex items-start gap-3">
        <span className={`w-10 h-10 rounded-2xl glass-tint flex items-center justify-center shrink-0 ${enabled ? 'bg-lime-500/15 text-lime-400' : 'bg-slate-500/15 text-slate-400'}`}>
          {enabled ? <ShieldCheck className="w-5 h-5" aria-hidden="true" /> : <ShieldOff className="w-5 h-5" aria-hidden="true" />}
        </span>
        <div>
          <h2 id="mfa-heading" className="text-lg font-black text-slate-100 font-heading">
            Two-step sign-in {enabled ? <span className="text-lime-400">is on</span> : <span className="text-slate-400">is off</span>}
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {enabled
              ? `Signing in asks for a code from your authenticator app.${codesLeft !== null ? ` ${codesLeft} backup ${codesLeft === 1 ? 'code' : 'codes'} left.` : ''}`
              : 'Add a code from an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…) to every sign-in, so a stolen password is not enough.'}
          </p>
        </div>
      </div>

      {stage === 'idle' && !enabled && (
        <button type="button" onClick={() => reset('confirm-password')} className="neu-btn-lime px-6 py-3 rounded-xl text-xs font-extrabold">
          Turn on two-step sign-in
        </button>
      )}

      {stage === 'idle' && enabled && (
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => reset('regenerate')} className="neu-btn px-5 py-2.5 rounded-xl text-xs font-bold">
            New backup codes
          </button>
          <button type="button" onClick={() => reset('disable')} className="neu-btn-danger px-5 py-2.5 rounded-xl text-xs font-bold">
            Turn off
          </button>
        </div>
      )}

      {stage === 'confirm-password' && (
        <form
          noValidate
          onSubmit={e => {
            e.preventDefault();
            void startSetup();
          }}
          className="space-y-4"
        >
          {needsPassword ? (
            <Field id="mfa-password" label="Your password" type="password" value={password} onChange={setPassword} error={errors.password} hint="To keep someone using your unlocked phone from changing this." />
          ) : (
            <p className="text-xs text-slate-400">You sign in with Google, so no password is needed if you signed in within the last 15 minutes.</p>
          )}
          {formError}
          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={busy} className="neu-btn-lime px-6 py-3 rounded-xl text-xs font-extrabold disabled:opacity-50">
              {busy ? 'Preparing…' : 'Continue'}
            </button>
            <button type="button" onClick={() => reset()} className="neu-btn px-5 py-3 rounded-xl text-xs font-bold">
              Cancel
            </button>
          </div>
        </form>
      )}

      {stage === 'scan' && setup && (
        <form
          noValidate
          onSubmit={e => {
            e.preventDefault();
            void confirmSetup();
          }}
          className="space-y-4"
        >
          <ol className="text-sm text-slate-300 space-y-1.5 list-decimal pl-5">
            <li>Open your authenticator app and add an account by scanning this QR code.</li>
            <li>Then type the 6-digit code it shows for PulseFit.</li>
          </ol>
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            <div className="bg-white p-2 rounded-2xl shrink-0">{qr ? <img src={qr} alt="QR code for your authenticator app" width={180} height={180} /> : <div className="w-[180px] h-[180px]" />}</div>
            <div className="text-xs text-slate-400 space-y-1 min-w-0">
              <p>Can't scan? Enter this key in the app instead:</p>
              <p className="font-mono text-sm text-slate-100 break-all select-all">{setup.secret.match(/.{1,4}/g)?.join(' ')}</p>
            </div>
          </div>
          <Field id="mfa-enable-code" label="6-digit code" value={code} onChange={setCode} error={errors.code} />
          {formError}
          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={busy} className="neu-btn-lime px-6 py-3 rounded-xl text-xs font-extrabold disabled:opacity-50">
              {busy ? 'Checking…' : 'Turn on'}
            </button>
            <button type="button" onClick={() => reset()} className="neu-btn px-5 py-3 rounded-xl text-xs font-bold">
              Cancel
            </button>
          </div>
        </form>
      )}

      {stage === 'codes' && (
        <div className="space-y-4">
          <div role="status" className="glass-tint p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 font-semibold">
            Save these backup codes now: they are shown only once. Each one signs you in once if you lose your phone.
          </div>
          <ul className="grid grid-cols-2 gap-2 font-mono text-sm text-slate-100" aria-label="Backup codes">
            {recoveryCodes.map(c => (
              <li key={c} className="neu-pressed-sm px-3 py-2 rounded-xl text-center select-all">
                {c}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={async () => {
                if (await copyText(recoveryCodes.join('\n'))) setCopied(true);
                else showToast('Copying was blocked. Select the codes and copy them by hand.', 'error');
              }}
              className="neu-btn px-5 py-2.5 rounded-xl text-xs font-bold inline-flex items-center gap-2"
            >
              {copied ? <Check className="w-4 h-4" aria-hidden="true" /> : <Copy className="w-4 h-4" aria-hidden="true" />} {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              type="button"
              onClick={() => saveFile(new Blob([codesText()], { type: 'text/plain' }), 'pulsefit-backup-codes.txt').catch(err => showToast(errorMessage(err), 'error'))}
              className="neu-btn px-5 py-2.5 rounded-xl text-xs font-bold inline-flex items-center gap-2"
            >
              <Download className="w-4 h-4" aria-hidden="true" /> Download
            </button>
            <button
              type="button"
              onClick={() => {
                setRecoveryCodes([]);
                reset();
              }}
              className="neu-btn-lime px-6 py-2.5 rounded-xl text-xs font-extrabold"
            >
              I saved them
            </button>
          </div>
        </div>
      )}

      {(stage === 'disable' || stage === 'regenerate') && (
        <form
          noValidate
          onSubmit={e => {
            e.preventDefault();
            void (stage === 'disable' ? turnOff() : newCodes());
          }}
          className="space-y-4"
        >
          {stage === 'disable' && needsPassword && <Field id="mfa-off-password" label="Your password" type="password" value={password} onChange={setPassword} error={errors.password} />}
          <Field
            id="mfa-action-code"
            label={stage === 'disable' ? 'Code from your authenticator app, or a backup code' : 'Code from your authenticator app'}
            value={code}
            onChange={setCode}
            error={errors.code}
            hint={stage === 'regenerate' ? 'Your old backup codes stop working.' : undefined}
          />
          {formError}
          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={busy}
              className={`${stage === 'disable' ? 'neu-btn-danger' : 'neu-btn-lime'} px-6 py-3 rounded-xl text-xs font-extrabold disabled:opacity-50`}
            >
              {busy ? 'Checking…' : stage === 'disable' ? 'Turn off two-step sign-in' : 'Create new backup codes'}
            </button>
            <button type="button" onClick={() => reset()} className="neu-btn px-5 py-3 rounded-xl text-xs font-bold">
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
};
