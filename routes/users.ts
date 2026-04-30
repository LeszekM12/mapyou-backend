// ─── USERS ROUTER ────────────────────────────────────────────────────────────
import { Router, Request, Response } from 'express';
import { User } from '../models/User.js';

export const usersRouter = Router();

// GET /users/public/:userId — publiczny profil (imię + avatar URL, bez danych prywatnych)
usersRouter.get('/public/:userId', async (req: Request, res: Response) => {
  const user = await User.findOne({ userId: req.params.userId });
  if (!user) return void res.status(404).json({ status: 'error', message: 'User not found' });
  res.json({
    status: 'ok',
    data: {
      userId:    user.userId,
      name:      user.name,
      avatarB64: user.avatarB64,
    },
  });
});

// GET /users/:userId
usersRouter.get('/:userId', async (req: Request, res: Response) => {
  const user = await User.findOne({ userId: req.params.userId });
  if (!user) return void res.status(404).json({ status: 'error', message: 'User not found' });
  res.json({ status: 'ok', data: user });
});

// POST /users — upsert (create or update)
usersRouter.post('/', async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  if (!body.userId) return void res.status(400).json({ status: 'error', message: 'userId required' });
  const user = await User.findOneAndUpdate(
    { userId: body.userId as string },
    { $set: body },
    { upsert: true, new: true },
  );
  res.status(201).json({ status: 'ok', data: user });
});

// PUT /users/:userId
usersRouter.put('/:userId', async (req: Request, res: Response) => {
  const user = await User.findOneAndUpdate(
    { userId: req.params.userId },
    { $set: req.body },
    { new: true },
  );
  if (!user) return void res.status(404).json({ status: 'error', message: 'User not found' });
  res.json({ status: 'ok', data: user });
});

// POST /users/:userId/friends/:friendId — dodaj znajomego
usersRouter.post('/:userId/friends/:friendId', async (req: Request, res: Response) => {
  const user = await User.findOneAndUpdate(
    { userId: req.params.userId },
    { $addToSet: { friends: req.params.friendId } },
    { new: true },
  );
  if (!user) return void res.status(404).json({ status: 'error', message: 'User not found' });
  res.json({ status: 'ok', data: user });
});

// DELETE /users/:userId/friends/:friendId — usuń znajomego
usersRouter.delete('/:userId/friends/:friendId', async (req: Request, res: Response) => {
  const user = await User.findOneAndUpdate(
    { userId: req.params.userId },
    { $pull: { friends: req.params.friendId } },
    { new: true },
  );
  if (!user) return void res.status(404).json({ status: 'error', message: 'User not found' });
  res.json({ status: 'ok', data: user });
});
