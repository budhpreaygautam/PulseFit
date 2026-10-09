import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarDays, Edit2, LayoutDashboard, Loader2, Mail, Phone, Plus, Trash2, UserCheck, Users, X } from 'lucide-react';
import { ClassOccurrence, Trainer } from '../../types/index.js';
import { ApiError, api, errorMessage } from '../../api/client.js';
import { Badge } from '../../components/common/Badge.js';
import { ConfirmDialog } from '../../components/common/ConfirmDialog.js';
import { Modal } from '../../components/common/Modal.js';
import { EmptyState, ErrorState, LoadingState } from '../../components/common/States.js';
import { AdminNav, Avatar, FormError, PageHeader, SectionCard, focusRing, inputClass, labelClass, sideEffectTone } from '../../components/admin/ui.js';
import { ClassFormModal, WEEK_ORDER } from '../../components/admin/ClassFormModal.js';
import { CoachFormModal } from '../../components/admin/CoachFormModal.js';
import { useAuth } from '../../context/AuthContext.js';
import { useNavigation } from '../../context/NavigationContext.js';
import { useToast } from '../../context/ToastContext.js';
import { canAccess, routeForTab } from '../../routes.js';
import { DAY_NAMES, formatClock, formatDate } from '../../lib/format.js';

type Reassign = { trainer: Trainer; classes: { id: string; title: string }[] };

function endClock(start: string, minutes: number): string {
  const [h, m] = start.split(':').map(Number);
  const total = (h * 60 + m + minutes) % (24 * 60);
  return formatClock(`${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`);
}

type NoticeMessage = { tone: 'success' | 'error'; text: string };

