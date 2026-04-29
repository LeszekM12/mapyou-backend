// ─── UNIFIED WORKOUTS ROUTER (Stats) ─────────────────────────────────────────
import { Router, Request, Response } from 'express';
import { UnifiedWorkout } from '../models/UnifiedWorkout.js';

export const unifiedWorkoutsRouter = Router();

unifiedWorkoutsRouter.get('/', async (req: Request, res: Response) => {
  const { userId } = req.query;
  if (!userId) return void res.status(400).json({ status: 'error', message: 'userId required' });
  const items = await UnifiedWorkout.find({ userId }).sort({ date: -1 });
  res.json({ status: 'ok', count: items.length, data: items });
});

unifiedWorkoutsRouter.post('/', async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  if (!body.userId || !body.workoutId) {
    return void res.status(400).json({ status: 'error', message: 'userId and workoutId required' });
  }
  const item = await UnifiedWorkout.findOneAndUpdate(
    { workoutId: body.workoutId as string, userId: body.userId as string },
    { ...body, syncedAt: new Date() },
    { upsert: true, new: true },
  );
  res.status(201).json({ status: 'ok', data: item });
});

unifiedWorkoutsRouter.delete('/:id', async (req: Request, res: Response) => {
  const r = await UnifiedWorkout.deleteOne({ workoutId: req.params.id, userId: req.query.userId });
  if (!r.deletedCount) return void res.status(404).json({ status: 'error', message: 'Not found' });
  res.json({ status: 'ok', message: 'Deleted' });
});

unifiedWorkoutsRouter.post('/bulk', async (req: Request, res: Response) => {
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
  const result = await UnifiedWorkout.bulkWrite(ops as any[]);
  res.json({ status: 'ok', upserted: result.upsertedCount, modified: result.modifiedCount });
});
