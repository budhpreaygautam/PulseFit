import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/database.js';
import { Trainer } from '../types/index.js';

export const getTrainers = async (req: Request, res: Response) => {
  try {
    const trainers = db.trainers.map(t => {
      const assignedClasses = db.classes.filter(c => c.trainer_id === t.id);
      return {
        ...t,
        classes_count: assignedClasses.length
      };
    });

    res.json({
      success: true,
      data: trainers
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getTrainerById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const trainer = db.trainers.find(t => t.id === id);

    if (!trainer) {
      return res.status(404).json({ success: false, error: 'Trainer not found' });
    }

    const classes = db.classes.filter(c => c.trainer_id === id);

    res.json({
      success: true,
      data: {
        ...trainer,
        classes
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const createTrainer = async (req: Request, res: Response) => {
  try {
    const { name, email, phone, specialties = [], bio, experience_years = 5, avatar_url, instagram } = req.body;

    if (!name || !email || !bio) {
      return res.status(400).json({ success: false, error: 'Name, email, and bio are required' });
    }

    const newTrainer: Trainer = {
      id: `trn_${uuidv4().substring(0, 8)}`,
      name,
      email,
      phone: phone || '+1 (555) 000-0000',
      specialties: Array.isArray(specialties) ? specialties : [specialties],
      bio,
      experience_years: Number(experience_years),
      rating: 5.0,
      reviews_count: 1,
      avatar_url: avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80',
      instagram: instagram || '@pulsefit'
    };

    db.trainers = [...db.trainers, newTrainer];

    res.status(201).json({
      success: true,
      data: newTrainer
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const updateTrainer = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const existing = db.trainers.find(t => t.id === id);

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Trainer not found' });
    }

    const updates = req.body;
    const updatedTrainers = db.trainers.map(t => {
      if (t.id === id) {
        return {
          ...t,
          ...updates,
          specialties: updates.specialties ? (Array.isArray(updates.specialties) ? updates.specialties : [updates.specialties]) : t.specialties,
          experience_years: updates.experience_years !== undefined ? Number(updates.experience_years) : t.experience_years
        };
      }
      return t;
    });

    db.trainers = updatedTrainers;
    const updated = updatedTrainers.find(t => t.id === id);

    // Also update trainer names in classes
    if (updates.name) {
      db.classes = db.classes.map(c => {
        if (c.trainer_id === id) {
          return { ...c, trainer_name: updates.name };
        }
        return c;
      });
    }

    res.json({
      success: true,
      data: updated
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const deleteTrainer = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const existing = db.trainers.find(t => t.id === id);

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Trainer not found' });
    }

    db.trainers = db.trainers.filter(t => t.id !== id);

    res.json({
      success: true,
      message: 'Trainer removed successfully'
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};
