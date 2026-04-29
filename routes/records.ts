// ─── PERSONAL RECORDS ROUTER ─────────────────────────────────────────────────
import { Router, Request, Response } from 'express';
import { PersonalRecord } from '../models/PersonalRecord.js';

export const recordsRouter = Router();

// GET /records/:userId
recordsRouter.get('/:userId', async (req: Request, res: Response) => {
  const r = await PersonalRecord.findOne({ userId: req.params.userId });
  if (!r) {
    // Zwróć pusty rekord zamiast 404 — wygodniejsze dla frontu
    return void res.json({
      status: 'ok',
      data: { userId: req.params.userId, best5k: null, best10k: null,
        bestHalfMarathon: null, bestMarathon: null, longestRun: null,
        longestRide: null, bestStreak: 0, weeklyGoalWins: 0,
        totalWorkouts: 0, totalDistanceKm: 0 },
    });
  }
  res.json({ status: 'ok', data: r });
});

// PUT /records/:userId — upsert
recordsRouter.put('/:userId', async (req: Request, res: Response) => {
  const r = await PersonalRecord.findOneAndUpdate(
    { userId: req.params.userId },
    { $set: { ...req.body, userId: req.params.userId } },
    { upsert: true, new: true },
  );
  res.json({ status: 'ok', data: r });
});

// POST /records/:userId/streak — inkrementuj streak
recordsRouter.post('/:userId/streak', async (req: Request, res: Response) => {
  const { value } = req.body as { value?: number };
  const r = await PersonalRecord.findOneAndUpdate(
    { userId: req.params.userId },
    {
      $max: { bestStreak: value ?? 1 },
      $inc: { totalWorkouts: 1 },
    },
    { upsert: true, new: true },
  );
  res.json({ status: 'ok', data: r });
});

// POST /records/:userId/weekly-goal-win — inkrementuj tygodniowe cele
recordsRouter.post('/:userId/weekly-goal-win', async (req: Request, res: Response) => {
  const r = await PersonalRecord.findOneAndUpdate(
    { userId: req.params.userId },
    { $inc: { weeklyGoalWins: 1 } },
    { upsert: true, new: true },
  );
  res.json({ status: 'ok', data: r });
});
