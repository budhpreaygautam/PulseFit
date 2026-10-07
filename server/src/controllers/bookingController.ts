import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/database.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { Booking } from '../types/index.js';

export const getMyBookings = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const userBookings = db.bookings
      .filter(b => b.user_id === req.user!.id && b.status === 'confirmed')
      .map(b => {
        const cls = db.classes.find(c => c.id === b.class_id);
        return {
          ...b,
          class_title: cls ? cls.title : b.class_title,
          category: cls ? cls.category : b.category,
          start_time: cls ? cls.start_time : b.start_time,
          room: cls ? cls.room : b.room,
          trainer_name: cls ? cls.trainer_name : b.trainer_name,
          image_url: cls ? cls.image_url : undefined,
          duration_minutes: cls ? cls.duration_minutes : 45
        };
      });

    // Sort by booking_date then start_time
    userBookings.sort((a, b) => {
      const dateCmp = a.booking_date.localeCompare(b.booking_date);
      if (dateCmp !== 0) return dateCmp;
      return (a.start_time || '').localeCompare(b.start_time || '');
    });

    res.json({
      success: true,
      data: userBookings
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const createBooking = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { class_id, booking_date } = req.body;
    if (!class_id || !booking_date) {
      return res.status(400).json({ success: false, error: 'class_id and booking_date are required' });
    }

    // Check membership status
    if (req.user.membership_status !== 'active') {
      return res.status(403).json({
        success: false,
        error: 'Your membership is not active. Please renew your plan to book classes.'
      });
    }

    const gymClass = db.classes.find(c => c.id === class_id);
    if (!gymClass) {
      return res.status(404).json({ success: false, error: 'Class not found' });
    }

    // Check capacity
    if ((gymClass.booked_count ?? 0) >= gymClass.capacity) {
      return res.status(400).json({ success: false, error: 'Class is completely full' });
    }

    // Check if already booked for this date
    const existing = db.bookings.find(
      b => b.class_id === class_id && b.user_id === req.user!.id && b.booking_date === booking_date && b.status === 'confirmed'
    );
    if (existing) {
      return res.status(400).json({ success: false, error: 'You are already registered for this class on this date' });
    }

    const newBooking: Booking = {
      id: `bk_${uuidv4().substring(0, 8)}`,
      class_id,
      user_id: req.user.id,
      booking_date,
      status: 'confirmed',
      created_at: new Date().toISOString(),
      class_title: gymClass.title,
      category: gymClass.category,
      start_time: gymClass.start_time,
      room: gymClass.room,
      trainer_name: gymClass.trainer_name
    };

    // Update bookings
    db.bookings = [...db.bookings, newBooking];

    // Increment class booked count
    db.classes = db.classes.map(c => {
      if (c.id === class_id) {
        return { ...c, booked_count: (c.booked_count ?? 0) + 1 };
      }
      return c;
    });

    res.status(201).json({
      success: true,
      data: newBooking
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const cancelBooking = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { id } = req.params;
    const booking = db.bookings.find(b => b.id === id);

    if (!booking) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }

    // Must be own booking or admin
    if (booking.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Unauthorized to cancel this booking' });
    }

    // Remove or set status cancelled
    db.bookings = db.bookings.filter(b => b.id !== id);

    // Decrement class booked count
    db.classes = db.classes.map(c => {
      if (c.id === booking.class_id && (c.booked_count ?? 0) > 0) {
        return { ...c, booked_count: (c.booked_count ?? 0) - 1 };
      }
      return c;
    });

    res.json({
      success: true,
      message: 'Booking cancelled successfully'
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getClassRoster = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { classId } = req.params;
    const bookings = db.bookings.filter(b => b.class_id === classId && b.status === 'confirmed');

    const roster = bookings.map(b => {
      const user = db.users.find(u => u.id === b.user_id);
      return {
        booking_id: b.id,
        user_id: b.user_id,
        booking_date: b.booking_date,
        user_name: user ? user.name : 'Unknown',
        user_email: user ? user.email : 'Unknown',
        user_tier: user ? user.membership_tier : 'basic',
        user_avatar: user ? user.avatar_url : undefined
      };
    });

    res.json({
      success: true,
      data: roster
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};
