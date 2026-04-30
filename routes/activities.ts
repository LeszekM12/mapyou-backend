// ─── ACTIVITIES ROUTER (GPS tracked) ─────────────────────────────────────────
import { Router, Request, Response } from 'express';
import { Activity } from '../models/Activity.js';


// ── Douglas-Peucker simplification ───────────────────────────────────────────
// Redukuje liczbę punktów GPS zachowując kształt trasy
// epsilon = 0.00005 ≈ 5 metrów — niewidoczna różnica wizualnie

type Point = [number, number];

function perpendicularDistance(point: Point, lineStart: Point, lineEnd: Point): number {
  const dx = lineEnd[0] - lineStart[0];
  const dy = lineEnd[1] - lineStart[1];
  if (dx === 0 && dy === 0) {
    return Math.sqrt((point[0] - lineStart[0]) ** 2 + (point[1] - lineStart[1]) ** 2);
  }
  const t = ((point[0] - lineStart[0]) * dx + (point[1] - lineStart[1]) * dy) / (dx * dx + dy * dy);
  const nearestX = lineStart[0] + t * dx;
  const nearestY = lineStart[1] + t * dy;
  return Math.sqrt((point[0] - nearestX) ** 2 + (point[1] - nearestY) ** 2);
}

function douglasPeucker(points: Point[], epsilon: number): Point[] {
  if (points.length <= 2) return points;
  let maxDist = 0;
  let maxIdx  = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], points[0], points[points.length - 1]);
    if (d > maxDist) { maxDist = d; maxIdx = i; }
  }
  if (maxDist > epsilon) {
    const left  = douglasPeucker(points.slice(0, maxIdx + 1), epsilon);
    const right = douglasPeucker(points.slice(maxIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [points[0], points[points.length - 1]];
}

function simplifyCoords(coords: unknown): Point[] {
  if (!Array.isArray(coords) || coords.length === 0) return [];
  const pts = coords as Point[];
  if (pts.length <= 10) return pts;
  const simplified = douglasPeucker(pts, 0.00005); // ~5m tolerance
  console.log(`[Activities] coords: ${pts.length} → ${simplified.length} points`);
  return simplified;
}

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
    // Uprość trasę GPS — zachowuje kształt, drastycznie redukuje liczbę punktów
    const simplifiedCoords = simplifyCoords(body.coords);
    const item = await Activity.findOneAndUpdate(
      { activityId: body.activityId as string, userId: body.userId as string },
      { ...body, coords: simplifiedCoords, syncedAt: new Date() },
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
      update: { $set: {
        ...item,
        activityId: item.activityId ?? item.id,
        userId,
        coords: simplifyCoords(item.coords),
        syncedAt: new Date(),
      }},
      upsert: true,
    },
  }));
  const result = await Activity.bulkWrite(ops as any[]);
  res.json({ status: 'ok', upserted: result.upsertedCount, modified: result.modifiedCount });
});
