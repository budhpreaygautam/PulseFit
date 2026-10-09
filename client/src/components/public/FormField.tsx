import React from 'react';

interface FormFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  error?: string | null;
  hint?: string;
  optional?: boolean;
  labelAside?: React.ReactNode;
}

/** A labelled input whose hint and error are announced with it. */
export const FormField: React.FC<FormFieldProps> = ({ id, label, icon: Icon, error, hint, optional, labelAside, className = '', ...input }) => {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1">
        <label htmlFor={id} className="block text-xs font-bold uppercase tracking-wider text-slate-300">
          {label}
          {optional && <span className="ml-1 normal-case tracking-normal font-medium text-slate-500">(optional)</span>}
        </label>
        {labelAside}
      </div>
      <div className="relative">
        {Icon && <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 z-10 pointer-events-none" />}
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`w-full ${Icon ? 'pl-10' : 'pl-3.5'} pr-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 rounded-xl ${error ? '!border-rose-500/70' : ''} ${className}`}
          {...input}
        />
      </div>
      {hint && (
        <p id={hintId} className="mt-1 text-[11px] text-slate-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="mt-1 text-xs font-semibold text-rose-400">
          {error}
        </p>
      )}
    </div>
  );
};

/** `data.issues` of a VALIDATION_ERROR, keyed by field name. */
export function issuesByField(data: unknown): Record<string, string> {
  const issues = (data as { issues?: { path?: string | (string | number)[]; message?: string }[] } | undefined)?.issues;
  const result: Record<string, string> = {};
  for (const issue of issues ?? []) {
    const path = Array.isArray(issue.path) ? String(issue.path[0] ?? '') : String(issue.path ?? '').split('.')[0];
    if (path && issue.message && !result[path]) result[path] = issue.message;
  }
  return result;
}
