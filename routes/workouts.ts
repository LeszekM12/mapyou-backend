// ─── WORKOUTS ROUTER ─────────────────────────────────────────────────────────
import { Router, Request, Response } from 'express';
import { Workout } from '../models/Workout.js';

export const workoutsRouter = Router();

// GET /workouts?userId=xxx
workoutsRouter.get('/', async (req: Request, res: Response) => {
  const { userId } = req.query;
  if (!userId) return void res.status(400).json({ status: 'error', message: 'userId required' });
  const workouts = await Workout.find({ userId }).sort({ date: -1 });
  res.json({ status: 'ok', count: workouts.length, data: workouts });
});

// GET /workouts/:id?userId=xxx
workoutsRouter.get('/:id', async (req: Request, res: Response) => {
  const w = await Workout.findOne({ workoutId: req.params.id, userId: req.query.userId });
  if (!w) return void res.status(404).json({ status: 'error', message: 'Not found' });
  res.json({ status: 'ok', data: w });
});

// POST /workouts
workoutsRouter.post('/', async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  if (!body.userId || !body.workoutId) {
    return void res.status(400).json({ status: 'error', message: 'userId and workoutId required' });
  }
  try {
    const w = await Workout.findOneAndUpdate(
      { workoutId: body.workoutId as string, userId: body.userId as string },
      { ...body, syncedAt: new Date() },
      { upsert: true, new: true },
    );
    res.status(201).json({ status: 'ok', data: w });
  } catch (err) {
    res.status(500).json({ status: 'error', message: String(err) });
  }
});

// PUT /workouts/:id
workoutsRouter.put('/:id', async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const w = await Workout.findOneAndUpdate(
    { workoutId: req.params.id, userId: body.userId },
    { ...body, syncedAt: new Date() },
    { new: true },
  );
  if (!w) return void res.status(404).json({ status: 'error', message: 'Not found' });
  res.json({ status: 'ok', data: w });
});

// DELETE /workouts/:id?userId=xxx
workoutsRouter.delete('/:id', async (req: Request, res: Response) => {
  const r = await Workout.deleteOne({ workoutId: req.params.id, userId: req.query.userId });
  if (!r.deletedCount) return void res.status(404).json({ status: 'error', message: 'Not found' });
  res.json({ status: 'ok', message: 'Deleted' });
});

// POST /workouts/bulk — migracja wszystkich workoutów naraz
workoutsRouter.post('/bulk', async (req: Request, res: Response) => {
  const { userId, items } = req.body as { userId: string; items: Record<string, unknown>[] };
  if (!userId || !Array.isArray(items)) {
    return void res.status(400).json({ status: 'error', message: 'userId and items[] required' });
  }
  const ops = items.map(item => ({
    updateOne: {
      filter: { workoutId: item.workoutId ?? item.id, userId },
      update: { $set: { ...item, workoutId: item.workoutId ?? item.id, userId, syncedAt: new Date() } },
      upsert: true,
    },
  }));
  const result = await Workout.bulkWrite(ops as any[]);
  res.json({ status: 'ok', upserted: result.upsertedCount, modified: result.modifiedCount });
});