const Notice: React.FC<{ notice: NoticeMessage | null; onDismiss: () => void }> = ({ notice, onDismiss }) => {
  const ref = useRef<HTMLDivElement>(null);
  // The action that produced it is often far down the page (a coach card, a Sunday class).
  useEffect(() => {
    if (notice) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [notice]);
  if (!notice) return null;
  return (
    <div
      key={`${notice.tone}:${notice.text}`}
      ref={ref}
      className={`glass-tint flex items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold scroll-mt-32 ${
        notice.tone === 'error' ? 'border-rose-500/40 bg-rose-500/10 text-rose-300 [.light_&]:text-rose-700' : 'border-lime-500/40 bg-lime-500/10 text-slate-100'
      }`}
      role={notice.tone === 'error' ? 'alert' : 'status'}
    >
      <span>{notice.text}</span>
      <button type="button" onClick={onDismiss} className={`neu-icon-btn w-7 h-7 shrink-0 ${focusRing}`} aria-label="Dismiss message">
        <X className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  );
};

export const ClassManagement: React.FC = () => {
  const { user } = useAuth();
  const { navigate } = useNavigation();
  const { showToast } = useToast();
  const coachViewRoute = routeForTab('trainer-dashboard');
  // Admins open a coach's dashboard (/trainer?trainer=<id>) to take attendance for coaches without a login.
  const canViewCoachDashboard = !!coachViewRoute && canAccess(coachViewRoute, user?.role ?? null);
  const [classes, setClasses] = useState<ClassOccurrence[] | null>(null);
  const [classesError, setClassesError] = useState<string | null>(null);
  const [trainers, setTrainers] = useState<Trainer[] | null>(null);
  const [trainersError, setTrainersError] = useState<string | null>(null);
  const [day, setDay] = useState<number | 'all'>('all');
  const [notice, setNotice] = useState<NoticeMessage | null>(null);
  const success = (text: string) => setNotice({ tone: 'success', text });
  // Members lose their spots when a class changes or goes, so cancellations get their own warning.
  const reportSideEffects = (text?: string) => {
    if (!text) return;
    const tone = sideEffectTone(text);
    showToast(text, tone, tone === 'warning' ? 'Bookings cancelled' : undefined);
  };

  const [classTarget, setClassTarget] = useState<ClassOccurrence | 'new' | null>(null);
  const [deletingClass, setDeletingClass] = useState<ClassOccurrence | null>(null);
  const [coachTarget, setCoachTarget] = useState<Trainer | 'new' | null>(null);
  const [deletingCoach, setDeletingCoach] = useState<Trainer | null>(null);
  const [reassign, setReassign] = useState<Reassign | null>(null);
  // Opened after the confirm dialog has closed, so the two dialogs do not fight over focus and scroll lock.
  const pendingReassign = useRef<Reassign | null>(null);
  const [reassignTo, setReassignTo] = useState('');
  const [reassignError, setReassignError] = useState<string | null>(null);
  const [isReassigning, setIsReassigning] = useState(false);

  const loadClasses = useCallback(async () => {
    setClassesError(null);
    try {
      setClasses(await api.getClasses());
    } catch (err) {
      setClassesError(errorMessage(err));
    }
  }, []);

  const loadTrainers = useCallback(async () => {
    setTrainersError(null);
    try {
      setTrainers(await api.getTrainers());
    } catch (err) {
      setTrainersError(errorMessage(err));
    }
  }, []);

  const reloadAll = useCallback(() => {
    loadClasses();
    loadTrainers();
  }, [loadClasses, loadTrainers]);

  useEffect(() => {
    reloadAll();
  }, [reloadAll]);

  const confirmDeleteClass = async () => {
    if (!deletingClass) return;
    try {
      const { cancelled_bookings } = await api.deleteClass(deletingClass.id);
      if (cancelled_bookings === 0) success(`${deletingClass.title} was deleted. No upcoming bookings had to be cancelled.`);
      else {
        const cancelled = `${cancelled_bookings} upcoming booking${cancelled_bookings === 1 ? ' was' : 's were'} cancelled.`;
        // The toast goes after a few seconds; the notice keeps the count for an admin who looked away.
        success(`${deletingClass.title} was deleted. ${cancelled}`);
        reportSideEffects(cancelled);
      }
      reloadAll();
    } catch (err) {
      setNotice({ tone: 'error', text: `Could not delete ${deletingClass.title}. ${errorMessage(err)}` });
      // Already gone (deleted elsewhere): the timetable is stale.
      if (err instanceof ApiError && err.status === 404) loadClasses();
    }
  };

  const confirmDeleteCoach = async () => {
    if (!deletingCoach) return;
    try {
      await api.deleteTrainer(deletingCoach.id);
      success(`${deletingCoach.name} was removed.`);
      reloadAll();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'TRAINER_HAS_CLASSES') {
        const data = err.data as { classes?: { id: string; title: string }[] } | undefined;
        pendingReassign.current = { trainer: deletingCoach, classes: data?.classes ?? [] };
      } else {
        setNotice({ tone: 'error', text: `Could not remove ${deletingCoach.name}. ${errorMessage(err)}` });
        if (err instanceof ApiError && err.status === 404) loadTrainers();
      }
    }
  };

  const submitReassign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reassign) return;
    if (!reassignTo) {
      setReassignError('Choose the coach who takes over these classes.');
      return;
    }
    setIsReassigning(true);
    setReassignError(null);
    try {
      const { reassigned_classes } = await api.deleteTrainer(reassign.trainer.id, reassignTo);
      const to = trainers?.find(t => t.id === reassignTo)?.name ?? 'the new coach';
      success(`${reassign.trainer.name} was removed. ${reassigned_classes} class${reassigned_classes === 1 ? '' : 'es'} moved to ${to}.`);
      setReassign(null);
      reloadAll();
    } catch (err) {
      setReassignError(errorMessage(err));
      if (err instanceof ApiError && err.code === 'TRAINER_NOT_FOUND') loadTrainers();
    } finally {
      setIsReassigning(false);
    }
  };

  const visibleDays = day === 'all' ? WEEK_ORDER : [day];
  const byDay = (d: number) => (classes ?? []).filter(c => c.day_of_week === d).sort((a, b) => a.start_time.localeCompare(b.start_time));
  const otherCoaches = (trainers ?? []).filter(t => t.id !== reassign?.trainer.id);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Classes & coaches"
        description="The weekly timetable and the coaching team. Booking counts are for each class's next session."
        actions={
          <>
            <button type="button" onClick={() => setCoachTarget('new')} className={`px-4 py-2.5 neu-btn rounded-xl text-xs font-bold flex items-center gap-2 ${focusRing}`}>
              <UserCheck className="w-4 h-4" aria-hidden="true" /> Add coach
            </button>
            <button
              type="button"
              onClick={() => setClassTarget('new')}
              disabled={!trainers || trainers.length === 0}
              title={trainers && trainers.length === 0 ? 'Add a coach first' : undefined}
              className={`px-4 py-2.5 neu-btn-lime rounded-xl text-xs font-black flex items-center gap-2 disabled:opacity-60 ${focusRing}`}
            >
              <Plus className="w-4 h-4" aria-hidden="true" /> Add class
            </button>
          </>
        }
      />
      <AdminNav />
      <Notice notice={notice} onDismiss={() => setNotice(null)} />

      <SectionCard id="timetable-heading" title="Weekly timetable" icon={<CalendarDays className="w-4 h-4 text-lime-400" aria-hidden="true" />}>
        <div role="group" aria-label="Show day" className="flex flex-wrap gap-2">
          {(['all', ...WEEK_ORDER] as const).map(d => (
            <button
              key={d}
              type="button"
              aria-pressed={day === d}
              onClick={() => setDay(d)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold ${focusRing} ${day === d ? 'neu-pressed-sm text-lime-400' : 'neu-btn text-slate-300'}`}
            >
              {d === 'all' ? 'All days' : DAY_NAMES[d].slice(0, 3)}
            </button>
          ))}
        </div>

        {classesError ? (
          <ErrorState message={classesError} onRetry={loadClasses} />
        ) : !classes ? (
          <LoadingState label="Loading the timetable…" />
        ) : classes.length === 0 ? (
          <EmptyState title="No classes on the timetable yet" body={trainers?.length ? 'Add the first class.' : 'Add a coach, then add the first class.'} />
        ) : (
          <div className="space-y-5">
            {visibleDays.map(d => {
              const list = byDay(d);
              if (day === 'all' && list.length === 0) return null;
              return (
                <section key={d} aria-labelledby={`day-${d}`} className="space-y-2">
                  <h3 id={`day-${d}`} className="text-sm font-black text-slate-200 font-['Outfit']">
                    {DAY_NAMES[d]} <span className="text-xs font-semibold text-slate-400">· {list.length} {list.length === 1 ? 'class' : 'classes'}</span>
                  </h3>
                  {list.length === 0 ? (
                    <p className="text-xs text-slate-400 neu-pressed-sm rounded-xl p-4">No classes on {DAY_NAMES[d]}.</p>
                  ) : (
                    <ul className="space-y-2">
                      {list.map(c => (
                        <li key={c.id} className="neu-pressed-sm rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                          <div className="sm:w-36 shrink-0 text-sm font-black text-lime-400">
                            {formatClock(c.start_time)} – {endClock(c.start_time, c.duration_minutes)}
                          </div>
                          <div className="flex-1 min-w-0 space-y-1">
                            <p className="font-extrabold text-slate-100 font-['Outfit'] break-words">{c.title}</p>
                            <p className="text-xs text-slate-400">
                              {c.category} · {c.intensity} · {c.room} · {c.trainer_name ?? 'No coach'}
                            </p>
                            <p className="text-xs text-slate-300">
                              <strong>{c.booked_count}</strong>/{c.capacity} booked for {formatDate(c.occurrence_date)}
                              {c.is_full && <Badge size="sm" variant="amber" className="ml-2">Full</Badge>}
                            </p>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <button type="button" onClick={() => setClassTarget(c)} className={`px-3 py-2 neu-btn rounded-lg text-xs font-bold flex items-center gap-1.5 ${focusRing}`} aria-label={`Edit ${c.title} on ${DAY_NAMES[c.day_of_week]}`}>
                              <Edit2 className="w-3.5 h-3.5" aria-hidden="true" /> Edit
                            </button>
                            <button type="button" onClick={() => setDeletingClass(c)} className={`px-3 py-2 neu-btn rounded-lg text-xs font-bold flex items-center gap-1.5 hover:text-rose-400 ${focusRing}`} aria-label={`Delete ${c.title} on ${DAY_NAMES[c.day_of_week]}`}>
                              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" /> Delete
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </SectionCard>

      <SectionCard id="coaches-heading" title="Coaches" icon={<Users className="w-4 h-4 text-cyan-400" aria-hidden="true" />} description="A coach with a linked login sees their own dashboard, rosters and notes.">
        {trainersError ? (
          <ErrorState message={trainersError} onRetry={loadTrainers} />
        ) : !trainers ? (
          <LoadingState label="Loading coaches…" />
        ) : trainers.length === 0 ? (
          <EmptyState title="No coaches yet" action={<button type="button" onClick={() => setCoachTarget('new')} className={`neu-btn px-4 py-2 rounded-xl text-xs font-bold ${focusRing}`}>Add a coach</button>} />
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {trainers.map(t => (
              <li key={t.id} className="neu-pressed-sm rounded-2xl p-4 space-y-3 min-w-0">
                <div className="flex items-start gap-3 min-w-0">
                  <Avatar src={t.avatar_url} name={t.name} size="w-12 h-12" />
                  <div className="min-w-0">
                    <p className="font-extrabold text-slate-100 font-['Outfit'] break-words">{t.name}</p>
                    <p className="text-xs text-slate-400">
                      {t.classes_count ?? 0} weekly {t.classes_count === 1 ? 'class' : 'classes'} · {t.experience_years} yrs experience
                    </p>
                    <div className="mt-1">
                      <Badge size="sm" variant={t.user_id ? 'lime' : 'slate'}>{t.user_id ? 'Login linked' : 'No login'}</Badge>
                    </div>
                  </div>
                </div>
                {t.specialties?.length > 0 && <p className="text-xs text-slate-300">{t.specialties.join(' · ')}</p>}
                <div className="space-y-1 text-xs">
                  {t.email && (
                    <a href={`mailto:${t.email}`} className={`flex items-center gap-1.5 text-slate-300 hover:text-lime-400 break-all rounded ${focusRing}`}>
                      <Mail className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> {t.email}
                    </a>
                  )}
                  {t.phone && (
                    <a href={`tel:${t.phone}`} className={`flex items-center gap-1.5 text-slate-300 hover:text-lime-400 rounded ${focusRing}`}>
                      <Phone className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> {t.phone}
                    </a>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {canViewCoachDashboard && (
                    <button type="button" onClick={() => navigate('trainer-dashboard', { trainer: t.id })} className={`px-3 py-2 neu-btn rounded-lg text-xs font-bold flex items-center gap-1.5 ${focusRing}`} aria-label={`View ${t.name}'s dashboard`}>
                      <LayoutDashboard className="w-3.5 h-3.5" aria-hidden="true" /> Dashboard
                    </button>
                  )}
                  <button type="button" onClick={() => setCoachTarget(t)} className={`px-3 py-2 neu-btn rounded-lg text-xs font-bold flex items-center gap-1.5 ${focusRing}`} aria-label={`Edit ${t.name}`}>
                    <Edit2 className="w-3.5 h-3.5" aria-hidden="true" /> Edit
                  </button>
                  <button type="button" onClick={() => setDeletingCoach(t)} className={`px-3 py-2 neu-btn rounded-lg text-xs font-bold flex items-center gap-1.5 hover:text-rose-400 ${focusRing}`} aria-label={`Remove ${t.name}`}>
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" /> Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <ClassFormModal
        target={classTarget}
        trainers={trainers ?? []}
        onClose={() => setClassTarget(null)}
        onSaved={(message, notice) => {
          setClassTarget(null);
          success(notice ? `${message} ${notice}` : message);
          reportSideEffects(notice);
          reloadAll();
        }}
        onTrainersStale={loadTrainers}
      />
      <CoachFormModal
        target={coachTarget}
        trainers={trainers ?? []}
        onClose={() => setCoachTarget(null)}
        onSaved={message => {
          setCoachTarget(null);
          success(message);
          reloadAll();
        }}
      />
      <ConfirmDialog
        isOpen={deletingClass !== null}
        title="Delete this class?"
        message={
          deletingClass && (
            <p>
              <strong>{deletingClass.title}</strong> ({DAY_NAMES[deletingClass.day_of_week]} {formatClock(deletingClass.start_time)}) is removed from the timetable.
              Upcoming confirmed bookings are cancelled; past sessions stay in members' history.
            </p>
          )
        }
        confirmLabel="Delete class"
        tone="danger"
        onConfirm={confirmDeleteClass}
        onClose={() => setDeletingClass(null)}
      />
      <ConfirmDialog
        isOpen={deletingCoach !== null}
        title="Remove this coach?"
        message={
          deletingCoach && (
            <p>
              <strong>{deletingCoach.name}</strong> is removed from the coaching team.
              {deletingCoach.classes_count ? ` They teach ${deletingCoach.classes_count} weekly class${deletingCoach.classes_count === 1 ? '' : 'es'}; you will choose who takes over.` : ''}
            </p>
          )
        }
        confirmLabel="Remove coach"
        tone="danger"
        onConfirm={confirmDeleteCoach}
        onClose={() => {
          setDeletingCoach(null);
          if (pendingReassign.current) {
            setReassign(pendingReassign.current);
            setReassignTo('');
            setReassignError(null);
          }
          pendingReassign.current = null;
        }}
      />
      <Modal
        isOpen={reassign !== null}
        onClose={isReassigning ? () => undefined : () => setReassign(null)}
        title={reassign ? `Hand over ${reassign.trainer.name}'s classes` : undefined}
        description="A coach who still teaches classes can only be removed once someone takes them over."
        maxWidth="md"
      >
        {reassign && (
          <form onSubmit={submitReassign} className="space-y-4">
            <FormError message={reassignError} />
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">Classes to move</p>
              <ul className="neu-pressed-sm rounded-xl divide-y divide-slate-800/60 text-sm">
                {reassign.classes.map(c => (
                  <li key={c.id} className="px-3 py-2 text-slate-200">{c.title}</li>
                ))}
              </ul>
            </div>
            {otherCoaches.length === 0 ? (
              <p className="text-sm text-amber-400 font-semibold" role="alert">There is no other coach. Add one first, then remove {reassign.trainer.name}.</p>
            ) : (
              <div>
                <label htmlFor="reassign-to" className={labelClass}>New coach</label>
                <select id="reassign-to" value={reassignTo} onChange={e => setReassignTo(e.target.value)} className={inputClass}>
                  <option value="">Choose a coach</option>
                  {otherCoaches.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex flex-col-reverse sm:flex-row gap-3 pt-4 border-t border-slate-800/80">
              <button type="button" onClick={() => setReassign(null)} disabled={isReassigning} className={`flex-1 py-2.5 neu-btn font-bold text-sm rounded-xl disabled:opacity-50 ${focusRing}`}>
                Cancel
              </button>
              <button
                type="submit"
                disabled={isReassigning || otherCoaches.length === 0}
                className={`neu-btn-danger flex-1 py-2.5 rounded-xl text-sm font-black flex items-center justify-center gap-2 disabled:opacity-60 ${focusRing}`}
              >
                {isReassigning && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                Move classes and remove
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};
