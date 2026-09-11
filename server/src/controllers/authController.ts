import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/database.js';
import { generateToken, AuthenticatedRequest } from '../middleware/auth.js';
import { User, MembershipTier } from '../types/index.js';

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }

    const user = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user || !user.password_hash) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    const isValid = bcrypt.compareSync(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    const token = generateToken(user);
    const { password_hash, ...safeUser } = user;

    res.json({
      success: true,
      data: {
        token,
        user: safeUser
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const register = async (req: Request, res: Response) => {
  try {
    const { name, email, password, phone, tier = 'pro' } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, error: 'Name, email, and password are required' });
    }

    const existing = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (existing) {
      return res.status(400).json({ success: false, error: 'Email already in use' });
    }

    const password_hash = bcrypt.hashSync(password, 10);
    const id = `usr_${uuidv4().substring(0, 8)}`;
    const qr_code_token = `PULSE-MEM-${name.toUpperCase().replace(/[^A-Z]/g, '').substring(0, 5)}-${Math.floor(1000 + Math.random() * 9000)}`;

    const newUser: User = {
      id,
      name,
      email: email.toLowerCase(),
      password_hash,
      role: 'member',
      avatar_url: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}`,
      phone: phone || '+1 (555) 000-0000',
      membership_tier: tier,
      membership_status: 'active',
      membership_expiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      qr_code_token,
      created_at: new Date().toISOString(),
      streak_days: 1
    };

    const currentUsers = [...db.users, newUser];
    db.users = currentUsers;

    const token = generateToken(newUser);
    const { password_hash: _, ...safeUser } = newUser;

    res.status(201).json({
      success: true,
      data: {
        token,
        user: safeUser
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const firebaseSync = async (req: Request, res: Response) => {
  try {
    const { uid, email, displayName, photoURL, tier = 'pro', phone } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, error: 'Firebase email is required' });
    }

    const normalizedEmail = email.toLowerCase();
    let user = db.users.find(u => u.email.toLowerCase() === normalizedEmail);

    if (user) {
      // User exists, update avatar or name if provided
      if (photoURL || displayName) {
        db.users = db.users.map(u => {
          if (u.id === user!.id) {
            return {
              ...u,
              name: displayName || u.name,
              avatar_url: photoURL || u.avatar_url
            };
          }
          return u;
        });
        user = db.users.find(u => u.id === user!.id)!;
      }
    } else {
      // New member from Firebase / Google Auth
      const id = `usr_fb_${(uid || uuidv4()).substring(0, 8)}`;
      const memberName = displayName || email.split('@')[0];
      const qr_code_token = `PULSE-MEM-${memberName.toUpperCase().replace(/[^A-Z]/g, '').substring(0, 5) || 'ATHL'}-${Math.floor(1000 + Math.random() * 9000)}`;

      user = {
        id,
        name: memberName,
        email: normalizedEmail,
        password_hash: '',
        role: 'member',
        avatar_url: photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(memberName)}`,
        phone: phone || '+1 (555) 000-0000',
        membership_tier: tier,
        membership_status: 'active',
        membership_expiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        qr_code_token,
        created_at: new Date().toISOString(),
        streak_days: 1
      };

      db.users = [...db.users, user];
    }

    const token = generateToken(user);
    const { password_hash, ...safeUser } = user;

    res.json({
      success: true,
      data: {
        token,
        user: safeUser
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const demoLogin = async (req: Request, res: Response) => {
  try {
    const { role = 'member' } = req.body;
    let targetEmail = 'member@pulsefit.com';

    if (role === 'admin') targetEmail = 'admin@pulsefit.com';
    else if (role === 'trainer') targetEmail = 'trainer@pulsefit.com';
    else if (role === 'vip') targetEmail = 'vip@pulsefit.com';
    else if (role === 'member') targetEmail = 'member@pulsefit.com';

    const user = db.users.find(u => u.email === targetEmail);
    if (!user) {
      return res.status(404).json({ success: false, error: `Demo user for role ${role} not found` });
    }

    const token = generateToken(user);
    const { password_hash, ...safeUser } = user;

    res.json({
      success: true,
      data: {
        token,
        user: safeUser
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getMe = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { password_hash, ...safeUser } = req.user;
    res.json({
      success: true,
      data: safeUser
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const updateProfile = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { name, phone, avatar_url, membership_tier, membership_status, currentPassword, newPassword } = req.body;
    const currentUser = db.users.find(u => u.id === req.user!.id);

    if (!currentUser) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    let updatedPasswordHash = currentUser.password_hash;
    if (newPassword) {
      if (currentPassword && currentUser.password_hash) {
        const isMatch = bcrypt.compareSync(currentPassword, currentUser.password_hash);
        if (!isMatch) {
          return res.status(400).json({ success: false, error: 'Current password does not match' });
        }
      }
      updatedPasswordHash = bcrypt.hashSync(newPassword, 10);
    }

    const users = db.users.map(u => {
      if (u.id === req.user!.id) {
        return {
          ...u,
          name: name !== undefined ? name : u.name,
          phone: phone !== undefined ? phone : u.phone,
          avatar_url: avatar_url !== undefined ? avatar_url : u.avatar_url,
          membership_tier: membership_tier !== undefined ? membership_tier : u.membership_tier,
          membership_status: membership_status !== undefined ? membership_status : u.membership_status,
          password_hash: updatedPasswordHash
        };
      }
      return u;
    });

    db.users = users;
    const updated = users.find(u => u.id === req.user!.id)!;
    const { password_hash, ...safeUser } = updated;

    res.json({
      success: true,
      data: safeUser
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getPlans = async (req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      data: db.membership_plans
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};
