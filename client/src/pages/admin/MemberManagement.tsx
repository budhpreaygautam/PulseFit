import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Edit2, Eye, KeyRound, Plus, ShieldOff, Trash2 } from 'lucide-react';
import { User, UserRole } from '../../types/index.js';
import { ApiError, api, downloadFile, errorMessage } from '../../api/client.js';
import { Badge } from '../../components/common/Badge.js';
import { ConfirmDialog } from '../../components/common/ConfirmDialog.js';
import { EmptyState, ErrorState, LoadingState } from '../../components/common/States.js';
import { AdminNav, Avatar, PageHeader, SearchForm, focusRing, sideEffectTone } from '../../components/admin/ui.js';
import { CreateMemberModal, EditMemberModal } from '../../components/admin/MemberForms.js';
import { MemberDetailModal } from '../../components/admin/MemberDetailModal.js';
import { TempPasswordModal } from '../../components/admin/TempPasswordModal.js';
import { statusVariant } from '../../components/admin/memberStatus.js';
import { useAuth } from '../../context/AuthContext.js';
import { useNavigation } from '../../context/NavigationContext.js';
import { useToast } from '../../context/ToastContext.js';
import { STATUS_LABELS, TIER_LABELS, TIER_SHORT_LABELS, formatDate, gymToday } from '../../lib/format.js';

type RoleFilter = UserRole | 'all';
const STATUS_FILTERS = ['all', 'active', 'frozen', 'expired', 'pending'];
const TIER_FILTERS = ['all', 'none', 'basic', 'pro', 'vip'];
const ROLE_FILTERS: { value: RoleFilter; label: string }[] = [
  { value: 'member', label: 'Members' },
  { value: 'trainer', label: 'Coaches' },
  { value: 'admin', label: 'Admins' },
  { value: 'all', label: 'Everyone' }
];

type Credentials = React.ComponentProps<typeof TempPasswordModal>['credentials'];

const selectClass = 'px-3 py-2 rounded-xl text-xs font-semibold text-slate-100';

