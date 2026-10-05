import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/database.js';
import { TimeSession, TimeSessionCategory, ActiveFloorStatus, UserTimeTrackingStats } from '../types/index.js';

export const clockIn = async (req: any, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const user = db.users.find(u => u.id === userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const { category = 'Workout & Strength', notes = '' } = req.body;
    const validCategory: TimeSessionCategory =
      category === 'Zumba & Cardio' ? 'Zumba & Cardio' : 'Workout & Strength';

    // Check if user already has an active session
    const existingActive = db.time_sessions.find(
      s => s.user_id === userId && s.status === 'active'
    );

    if (existingActive) {
      return res.status(400).json({
        success: false,
        error: `You are already clocked in to ${existingActive.category}. Please clock out before starting a new session.`,
        data: existingActive
      });
    }

    const newSession: TimeSession = {
      id: `ses_${uuidv4().substring(0, 8)}`,
      user_id: user.id,
      user_name: user.name,
      user_email: user.email,
      user_avatar: user.avatar_url,
      user_tier: user.membership_tier,
      category: validCategory,
      clock_in_time: new Date().toISOString(),
      clock_out_time: null,
      duration_minutes: 0,
      status: 'active',
      notes: notes || undefined
    };

    db.time_sessions = [newSession, ...db.time_sessions];

    res.status(201).json({
      success: true,
      message: `Clocked in to ${validCategory} floor successfully!`,
      data: newSession
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const clockOut = async (req: any, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { sessionId, notes } = req.body;

    // Find active session for user or by sessionId
    const session = db.time_sessions.find(
      s => (sessionId ? s.id === sessionId : s.user_id === userId) && s.status === 'active'
    );

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'No active session found to clock out.'
      });
    }

    const clockOutTime = new Date();
    const clockInTime = new Date(session.clock_in_time);
    const durationMinutes = Math.max(
      1,
      Math.round((clockOutTime.getTime() - clockInTime.getTime()) / 60000)
    );

    const updatedSessions = db.time_sessions.map(s => {
      if (s.id === session.id) {
        return {
          ...s,
          clock_out_time: clockOutTime.toISOString(),
          duration_minutes: durationMinutes,
          status: 'completed' as const,
          notes: notes !== undefined ? notes : s.notes
        };
      }
      return s;
    });

    db.time_sessions = updatedSessions;
    const completedSession = updatedSessions.find(s => s.id === session.id)!;

    // Auto increment user streak if not already updated today
    const user = db.users.find(u => u.id === userId);
    if (user) {
      db.users = db.users.map(u => {
        if (u.id === userId) {
          return { ...u, streak_days: (u.streak_days || 0) + 1 };
        }
        return u;
      });
    }

    res.json({
      success: true,
      message: `Clocked out successfully! Great session on the ${completedSession.category} floor (${durationMinutes} min).`,
      data: completedSession
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getActiveFloorStatus = async (_req: Request, res: Response) => {
  try {
    const activeSessions = db.time_sessions.filter(s => s.status === 'active');
    const now = Date.now();

    // Map sessions with live duration
    const enrichedSessions = activeSessions.map(s => {
      const elapsedMin = Math.max(
        0,
        Math.round((now - new Date(s.clock_in_time).getTime()) / 60000)
      );
      return {
        ...s,
        duration_minutes: elapsedMin
      };
    });

    const workoutUsers = enrichedSessions.filter(
      s => s.category === 'Workout & Strength'
    );
    const zumbaUsers = enrichedSessions.filter(
      s => s.category === 'Zumba & Cardio'
    );

    const responseData: ActiveFloorStatus = {
      totalActive: enrichedSessions.length,
      workoutActive: workoutUsers.length,
      zumbaActive: zumbaUsers.length,
      workoutUsers,
      zumbaUsers
    };

    res.json({
      success: true,
      data: responseData
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getMyTimeTrackingStats = async (req: any, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const userSessions = db.time_sessions.filter(s => s.user_id === userId);
    const activeSession = userSessions.find(s => s.status === 'active') || null;

    if (activeSession) {
      const elapsedMin = Math.max(
        0,
        Math.round((Date.now() - new Date(activeSession.clock_in_time).getTime()) / 60000)
      );
      activeSession.duration_minutes = elapsedMin;
    }

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const completed = userSessions.filter(s => s.status === 'completed');

    const totalTimeMinutesThisWeek = completed
      .filter(s => new Date(s.clock_in_time) >= sevenDaysAgo)
      .reduce((acc, s) => acc + (s.duration_minutes || 0), 0);

    const totalTimeMinutesThisMonth = completed
      .filter(s => new Date(s.clock_in_time) >= thirtyDaysAgo)
      .reduce((acc, s) => acc + (s.duration_minutes || 0), 0);

    const stats: UserTimeTrackingStats = {
      activeSession,
      totalTimeMinutesThisWeek,
      totalTimeMinutesThisMonth,
      totalSessionsCompleted: completed.length,
      recentSessions: completed.slice(0, 15)
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};
