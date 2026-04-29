// ─── ACTIVITIES ROUTER (GPS tracked) ─────────────────────────────────────────
import { Router, Request, Response } from 'express';
import { Activity } from '../models/Activity.js';

export const activitiesRouter = Router();

// GET /activities?userId=xxx
activitiesRouter.get('/', async (req: Request, res: Response) => {
  const { userId } = req.query;
  if (!userId) return void res.status(400).json({ status: 'error', message: 'userId required' });
  const items = await Activity.find({ userId }).sort({ date: -1 });
  res.json({ status: 'ok', count: items.length, data: items });
});

// GET /activities/:id?userId=xxx
activitiesRouter.get('/:id', async (req: Request, res: Response) => {
  const item = await Activity.findOne({ activityId: req.params.id, userId: req.query.userId });
  if (!item) return void res.status(404).json({ status: 'error', message: 'Not found' });
  res.json({ status: 'ok', data: item });
});

// POST /activities
activitiesRouter.post('/', async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  if (!body.userId || !body.activityId) {
    return void res.status(400).json({ status: 'error', message: 'userId and activityId required' });
  }
  try {
    const item = await Activity.findOneAndUpdate(
      { activityId: body.activityId as string, userId: body.userId as string },
      { ...body, syncedAt: new Date() },
      { upsert: true, new: true },
    );
    res.status(201).json({ status: 'ok', data: item });
  } catch (err) {
    res.status(500).json({ status: 'error', message: String(err) });
  }
});

// DELETE /activities/:id?userId=xxx
activitiesRouter.delete('/:id', async (req: Request, res: Response) => {
  const r = await Activity.deleteOne({ activityId: req.params.id, userId: req.query.userId });
  if (!r.deletedCount) return void res.status(404).json({ status: 'error', message: 'Not found' });
  res.json({ status: 'ok', message: 'Deleted' });
});

// POST /activities/bulk — migracja
activitiesRouter.post('/bulk', async (req: Request, res: Response) => {
  const { userId, items } = req.body as { userId: string; items: Record<string, unknown>[] };
  if (!userId || !Array.isArray(items)) {
    return void res.status(400).json({ status: 'error', message: 'userId and items[] required' });
  }
  const ops = items.map(item => ({
    updateOne: {
      filter: { activityId: item.activityId ?? item.id, userId },
      update: { $set: { ...item, activityId: item.activityId ?? item.id, userId, syncedAt: new Date() } },
      upsert: true,
    },
  }));
  const result = await Activity.bulkWrite(ops as any[]);
  res.json({ status: 'ok', upserted: result.upsertedCount, modified: result.modifiedCount });
});