export const MemberManagement: React.FC = () => {
  const { params, navigate } = useNavigation();
  const { user } = useAuth();
  const { showToast } = useToast();

  // The status filter lives in the URL (?status=frozen, as the dashboard links), so it follows
  // links, Back and reloads; the page is not remounted when only the query string changes.
  const urlStatus = params.get('status');
  const status = urlStatus && STATUS_FILTERS.includes(urlStatus) ? urlStatus : 'all';
  const setStatus = (next: string) => {
    const query = Object.fromEntries(params);
    if (next === 'all') delete query.status;
    else query.status = next;
    // navigate() scrolls to the top as for a new page; a filter change should leave the view alone.
    const scrollY = window.scrollY;
    navigate('admin-members', query, { replace: true });
    window.scrollTo({ top: scrollY });
  };
  const [filters, setFilters] = useState({
    search: '',
    tier: 'all',
    role: 'member' as RoleFilter
  });
  const [members, setMembers] = useState<User[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<User | null>(null);
  const [resetting, setResetting] = useState<User | null>(null);
  const [mfaResetting, setMfaResetting] = useState<User | null>(null);
  const [credentials, setCredentials] = useState<Credentials>(null);
  // Opened only once the confirm dialog has closed: two modals swapping across renders would
  // restore each other's scroll lock and focus in the wrong order.
  const pendingCredentials = useRef<Credentials>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setMembers(await api.getMembers({ search: filters.search || undefined, tier: filters.tier, status, role: filters.role }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [filters, status]);

  useEffect(() => {
    load();
  }, [load]);

  const exportCsv = async () => {
    setIsExporting(true);
    try {
      await downloadFile(api.attendanceCsvUrl(), `attendance-all-${gymToday()}.csv`);
    } catch (err) {
      showToast(errorMessage(err), 'error', 'Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await api.deleteMember(deleting.id);
      showToast(`${deleting.name} was removed.`, 'success');
    } catch (err) {
      const title = err instanceof ApiError && (err.code === 'CANNOT_DELETE_SELF' || err.code === 'LAST_ADMIN') ? 'Not allowed' : 'Could not remove';
      showToast(errorMessage(err), 'error', title);
    }
    load();
  };

  const confirmReset = async () => {
    if (!resetting) return;
    try {
      const { tempPassword } = await api.resetMemberPassword(resetting.id);
      pendingCredentials.current = { name: resetting.name, email: resetting.email, password: tempPassword, reason: 'reset' };
    } catch (err) {
      showToast(errorMessage(err), 'error', 'Could not reset the password');
    }
  };

  const confirmMfaReset = async () => {
    if (!mfaResetting) return;
    try {
      const { message } = await api.adminResetMfa(mfaResetting.id);
      showToast(message || `Two-step sign-in is off for ${mfaResetting.name}.`, 'success');
    } catch (err) {
      showToast(errorMessage(err), 'error', 'Could not turn off two-step sign-in');
    }
    load();
  };

  const filterLabel = ROLE_FILTERS.find(r => r.value === filters.role)!.label.toLowerCase();

  const rowActions = (m: User) => (
    <div className="flex items-center gap-1.5">
      <button type="button" onClick={() => setViewingId(m.id)} className={`p-2 neu-btn rounded-lg ${focusRing}`} aria-label={`View ${m.name}`} title="Details">
        <Eye className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
      <button type="button" onClick={() => setEditing(m)} className={`p-2 neu-btn rounded-lg ${focusRing}`} aria-label={`Edit ${m.name}`} title="Edit">
        <Edit2 className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
      <button type="button" onClick={() => setResetting(m)} className={`p-2 neu-btn rounded-lg ${focusRing}`} aria-label={`Reset password for ${m.name}`} title="Reset password">
        <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
      {m.mfa_enabled && (
        <button type="button" onClick={() => setMfaResetting(m)} className={`p-2 neu-btn rounded-lg ${focusRing}`} aria-label={`Turn off two-step sign-in for ${m.name}`} title="Turn off two-step sign-in">
          <ShieldOff className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      )}
      <button
        type="button"
        onClick={() => setDeleting(m)}
        disabled={m.id === user?.id}
        className={`p-2 neu-btn rounded-lg hover:text-rose-400 disabled:opacity-40 disabled:cursor-not-allowed ${focusRing}`}
        aria-label={m.id === user?.id ? 'You cannot remove your own account' : `Remove ${m.name}`}
        title={m.id === user?.id ? 'You cannot remove your own account' : 'Remove'}
      >
        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
    </div>
  );

  const nameCell = (m: User) => (
    <div className="flex items-center gap-3 min-w-0">
      <Avatar src={m.avatar_url} name={m.name} />
      <div className="min-w-0">
        <div className="font-extrabold text-sm text-slate-100 flex flex-wrap items-center gap-1.5 font-heading">
          <span className="truncate">{m.name}</span>
          {m.role !== 'member' && (
            <Badge size="sm" variant={m.role === 'admin' ? 'purple' : 'cyan'}>
              {m.role === 'admin' ? 'Admin' : 'Coach'}
            </Badge>
          )}
          {m.id === user?.id && <Badge size="sm">You</Badge>}
        </div>
        <div className="text-xs text-slate-400 truncate">{m.email}</div>
      </div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Members"
        description="Accounts, plans and access. Removing an account deletes its bookings, workouts and check-ins; payments are kept."
        actions={
          <>
            <button type="button" onClick={exportCsv} disabled={isExporting} className={`px-4 py-2.5 neu-btn rounded-xl text-xs font-bold flex items-center gap-2 disabled:opacity-60 ${focusRing}`}>
              <Download className="w-4 h-4" aria-hidden="true" /> {isExporting ? 'Exporting…' : 'Attendance CSV'}
            </button>
            <button type="button" onClick={() => setIsCreateOpen(true)} className={`px-4 py-2.5 neu-btn-lime rounded-xl text-xs font-black flex items-center gap-2 ${focusRing}`}>
              <Plus className="w-4 h-4" aria-hidden="true" /> Add member
            </button>
          </>
        }
      />
      <AdminNav />

      <div className="neu-flat p-4 sm:p-5 rounded-3xl border border-slate-800/80 space-y-4">
        <div role="group" aria-label="Show accounts" className="flex flex-wrap gap-2">
          {ROLE_FILTERS.map(r => (
            <button
              key={r.value}
              type="button"
              aria-pressed={filters.role === r.value}
              onClick={() => setFilters(f => ({ ...f, role: r.value }))}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold ${focusRing} ${filters.role === r.value ? 'neu-pressed-sm text-lime-400' : 'neu-btn text-slate-300'}`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="flex flex-col md:flex-row md:items-end gap-3">
          <SearchForm
            id="member-search"
            label="Search by name, email, phone or pass code"
            placeholder="Name, email, phone or pass code"
            onSearch={search => setFilters(f => ({ ...f, search }))}
            className="flex-1 flex gap-2"
          />
          <div className="flex gap-3">
            <div>
              <label htmlFor="tier-filter" className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Plan</label>
              <select id="tier-filter" value={filters.tier} onChange={e => setFilters(f => ({ ...f, tier: e.target.value }))} className={selectClass}>
                {TIER_FILTERS.map(t => (
                  <option key={t} value={t}>{t === 'all' ? 'All plans' : TIER_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="status-filter" className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Status</label>
              <select id="status-filter" value={status} onChange={e => setStatus(e.target.value)} className={selectClass}>
                {STATUS_FILTERS.map(s => (
                  <option key={s} value={s}>{s === 'all' ? 'All statuses' : STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {error ? (
        <ErrorState message={`Could not load ${filterLabel}. ${error}`} onRetry={load} />
      ) : !members ? (
        <LoadingState label="Loading accounts…" />
      ) : members.length === 0 ? (
        <EmptyState title={`No ${filterLabel} match these filters`} body="Change the search or filters to see more accounts." />
      ) : (
        <div className={`space-y-3 ${isLoading ? 'opacity-60' : ''}`} aria-busy={isLoading}>
          <p className="text-xs text-slate-400" role="status">
            {members.length} {members.length === 1 ? 'account' : 'accounts'}
          </p>

          <ul className="md:hidden space-y-3">
            {members.map(m => (
              <li key={m.id} className="neu-flat p-4 rounded-2xl space-y-3">
                {nameCell(m)}
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge size="sm" variant={statusVariant(m.membership_status)}>{STATUS_LABELS[m.membership_status]}</Badge>
                  <span className="text-slate-300 font-semibold">{TIER_LABELS[m.membership_tier]}</span>
                  {/* No date, no "until": a member without a plan reads just "No plan". A frozen
                      membership's date moves on when it is unfrozen, so it has not "ended". */}
                  {m.membership_expiry && (
                    <span className="text-slate-400">
                      {m.membership_expiry < gymToday() && m.membership_status !== 'frozen' ? 'ended' : 'until'} {formatDate(m.membership_expiry)}
                    </span>
                  )}
                </div>
                {rowActions(m)}
              </li>
            ))}
          </ul>

          <div className="hidden md:block neu-flat rounded-3xl border border-slate-800/80 overflow-x-auto">
            <table className="neu-table w-full text-left text-xs">
              <caption className="sr-only">Accounts</caption>
              <thead className="border-b border-slate-800/80 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th scope="col" className="p-4 pl-6">Name</th>
                  <th scope="col" className="p-4">Phone</th>
                  <th scope="col" className="p-4">Plan</th>
                  <th scope="col" className="p-4">Status</th>
                  <th scope="col" className="p-4">Access until</th>
                  <th scope="col" className="p-4">Streak</th>
                  <th scope="col" className="p-4 pr-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {members.map(m => (
                  <tr key={m.id}>
                    <td className="p-4 pl-6 max-w-[280px]">{nameCell(m)}</td>
                    <td className="p-4 whitespace-nowrap">{m.phone || '—'}</td>
                    <td className="p-4 whitespace-nowrap font-semibold">{TIER_SHORT_LABELS[m.membership_tier]}</td>
                    <td className="p-4">
                      <Badge size="sm" variant={statusVariant(m.membership_status)}>{STATUS_LABELS[m.membership_status]}</Badge>
                    </td>
                    <td className="p-4 whitespace-nowrap">{formatDate(m.membership_expiry)}</td>
                    <td className="p-4 whitespace-nowrap">{m.streak_days ?? 0} days</td>
                    <td className="p-4 pr-6">
                      <div className="flex justify-end">{rowActions(m)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <CreateMemberModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreated={(member, tempPassword) => {
          setIsCreateOpen(false);
          setCredentials({ name: member.name, email: member.email, password: tempPassword, reason: 'created' });
          load();
        }}
      />
      <EditMemberModal
        member={editing}
        currentUserId={user?.id}
        onClose={() => setEditing(null)}
        onSaved={(saved, notice) => {
          setEditing(null);
          // Say what else the edit did (a freeze or a plan change cancels bookings), not just "updated".
          if (notice) showToast(notice, sideEffectTone(notice), `${saved.name} was updated`);
          else showToast(`${saved.name} was updated.`, 'success');
          load();
        }}
      />
      <MemberDetailModal memberId={viewingId} onClose={() => setViewingId(null)} />
      <TempPasswordModal credentials={credentials} onClose={() => setCredentials(null)} />
      <ConfirmDialog
        isOpen={deleting !== null}
        title={deleting?.role === 'member' ? 'Remove this member?' : `Remove this ${deleting?.role === 'admin' ? 'admin' : 'coach'} account?`}
        message={
          deleting && (
            <>
              <p>
                <strong>{deleting.name}</strong> ({deleting.email}) will lose access at once. Their bookings, workouts, check-ins and coach notes are deleted;
                payment records are kept.
              </p>
              {deleting.role !== 'member' && <p className="mt-2 text-amber-400 font-semibold">This is a staff account. Make sure someone else can do their work.</p>}
              <p className="mt-2">This cannot be undone.</p>
            </>
          )
        }
        confirmLabel="Remove account"
        tone="danger"
        onConfirm={confirmDelete}
        onClose={() => setDeleting(null)}
      />
      <ConfirmDialog
        isOpen={resetting !== null}
        title="Reset password?"
        message={resetting && <p>A new temporary password is generated for <strong>{resetting.name}</strong> and they are signed out everywhere. You will see the password once.</p>}
        confirmLabel="Reset password"
        onConfirm={confirmReset}
        onClose={() => {
          setResetting(null);
          if (pendingCredentials.current) setCredentials(pendingCredentials.current);
          pendingCredentials.current = null;
        }}
      />
      <ConfirmDialog
        isOpen={mfaResetting !== null}
        title="Turn off two-step sign-in?"
        message={
          mfaResetting && (
            <p>
              Only do this after checking it is really <strong>{mfaResetting.name}</strong> asking (they lost their phone and backup codes). They are signed out
              everywhere and can sign in with just their password.
            </p>
          )
        }
        confirmLabel="Turn off"
        tone="danger"
        onConfirm={confirmMfaReset}
        onClose={() => setMfaResetting(null)}
      />
    </div>
  );
};
