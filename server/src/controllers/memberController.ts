import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/database.js';
import { User, AttendanceLog } from '../types/index.js';

export const getMembers = async (req: Request, res: Response) => {
  try {
    const { search, tier, status, role } = req.query;
    let list = db.users.map(({ password_hash, ...u }) => u);

    if (role && role !== 'All') {
      list = list.filter(u => u.role === role);
    }

    if (tier && tier !== 'All') {
      list = list.filter(u => u.membership_tier === tier);
    }

    if (status && status !== 'All') {
      list = list.filter(u => u.membership_status === status);
    }

    if (search) {
      const q = (search as string).toLowerCase();
      list = list.filter(u =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.phone.includes(q) ||
        u.qr_code_token.toLowerCase().includes(q)
      );
    }

    res.json({
      success: true,
      data: list
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getMemberById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = db.users.find(u => u.id === id);

    if (!user) {
      return res.status(404).json({ success: false, error: 'Member not found' });
    }

    const { password_hash, ...safeUser } = user;
    const userBookings = db.bookings.filter(b => b.user_id === id);
    const userAttendance = db.attendance_logs.filter(a => a.user_id === id);
    const userWorkouts = db.workouts.filter(w => w.user_id === id);

    res.json({
      success: true,
      data: {
        ...safeUser,
        bookings_count: userBookings.length,
        attendance_count: userAttendance.length,
        workouts_count: userWorkouts.length
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const createMember = async (req: Request, res: Response) => {
  try {
    const { name, email, phone, role = 'member', membership_tier = 'pro', membership_status = 'active', expiry_months = 12 } = req.body;

    if (!name || !email) {
      return res.status(400).json({ success: false, error: 'Name and email are required' });
    }

    const existing = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (existing) {
      return res.status(400).json({ success: false, error: 'Email already registered' });
    }

    const defaultPassword = 'pulse' + Math.floor(100 + Math.random() * 900);
    const password_hash = bcrypt.hashSync(defaultPassword, 10);
    const id = `usr_${uuidv4().substring(0, 8)}`;
    const qr_code_token = `PULSE-MEM-${name.toUpperCase().replace(/[^A-Z]/g, '').substring(0, 5)}-${Math.floor(1000 + Math.random() * 9000)}`;

    const expiryDate = new Date();
    expiryDate.setMonth(expiryDate.getMonth() + Number(expiry_months));

    const newMember: User = {
      id,
      name,
      email: email.toLowerCase(),
      password_hash,
      role,
      avatar_url: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}`,
      phone: phone || '+1 (555) 000-0000',
      membership_tier,
      membership_status,
      membership_expiry: expiryDate.toISOString().split('T')[0],
      qr_code_token,
      created_at: new Date().toISOString(),
      streak_days: 0
    };

    db.users = [...db.users, newMember];
    const { password_hash: _, ...safeUser } = newMember;

    res.status(201).json({
      success: true,
      data: safeUser,
      tempPassword: defaultPassword
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const updateMember = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const existing = db.users.find(u => u.id === id);

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Member not found' });
    }

    const { name, phone, membership_tier, membership_status, membership_expiry, role } = req.body;

    const updatedUsers = db.users.map(u => {
      if (u.id === id) {
        return {
          ...u,
          name: name ?? u.name,
          phone: phone ?? u.phone,
          membership_tier: membership_tier ?? u.membership_tier,
          membership_status: membership_status ?? u.membership_status,
          membership_expiry: membership_expiry ?? u.membership_expiry,
          role: role ?? u.role
        };
      }
      return u;
    });

    db.users = updatedUsers;
    const updated = updatedUsers.find(u => u.id === id)!;
    const { password_hash, ...safeUser } = updated;

    res.json({
      success: true,
      data: safeUser
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const deleteMember = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const existing = db.users.find(u => u.id === id);

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Member not found' });
    }

    db.users = db.users.filter(u => u.id !== id);
    db.bookings = db.bookings.filter(b => b.user_id !== id);
    db.workouts = db.workouts.filter(w => w.user_id !== id);
    db.attendance_logs = db.attendance_logs.filter(a => a.user_id !== id);

    res.json({
      success: true,
      message: 'Member removed successfully'
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const checkInMember = async (req: Request, res: Response) => {
  try {
    const { tokenOrId, method = 'qr' } = req.body;

    if (!tokenOrId) {
      return res.status(400).json({ success: false, error: 'QR Code or Member ID token is required' });
    }

    const trimmed = (tokenOrId as string).trim();
    const user = db.users.find(
      u => u.qr_code_token === trimmed || u.id === trimmed || u.email.toLowerCase() === trimmed.toLowerCase()
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Invalid pass code: Member not found in database.'
      });
    }

    if (user.membership_status === 'expired') {
      return res.status(403).json({
        success: false,
        error: `Check-in denied: ${user.name}'s membership has expired on ${user.membership_expiry}.`,
        user: { name: user.name, tier: user.membership_tier, status: user.membership_status }
      });
    }

    if (user.membership_status === 'frozen') {
      return res.status(403).json({
        success: false,
        error: `Check-in denied: ${user.name}'s membership is currently frozen.`,
        user: { name: user.name, tier: user.membership_tier, status: user.membership_status }
      });
    }

    // Record check-in log
    const log: AttendanceLog = {
      id: `att_${uuidv4().substring(0, 8)}`,
      user_id: user.id,
      user_name: user.name,
      user_email: user.email,
      user_tier: user.membership_tier,
      check_in_time: new Date().toISOString(),
      check_in_method: method as any
    };

    db.attendance_logs = [log, ...db.attendance_logs];

    // Update member streak
    db.users = db.users.map(u => {
      if (u.id === user.id) {
        return { ...u, streak_days: (u.streak_days || 0) + 1 };
      }
      return u;
    });

    res.json({
      success: true,
      message: `Welcome to PulseFit, ${user.name}! Check-in confirmed.`,
      data: {
        log,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          tier: user.membership_tier,
          avatar_url: user.avatar_url,
          streak_days: (user.streak_days || 0) + 1,
          expiry: user.membership_expiry
        }
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getAttendanceLogs = async (req: Request, res: Response) => {
  try {
    const logs = db.attendance_logs.slice(0, 50);
    res.json({
      success: true,
      data: logs
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};
