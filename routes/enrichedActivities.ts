// ─── ENRICHED ACTIVITIES ROUTER (Home feed) ──────────────────────────────────
import { Router, Request, Response } from 'express';
import { EnrichedActivity } from '../models/EnrichedActivity.js';

export const enrichedActivitiesRouter = Router();

enrichedActivitiesRouter.get('/', async (req: Request, res: Response) => {
  const { userId } = req.query;
  if (!userId) return void res.status(400).json({ status: 'error', message: 'userId required' });
  const items = await EnrichedActivity.find({ userId }).sort({ date: -1 });
  res.json({ status: 'ok', count: items.length, data: items });
});

enrichedActivitiesRouter.get('/:id', async (req: Request, res: Response) => {
  const item = await EnrichedActivity.findOne({ activityId: req.params.id, userId: req.query.userId });
  if (!item) return void res.status(404).json({ status: 'error', message: 'Not found' });
  res.json({ status: 'ok', data: item });
});

enrichedActivitiesRouter.post('/', async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  if (!body.userId || !body.activityId) {
    return void res.status(400).json({ status: 'error', message: 'userId and activityId required' });
  }
  const item = await EnrichedActivity.findOneAndUpdate(
    { activityId: body.activityId as string, userId: body.userId as string },
    { ...body, syncedAt: new Date() },
    { upsert: true, new: true },
  );
  res.status(201).json({ status: 'ok', data: item });
});

enrichedActivitiesRouter.delete('/:id', async (req: Request, res: Response) => {
  const r = await EnrichedActivity.deleteOne({ activityId: req.params.id, userId: req.query.userId });
  if (!r.deletedCount) return void res.status(404).json({ status: 'error', message: 'Not found' });
  res.json({ status: 'ok', message: 'Deleted' });
});

enrichedActivitiesRouter.post('/bulk', async (req: Request, res: Response) => {
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
  const result = await EnrichedActivity.bulkWrite(ops as any[]);
  res.json({ status: 'ok', upserted: result.upsertedCount, modified: result.modifiedCount });
});
