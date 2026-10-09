import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, CalendarDays, ClipboardList, NotebookPen, QrCode, RefreshCw, UserCheck, Users } from 'lucide-react';
import { ClassOccurrence, TrainerClient, TrainerDashboard as Dashboard } from '../../types/index.js';
import { ApiError, api, errorMessage } from '../../api/client.js';
import { Badge } from '../../components/common/Badge.js';
import { EmptyState, ErrorState, LoadingState } from '../../components/common/States.js';
import { AdminNav, Avatar, PageHeader, focusRing } from '../../components/admin/ui.js';
import { KpiTile } from '../../components/admin/KpiTile.js';
import { statusVariant } from '../../components/admin/memberStatus.js';
import { RosterModal, RosterSession } from '../../components/trainer/RosterModal.js';
import { NotesPanel } from '../../components/trainer/NotesPanel.js';
import { CoachList, CoachSelect } from '../../components/trainer/CoachPicker.js';
import { useAuth } from '../../context/AuthContext.js';
import { useNavigation } from '../../context/NavigationContext.js';
import { STATUS_LABELS, TIER_LABELS, formatClock, formatDate, formatTime } from '../../lib/format.js';

type Tab = 'classes' | 'clients' | 'notes';
const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'classes', label: 'Classes', icon: CalendarDays },
  { id: 'clients', label: 'Clients', icon: Users },
  { id: 'notes', label: 'Notes', icon: NotebookPen }
];

/** A session that has started, from GET /trainer/me `recent_sessions` (last 14 days, newest first). */
interface RecentSession {
  class_id: string;
  class_title: string;
  category: string;
  room: string;
  date: string;
  start_time: string;
  duration_minutes: number;
  starts_at: string;
  /** Bookings that were not cancelled, no-shows included. */
  booked: number;
  /** Bookings not marked attended or no-show yet. */
  unmarked: number;
}

type DashboardData = Dashboard & { recent_sessions?: RecentSession[] };

interface TrainerDashboardProps {
  /** An admin viewing a coach's dashboard (?trainer=<id>). */
  trainerId?: string;
}

interface SessionRowProps {
  title: string;
  date: string;
  time: string;
  durationMinutes: number;
  room: string;
  category: string;
  summary: string;
  action: string;
}

const SessionRow: React.FC<SessionRowProps & { onOpen: () => void }> = ({ title, date, time, durationMinutes, room, category, summary, action, onOpen }) => (
  <li className="neu-pressed-sm rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
    <div className="sm:w-44 shrink-0">
      <p className="text-sm font-black text-lime-400">{formatDate(date, { weekday: 'short', day: 'numeric', month: 'short' })}</p>
      <p className="text-xs text-slate-400">{time} · {durationMinutes} min</p>
    </div>
    <div className="flex-1 min-w-0">
      <p className="font-extrabold text-slate-100 font-['Outfit'] break-words">{title}</p>
      <p className="text-xs text-slate-400">
        {room} · {category} · {summary}
      </p>
    </div>
    {/* The accessible name starts with the visible text, so "click Take attendance" works by voice. */}
    <button type="button" onClick={onOpen} className={`px-4 py-2 neu-btn rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shrink-0 ${focusRing}`} aria-label={`${action}: ${title} on ${formatDate(date)}`}>
      <ClipboardList className="w-3.5 h-3.5" aria-hidden="true" /> {action}
    </button>
  </li>
);

const upcomingRow = (o: ClassOccurrence): SessionRowProps => ({
  title: o.title,
  date: o.occurrence_date,
  time: formatTime(o.starts_at),
  durationMinutes: o.duration_minutes,
  room: o.room,
  category: o.category,
  summary: `${o.booked_count}/${o.capacity} booked`,
  action: 'Open roster'
});

