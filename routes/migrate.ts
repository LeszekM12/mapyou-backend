// ─── MIGRATION ROUTER ────────────────────────────────────────────────────────
// POST /migrate — przyjmuje wszystkie dane z IndexedDB naraz i zapisuje do Atlas
// Frontend wywołuje to raz przy starcie po wznowieniu Rendera

import { Router, Request, Response } from 'express';
import { Workout }          from '../models/Workout.js';
import { Activity }         from '../models/Activity.js';
import { EnrichedActivity } from '../models/EnrichedActivity.js';
import { UnifiedWorkout }   from '../models/UnifiedWorkout.js';
import { Post }             from '../models/Post.js';
import { User }             from '../models/User.js';

export const migrateRouter = Router();

interface MigratePayload {
  userId:             string;
  workouts?:          Record<string, unknown>[];
  activities?:        Record<string, unknown>[];
  enrichedActivities?: Record<string, unknown>[];
  unifiedWorkouts?:   Record<string, unknown>[];
  posts?:             Record<string, unknown>[];
  profile?:           Record<string, unknown>;
}

// POST /migrate/bulk
migrateRouter.post('/bulk', async (req: Request, res: Response) => {
  const {
    userId,
    workouts          = [],
    activities        = [],
    enrichedActivities = [],
    unifiedWorkouts   = [],
    posts             = [],
    profile,
  } = req.body as MigratePayload;

  if (!userId) {
    return void res.status(400).json({ status: 'error', message: 'userId required' });
  }

  const summary: Record<string, number> = {};

  try {
    // Workouts
    if (workouts.length) {
      const ops = workouts.map(item => ({
        updateOne: {
          filter: { workoutId: item.workoutId ?? item.id, userId },
          update: { $set: { ...item, workoutId: item.workoutId ?? item.id, userId, syncedAt: new Date() } },
          upsert: true,
        },
      }));
      const r = await Workout.bulkWrite(ops as any[]);
      summary.workouts = r.upsertedCount + r.modifiedCount;
    }

    // Activities
    if (activities.length) {
      const ops = activities.map(item => ({
        updateOne: {
          filter: { activityId: item.activityId ?? item.id, userId },
          update: { $set: { ...item, activityId: item.activityId ?? item.id, userId, syncedAt: new Date() } },
          upsert: true,
        },
      }));
      const r = await Activity.bulkWrite(ops as any[]);
      summary.activities = r.upsertedCount + r.modifiedCount;
    }

    // EnrichedActivities
    if (enrichedActivities.length) {
      const ops = enrichedActivities.map(item => ({
        updateOne: {
          filter: { activityId: item.activityId ?? item.id, userId },
          update: { $set: { ...item, activityId: item.activityId ?? item.id, userId, syncedAt: new Date() } },
          upsert: true,
        },
      }));
      const r = await EnrichedActivity.bulkWrite(ops as any[]);
      summary.enrichedActivities = r.upsertedCount + r.modifiedCount;
    }

    // UnifiedWorkouts
    if (unifiedWorkouts.length) {
      const ops = unifiedWorkouts.map(item => ({
        updateOne: {
          filter: { workoutId: item.workoutId ?? item.id, userId },
          update: { $set: { ...item, workoutId: item.workoutId ?? item.id, userId, syncedAt: new Date() } },
          upsert: true,
        },
      }));
      const r = await UnifiedWorkout.bulkWrite(ops as any[]);
      summary.unifiedWorkouts = r.upsertedCount + r.modifiedCount;
    }

    // Posts
    if (posts.length) {
      const ops = posts.map(item => ({
        updateOne: {
          filter: { postId: item.postId ?? item.id, userId },
          update: { $set: { ...item, postId: item.postId ?? item.id, userId, syncedAt: new Date() } },
          upsert: true,
        },
      }));
      const r = await Post.bulkWrite(ops as any[]);
      summary.posts = r.upsertedCount + r.modifiedCount;
    }

    // Profile
    if (profile) {
      await User.findOneAndUpdate(
        { userId },
        { $set: { ...profile, userId } },
        { upsert: true, new: true },
      );
      summary.profile = 1;
    }

    console.log(`[Migrate] userId=${userId}:`, summary);
    res.json({ status: 'ok', message: 'Migration complete', summary });

  } catch (err) {
    console.error('[Migrate] Error:', err);
    res.status(500).json({ status: 'error', message: String(err) });
  }
});

// GET /migrate/status/:userId — sprawdź ile danych jest już w Atlas
migrateRouter.get('/status/:userId', async (req: Request, res: Response) => {
  const { userId } = req.params;
  const [w, a, e, u, p] = await Promise.all([
    Workout.countDocuments({ userId }),
    Activity.countDocuments({ userId }),
    EnrichedActivity.countDocuments({ userId }),
    UnifiedWorkout.countDocuments({ userId }),
    Post.countDocuments({ userId }),
  ]);
  res.json({
    status: 'ok',
    userId,
    counts: { workouts: w, activities: a, enrichedActivities: e, unifiedWorkouts: u, posts: p },
  });
});
