// ─── POSTS ROUTER ────────────────────────────────────────────────────────────
import { Router, Request, Response } from 'express';
import { Post } from '../models/Post.js';
import { User } from '../models/User.js';

export const postsRouter = Router();

// GET /posts?userId=xxx — posty użytkownika
postsRouter.get('/', async (req: Request, res: Response) => {
  const { userId } = req.query;
  if (!userId) return void res.status(400).json({ status: 'error', message: 'userId required' });
  const posts = await Post.find({ userId }).sort({ date: -1 });
  res.json({ status: 'ok', count: posts.length, data: posts });
});

// GET /posts/feed?userId=xxx — posty znajomych + własne
postsRouter.get('/feed', async (req: Request, res: Response) => {
  const { userId } = req.query;
  if (!userId) return void res.status(400).json({ status: 'error', message: 'userId required' });

  // Pobierz znajomych
  const user = await User.findOne({ userId });
  const friendIds = user?.friends ?? [];
  const allIds = [userId as string, ...friendIds];

  const posts = await Post.find({ userId: { $in: allIds } }).sort({ date: -1 }).limit(50);
  res.json({ status: 'ok', count: posts.length, data: posts });
});

// POST /posts
postsRouter.post('/', async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  if (!body.userId || !body.postId) {
    return void res.status(400).json({ status: 'error', message: 'userId and postId required' });
  }
  const post = await Post.findOneAndUpdate(
    { postId: body.postId as string, userId: body.userId as string },
    { ...body, syncedAt: new Date() },
    { upsert: true, new: true },
  );
  res.status(201).json({ status: 'ok', data: post });
});

// DELETE /posts/:id?userId=xxx
postsRouter.delete('/:id', async (req: Request, res: Response) => {
  const r = await Post.deleteOne({ postId: req.params.id, userId: req.query.userId });
  if (!r.deletedCount) return void res.status(404).json({ status: 'error', message: 'Not found' });
  res.json({ status: 'ok', message: 'Deleted' });
});

// POST /posts/bulk
postsRouter.post('/bulk', async (req: Request, res: Response) => {
  const { userId, items } = req.body as { userId: string; items: Record<string, unknown>[] };
  if (!userId || !Array.isArray(items)) {
    return void res.status(400).json({ status: 'error', message: 'userId and items[] required' });
  }
  const ops = items.map(item => ({
    updateOne: {
      filter: { postId: item.postId ?? item.id, userId },
      update: { $set: { ...item, postId: item.postId ?? item.id, userId, syncedAt: new Date() } },
      upsert: true,
    },
  }));
  const result = await Post.bulkWrite(ops as any[]);
  res.json({ status: 'ok', upserted: result.upsertedCount, modified: result.modifiedCount });
});