const recentRow = (s: RecentSession): SessionRowProps => ({
  title: s.class_title,
  date: s.date,
  time: formatClock(s.start_time),
  durationMinutes: s.duration_minutes,
  room: s.room,
  category: s.category,
  summary: `${s.booked} booked · ${s.unmarked === 0 ? 'all marked' : `${s.unmarked} not marked`}`,
  action: s.unmarked > 0 ? 'Take attendance' : 'Review attendance'
});

export const TrainerDashboard: React.FC<TrainerDashboardProps> = ({ trainerId: trainerIdProp }) => {
  const { user } = useAuth();
  const { params, navigate } = useNavigation();
  const isAdmin = user?.role === 'admin';
  // Only an admin chooses the coach; a coach always sees their own dashboard.
  const trainerId = isAdmin ? trainerIdProp ?? (params.get('trainer') || undefined) : undefined;
  // An admin has no coach record of their own, so there is nothing to load until they pick one.
  const needsCoach = isAdmin && !trainerId;
  const chooseCoach = useCallback((id: string) => navigate('trainer-dashboard', { trainer: id }), [navigate]);

  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<{ message: string; notLinked: boolean } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [clients, setClients] = useState<TrainerClient[] | null>(null);
  const [clientsError, setClientsError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('classes');
  const [session, setSession] = useState<RosterSession | null>(null);
  const [noteMember, setNoteMember] = useState('');
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ classes: null, clients: null, notes: null });
  // An answer for a coach the admin has already switched away from is dropped.
  const shownTrainer = useRef(trainerId);
  shownTrainer.current = trainerId;

  const loadDashboard = useCallback(async () => {
    if (needsCoach) return;
    setIsLoading(true);
    try {
      const next = await api.getTrainerDashboard(trainerId);
      if (shownTrainer.current !== trainerId) return;
      setData(next);
      setError(null);
    } catch (err) {
      if (shownTrainer.current !== trainerId) return;
      setError({ message: errorMessage(err), notLinked: err instanceof ApiError && err.code === 'NO_TRAINER_PROFILE' });
    } finally {
      if (shownTrainer.current === trainerId) setIsLoading(false);
    }
  }, [trainerId, needsCoach]);

  const loadClients = useCallback(async () => {
    if (needsCoach) return;
    setClientsError(null);
    try {
      const next = await api.getTrainerClients(trainerId);
      if (shownTrainer.current === trainerId) setClients(next);
    } catch (err) {
      if (shownTrainer.current === trainerId) setClientsError(errorMessage(err));
    }
  }, [trainerId, needsCoach]);

  // Switching to another coach starts from a clean page, not the previous coach's figures.
  useEffect(() => {
    setData(null);
    setError(null);
    setClients(null);
    setClientsError(null);
    setSession(null);
    setNoteMember('');
  }, [trainerId]);

  useEffect(() => {
    loadDashboard();
    loadClients();
  }, [loadDashboard, loadClients]);

  const onTabKey = (e: React.KeyboardEvent, current: Tab) => {
    const index = TABS.findIndex(t => t.id === current);
    let next = -1;
    if (e.key === 'ArrowRight') next = (index + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') next = (index - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = TABS.length - 1;
    if (next < 0) return;
    e.preventDefault();
    setTab(TABS[next].id);
    tabRefs.current[TABS[next].id]?.focus();
  };

  const scannerButton = (
    <button type="button" onClick={() => navigate('admin-scanner')} className={`px-4 py-2.5 neu-btn-lime rounded-xl text-xs font-black flex items-center gap-2 ${focusRing}`}>
      <QrCode className="w-4 h-4" aria-hidden="true" /> Check-in scanner
    </button>
  );

  if (needsCoach) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-6">
        <AdminNav />
        <PageHeader
          eyebrow="Admin · coach view"
          title="Coach dashboards"
          description="Choose a coach to see their classes, take attendance and read their notes. This is also how attendance is taken for coaches who have no login."
          actions={scannerButton}
        />
        <CoachList onChoose={chooseCoach} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-6">
        {isAdmin && <AdminNav />}
        <PageHeader eyebrow={isAdmin ? 'Admin · coach view' : 'Coach'} title="Coach dashboard" actions={scannerButton} />
        {isLoading ? (
          <LoadingState label={isAdmin ? 'Loading the coach’s dashboard…' : 'Loading your dashboard…'} />
        ) : error?.notLinked && isAdmin ? (
          <>
            <EmptyState title="We could not find that coach" body="They may have been removed. Choose another coach." />
            <CoachList onChoose={chooseCoach} />
          </>
        ) : error?.notLinked ? (
          <EmptyState
            title="Your account is not linked to a coach profile yet"
            body="Ask an admin to link your login to your coach profile under Classes & coaches. You can still use the check-in scanner."
          />
        ) : (
          <ErrorState message={`Could not load the dashboard. ${error?.message ?? ''}`} onRetry={loadDashboard} />
        )}
      </div>
    );
  }

  const { trainer, stats } = data;
  const recent = data.recent_sessions ?? [];
  const whose = isAdmin ? `${trainer.name}'s` : 'your';

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-6">
      {isAdmin && <AdminNav />}
      <PageHeader
        eyebrow={isAdmin ? 'Admin · coach view' : 'Coach'}
        title={isAdmin ? `${trainer.name}'s dashboard` : 'Coach dashboard'}
        actions={
          <>
            {isAdmin && trainerId && <CoachSelect value={trainerId} onChoose={chooseCoach} />}
            <button type="button" onClick={() => {
                loadDashboard();
                loadClients();
              }} disabled={isLoading} className={`px-4 py-2.5 neu-btn rounded-xl text-xs font-bold flex items-center gap-2 disabled:opacity-60 ${focusRing}`}>
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} aria-hidden="true" /> Refresh
            </button>
            {scannerButton}
          </>
        }
      />
      {error && <ErrorState message={`Could not refresh the dashboard. ${error.message}`} onRetry={loadDashboard} />}

      <div className="neu-flat p-5 rounded-3xl flex flex-col sm:flex-row sm:items-center gap-4">
        <Avatar src={trainer.avatar_url} name={trainer.name} size="w-16 h-16" />
        <div className="min-w-0">
          <p className="text-lg font-black text-slate-100 font-['Outfit']">{trainer.name}</p>
          <p className="text-xs text-slate-400">
            {trainer.experience_years} years coaching{trainer.specialties?.length ? ` · ${trainer.specialties.join(' · ')}` : ''}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiTile title="Weekly classes" value={stats.classes_per_week} icon={<CalendarDays className="w-5 h-5" />} />
        <KpiTile title="Booked, next 7 days" value={stats.booked_next_7_days} icon={<Users className="w-5 h-5" />} accent="cyan" />
        <KpiTile
          title="Attendance, 30 days"
          value={stats.attendance_rate_30d === null ? 'Not enough data' : `${stats.attendance_rate_30d}%`}
          icon={<Activity className="w-5 h-5" />}
          accent="amber"
          definition="Of the bookings marked attended or no-show in the last 30 days (today and the 29 days before), the share that attended. Bookings not marked yet are not counted."
        />
        <KpiTile title="Clients" value={stats.clients_count} icon={<UserCheck className="w-5 h-5" />} accent="slate" />
      </div>

      <div role="tablist" aria-label="Coach dashboard sections" className="flex gap-2 overflow-x-auto py-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            ref={el => (tabRefs.current[id] = el)}
            id={`tab-${id}`}
            type="button"
            role="tab"
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
            onKeyDown={e => onTabKey(e, id)}
            className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 whitespace-nowrap ${focusRing} ${tab === id ? 'neu-pressed-sm text-lime-400' : 'neu-btn text-slate-300'}`}
          >
            <Icon className="w-4 h-4" aria-hidden="true" /> {label}
          </button>
        ))}
      </div>

      <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} tabIndex={0} className="neu-flat p-5 sm:p-7 rounded-3xl min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400">
        {tab === 'classes' && (
          <div className="space-y-6">
            <section aria-labelledby="upcoming-heading" className="space-y-3">
              <h2 id="upcoming-heading" className="text-base font-extrabold text-slate-100 font-['Outfit']">Next 7 days</h2>
              {data.upcoming.length === 0 ? (
                <EmptyState title="No classes in the next 7 days" body={isAdmin ? 'Assign classes to this coach under Classes & coaches.' : 'Ask an admin to assign classes to you.'} />
              ) : (
                <ul className="space-y-2">
                  {data.upcoming.map(o => (
                    <SessionRow key={`${o.id}-${o.occurrence_date}`} {...upcomingRow(o)} onOpen={() => setSession({ classId: o.id, date: o.occurrence_date, title: o.title })} />
                  ))}
                </ul>
              )}
            </section>
            <section aria-labelledby="recent-heading" className="space-y-3">
              <div>
                <h2 id="recent-heading" className="text-base font-extrabold text-slate-100 font-['Outfit']">Last 14 days</h2>
                <p className="text-xs text-slate-400">Sessions members booked in the last 14 days, newest first. Open any of them to mark who attended and who did not show.</p>
              </div>
              {recent.length === 0 ? (
                <EmptyState title="No booked sessions in the last 14 days" body="Sessions with bookings appear here once they start, so attendance can be taken." />
              ) : (
                <ul className="space-y-2">
                  {recent.map(s => (
                    <SessionRow key={`${s.class_id}-${s.date}`} {...recentRow(s)} onOpen={() => setSession({ classId: s.class_id, date: s.date, title: s.class_title })} />
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}

        {tab === 'clients' &&
          (clientsError ? (
            <ErrorState message={`Could not load clients. ${clientsError}`} onRetry={loadClients} />
          ) : !clients ? (
            <LoadingState label="Loading clients…" />
          ) : clients.length === 0 ? (
            <EmptyState title="No clients yet" body={`Members who book ${whose} classes appear here.`} />
          ) : (
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {clients.map(c => (
                <li key={c.user_id} className="neu-pressed-sm rounded-2xl p-4 space-y-3 min-w-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar src={c.avatar_url} name={c.name} />
                    <div className="min-w-0">
                      <p className="font-bold text-slate-100 break-words">{c.name}</p>
                      <p className="text-xs text-slate-400 flex flex-wrap items-center gap-2">
                        {TIER_LABELS[c.membership_tier]}
                        <Badge size="sm" variant={statusVariant(c.membership_status)}>{STATUS_LABELS[c.membership_status]}</Badge>
                      </p>
                    </div>
                  </div>
                  <dl className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <dt className="text-slate-400">Attended</dt>
                      <dd className="font-bold text-slate-100">{c.sessions_attended}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">Upcoming</dt>
                      <dd className="font-bold text-slate-100">{c.upcoming_bookings}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">Last class</dt>
                      <dd className="font-bold text-slate-100">{c.last_attended ? formatDate(c.last_attended, { day: 'numeric', month: 'short' }) : 'Never'}</dd>
                    </div>
                  </dl>
                  <button
                    type="button"
                    onClick={() => {
                      setNoteMember(c.user_id);
                      setTab('notes');
                    }}
                    className={`px-3 py-2 neu-btn rounded-lg text-xs font-bold flex items-center gap-1.5 ${focusRing}`}
                  >
                    <NotebookPen className="w-3.5 h-3.5" aria-hidden="true" /> Notes ({c.notes_count})
                  </button>
                </li>
              ))}
            </ul>
          ))}

        {tab === 'notes' && (
          <NotesPanel
            clients={clients ?? []}
            trainerId={trainerId}
            currentUserId={user?.id}
            isAdmin={isAdmin}
            memberFilter={noteMember}
            onMemberFilterChange={setNoteMember}
            onChanged={loadClients}
          />
        )}
      </div>

      <RosterModal
        session={session}
        onClose={() => setSession(null)}
        onChanged={() => {
          loadDashboard();
          loadClients();
        }}
      />
    </div>
  );
};
