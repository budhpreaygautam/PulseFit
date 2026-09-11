import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/database.js';
import { GymClass } from '../types/index.js';

export const getClasses = async (req: Request, res: Response) => {
  try {
    const { day, category, trainerId, intensity, search } = req.query;
    let classes = [...db.classes];

    if (day !== undefined && day !== '') {
      classes = classes.filter(c => c.day_of_week === parseInt(day as string, 10));
    }

    if (category && category !== 'All') {
      classes = classes.filter(c => c.category.toLowerCase() === (category as string).toLowerCase());
    }

    if (trainerId) {
      classes = classes.filter(c => c.trainer_id === trainerId);
    }

    if (intensity && intensity !== 'All') {
      classes = classes.filter(c => c.intensity.toLowerCase() === (intensity as string).toLowerCase());
    }

    if (search) {
      const q = (search as string).toLowerCase();
      classes = classes.filter(c =>
        c.title.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        (c.trainer_name && c.trainer_name.toLowerCase().includes(q)) ||
        c.room.toLowerCase().includes(q)
      );
    }

    // Sort by day_of_week then start_time
    classes.sort((a, b) => {
      if (a.day_of_week !== b.day_of_week) return a.day_of_week - b.day_of_week;
      return a.start_time.localeCompare(b.start_time);
    });

    res.json({
      success: true,
      data: classes
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getClassById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const gymClass = db.classes.find(c => c.id === id);

    if (!gymClass) {
      return res.status(404).json({ success: false, error: 'Class not found' });
    }

    const trainer = db.trainers.find(t => t.id === gymClass.trainer_id);

    res.json({
      success: true,
      data: {
        ...gymClass,
        trainer
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const createClass = async (req: Request, res: Response) => {
  try {
    const {
      title,
      category,
      trainer_id,
      day_of_week,
      start_time,
      duration_minutes = 45,
      room,
      capacity = 20,
      intensity = 'High',
      description,
      image_url,
      calories_burn_est = 500
    } = req.body;

    if (!title || !category || !trainer_id || day_of_week === undefined || !start_time || !room) {
      return res.status(400).json({ success: false, error: 'Missing required class fields' });
    }

    const trainer = db.trainers.find(t => t.id === trainer_id);

    const newClass: GymClass = {
      id: `cls_${uuidv4().substring(0, 8)}`,
      title,
      category,
      trainer_id,
      trainer_name: trainer ? trainer.name : 'Pulse Coach',
      trainer_avatar: trainer ? trainer.avatar_url : undefined,
      day_of_week: Number(day_of_week),
      start_time,
      duration_minutes: Number(duration_minutes),
      room,
      capacity: Number(capacity),
      booked_count: 0,
      intensity,
      calories_burn_est: Number(calories_burn_est),
      description: description || 'High-energy fitness session at PulseFit.',
      image_url: image_url || 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=600&auto=format&fit=crop&q=80'
    };

    db.classes = [...db.classes, newClass];

    res.status(201).json({
      success: true,
      data: newClass
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const updateClass = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const existing = db.classes.find(c => c.id === id);

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Class not found' });
    }

    const updates = req.body;
    let trainerName = existing.trainer_name;
    let trainerAvatar = existing.trainer_avatar;

    if (updates.trainer_id && updates.trainer_id !== existing.trainer_id) {
      const trn = db.trainers.find(t => t.id === updates.trainer_id);
      if (trn) {
        trainerName = trn.name;
        trainerAvatar = trn.avatar_url;
      }
    }

    const updatedClasses = db.classes.map(c => {
      if (c.id === id) {
        return {
          ...c,
          ...updates,
          trainer_name: trainerName,
          trainer_avatar: trainerAvatar,
          day_of_week: updates.day_of_week !== undefined ? Number(updates.day_of_week) : c.day_of_week,
          duration_minutes: updates.duration_minutes !== undefined ? Number(updates.duration_minutes) : c.duration_minutes,
          capacity: updates.capacity !== undefined ? Number(updates.capacity) : c.capacity,
          calories_burn_est: updates.calories_burn_est !== undefined ? Number(updates.calories_burn_est) : c.calories_burn_est
        };
      }
      return c;
    });

    db.classes = updatedClasses;
    const updated = updatedClasses.find(c => c.id === id);

    res.json({
      success: true,
      data: updated
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const deleteClass = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const existing = db.classes.find(c => c.id === id);

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Class not found' });
    }

    db.classes = db.classes.filter(c => c.id !== id);
    // Also remove associated bookings
    db.bookings = db.bookings.filter(b => b.class_id !== id);

    res.json({
      success: true,
      message: 'Class deleted successfully'
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};
