// ─── LIVE TRACKING ROUTER ────────────────────────────────────────────────────
// liveTracking.ts — Backend (Node.js + Express)
//
// Przechowuje sesje live-trackingu w pamięci (Map).
// Automatycznie czyści zakończone sesje po 30 min.
// Nie wymaga bazy danych ani logowania.

import { Router, Request, Response } from 'express';
import webpush from 'web-push';

export const liveRouter = Router();

// ── Typy ─────────────────────────────────────────────────────────────────────

export type SessionStatus = 'running' | 'paused' | 'finished';

export interface PositionPoint {
  lat:       number;
  lng:       number;
  speed:     number;   // km/h
  timestamp: number;   // Unix ms
}

export interface LiveSession {
  token:      string;
  userName:   string;
  status:     SessionStatus;
  startedAt:  number;
  updatedAt:  number;
  current:    PositionPoint | null;
  history:    PositionPoint[];
  // Subskrypcje znajomych do których wysłano push przy starcie
  notifiedSubs: string[];
}

// ── In-memory store ───────────────────────────────────────────────────────────

const sessions = new Map<string, LiveSession>();

// Czyść zakończone sesje po 30 min
const CLEANUP_AFTER_MS = 30 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of sessions.entries()) {
    if (
      session.status === 'finished' &&
      now - session.updatedAt > CLEANUP_AFTER_MS
    ) {
      sessions.delete(token);
      console.log(`[Live] Cleaned up session: ${token}`);
    }
  }
}, 5 * 60 * 1000);

// ── VAPID helper (reuse from pushService if available) ────────────────────────
// Zakładamy że webpush.setVapidDetails() jest już wywołane w głównym index.ts

// ── POST /live/start ─────────────────────────────────────────────────────────
// Tworzy sesję i opcjonalnie wysyła push do znajomych
//
// Body: {
//   token:       string
//   userName:    string
//   liveUrl:     string          — pełny link do live trackingu
//   friendSubs:  PushSubscription[]  — subskrypcje znajomych
// }

liveRouter.post('/start', async (req: Request, res: Response) => {
  const { token, userName, liveUrl, friendSubs } = req.body as {
    token:      string;
    userName:   string;
    liveUrl:    string;
    friendSubs: Array<{
      endpoint: string;
      expirationTime: number | null;
      keys: { p256dh: string; auth: string };
    }>;
  };

  if (!token || !userName) {
    res.status(400).json({ status: 'error', message: 'Missing token or userName' });
    return;
  }

  // Utwórz sesję
  const session: LiveSession = {
    token,
    userName,
    status:       'running',
    startedAt:    Date.now(),
    updatedAt:    Date.now(),
    current:      null,
    history:      [],
    notifiedSubs: [],
  };
  sessions.set(token, session);
  console.log(`[Live] Session started: ${token} by ${userName}`);

  // Wyślij push do znajomych (jeśli podano subskrypcje)
  if (Array.isArray(friendSubs) && friendSubs.length > 0) {
    const payload = JSON.stringify({
      title: `🏃 ${userName} started a workout!`,
      body:  'Tap to watch the live route.',
      url:   liveUrl ?? '/',
      icon:  '/public/icon-192.png',
    });

    const results = await Promise.allSettled(
      friendSubs.map(sub =>
        webpush.sendNotification(
          { endpoint: sub.endpoint, expirationTime: sub.expirationTime ?? undefined, keys: sub.keys },
          payload,
        )
      )
    );

    const sent = results.filter(r => r.status === 'fulfilled').length;
    session.notifiedSubs = friendSubs.map(s => s.endpoint);
    console.log(`[Live] Push sent to ${sent}/${friendSubs.length} friends`);
  }

  res.status(201).json({ status: 'ok', token, message: 'Session started' });
});

// ── POST /live/update ─────────────────────────────────────────────────────────
// Aktualizuje pozycję w istniejącej sesji
//
// Body: { token, lat, lng, speed, timestamp }

liveRouter.post('/update', (req: Request, res: Response) => {
  const { token, lat, lng, speed, timestamp } = req.body as {
    token:     string;
    lat:       number;
    lng:       number;
    speed:     number;
    timestamp: number;
  };

  const session = sessions.get(token);
  if (!session) {
    res.status(404).json({ status: 'error', message: 'Session not found' });
    return;
  }
  if (session.status === 'finished') {
    res.status(409).json({ status: 'error', message: 'Session already finished' });
    return;
  }

  const point: PositionPoint = { lat, lng, speed: speed ?? 0, timestamp: timestamp ?? Date.now() };
  session.current  = point;
  session.updatedAt = Date.now();
  session.history.push(point);

  // Ogranicz historię do 10 000 punktów
  if (session.history.length > 10_000) session.history.shift();

  res.json({ status: 'ok' });
});

// ── GET /live/:token ──────────────────────────────────────────────────────────
// Zwraca pełny stan sesji (dla odbiorcy oglądającego trasę)

liveRouter.get('/:token', (req: Request, res: Response) => {
  const session = sessions.get(req.params.token);
  if (!session) {
    res.status(404).json({ status: 'error', message: 'Session not found or expired' });
    return;
  }

  res.json({
    status:    'ok',
    token:     session.token,
    userName:  session.userName,
    session:   session.status,
    startedAt: session.startedAt,
    updatedAt: session.updatedAt,
    current:   session.current,
    history:   session.history,
  });
});

// ── GET /live/status/:token ───────────────────────────────────────────────────
// Lekki endpoint — tylko status (dla pollingu co 30-60s)

liveRouter.get('/status/:token', (req: Request, res: Response) => {
  const session = sessions.get(req.params.token);
  if (!session) {
    res.json({ status: 'ok', session: 'not_found' });
    return;
  }

  res.json({
    status:    'ok',
    session:   session.status,
    userName:  session.userName,
    updatedAt: session.updatedAt,
  });
});

// ── POST /live/pause ──────────────────────────────────────────────────────────

liveRouter.post('/pause', (req: Request, res: Response) => {
  const { token } = req.body as { token: string };
  const session = sessions.get(token);
  if (!session || session.status === 'finished') {
    res.status(404).json({ status: 'error', message: 'Session not found or finished' });
    return;
  }
  session.status    = 'paused';
  session.updatedAt = Date.now();
  res.json({ status: 'ok' });
});

// ── POST /live/resume ─────────────────────────────────────────────────────────

liveRouter.post('/resume', (req: Request, res: Response) => {
  const { token } = req.body as { token: string };
  const session = sessions.get(token);
  if (!session || session.status === 'finished') {
    res.status(404).json({ status: 'error', message: 'Session not found or finished' });
    return;
  }
  session.status    = 'running';
  session.updatedAt = Date.now();
  res.json({ status: 'ok' });
});

// ── POST /live/finish ─────────────────────────────────────────────────────────

liveRouter.post('/finish', (req: Request, res: Response) => {
  const { token } = req.body as { token: string };
  const session = sessions.get(token);
  if (!session) {
    res.status(404).json({ status: 'error', message: 'Session not found' });
    return;
  }
  session.status    = 'finished';
  session.updatedAt = Date.now();
  console.log(`[Live] Session finished: ${token}`);
  res.json({ status: 'ok', message: 'Session finished' });
});

// ── GET /live (diagnostics) ───────────────────────────────────────────────────

liveRouter.get('/', (_req: Request, res: Response) => {
  const active = [...sessions.values()].filter(s => s.status !== 'finished').length;
  res.json({ status: 'ok', totalSessions: sessions.size, activeSessions: active });
});
