// ─── PUSH NOTIFICATION SERVICE ───────────────────────────────────────────────
//
// KLUCZOWA ZMIANA względem starej wersji:
//
//  STARO: POST /push/send  →  wysyła do WSZYSTKICH subskrypcji (broadcast)
//  NOWO:  POST /push/notify/:userId  →  wysyła TYLKO do urządzeń danego userId
//
// Nowe endpointy:
//   POST /push/subscribe          — zapis subskrypcji z userId + deviceId
//   POST /push/unsubscribe        — usunięcie subskrypcji
//   POST /push/notify/:userId     — powiadomienie TYLKO tego użytkownika
//   POST /push/send               — zachowany dla kompatybilności (wymaga userId)
//   GET  /push/vapid-public-key   — frontend pobiera klucz VAPID
//   GET  /push/subscriptions      — diagnostyka (liczba subskrypcji)

import webpush from 'web-push';
import { Router, Request, Response } from 'express';
import { db } from './memoryDB.js';
import { PushSubscriptionRecord, PushPayload } from './Workout.js';

// ── VAPID setup ───────────────────────────────────────────────────────────────

let vapidPublicKey:  string;
let vapidPrivateKey: string;

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  vapidPublicKey  = process.env.VAPID_PUBLIC_KEY;
  vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  console.log('[Push] VAPID keys loaded from environment.');
} else {
  const keys = webpush.generateVAPIDKeys();
  vapidPublicKey  = keys.publicKey;
  vapidPrivateKey = keys.privateKey;
  console.warn('┌──────────────────────────────────────────────────────────────┐');
  console.warn('│  ⚠️  VAPID keys generated — zapisz je w zmiennych .env!     │');
  console.warn('├──────────────────────────────────────────────────────────────┤');
  console.warn(`│  VAPID_PUBLIC_KEY=${vapidPublicKey}`);
  console.warn(`│  VAPID_PRIVATE_KEY=${vapidPrivateKey}`);
  console.warn('└──────────────────────────────────────────────────────────────┘');
}

webpush.setVapidDetails(
  `mailto:${process.env.VAPID_EMAIL ?? 'admin@mapty.app'}`,
  vapidPublicKey,
  vapidPrivateKey,
);

// ── Pomocnicza funkcja wysyłki do listy subskrypcji ───────────────────────────

async function sendToSubscriptions(
  subscriptions: PushSubscriptionRecord[],
  payload:       PushPayload,
): Promise<{ sent: number; failed: number }> {
  if (subscriptions.length === 0) return { sent: 0, failed: 0 };

  const results = await Promise.allSettled(
    subscriptions.map(sub =>
      webpush.sendNotification(
        {
          endpoint:       sub.endpoint,
          expirationTime: sub.expirationTime ?? undefined,
          keys:           sub.keys,
        },
        JSON.stringify(payload),
      ).catch((err: { statusCode?: number }) => {
        // 410 Gone — subskrypcja wygasła, usuń automatycznie
        if (err.statusCode === 410) {
          console.log(`[Push] Removing expired subscription: ${sub.id}`);
          db.deleteSubscription(sub.id);
        }
        throw err;
      }),
    ),
  );

  const sent   = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;
  return { sent, failed };
}

// ── Router ────────────────────────────────────────────────────────────────────

export const pushRouter = Router();

// ── GET /push/vapid-public-key ────────────────────────────────────────────────

pushRouter.get('/vapid-public-key', (_req: Request, res: Response) => {
  res.json({ status: 'ok', publicKey: vapidPublicKey });
});

// ── POST /push/subscribe ──────────────────────────────────────────────────────
//
// Body: {
//   userId:   string   — UUID użytkownika (generowany na frontendzie, localStorage)
//   deviceId: string   — UUID urządzenia  (generowany na frontendzie, localStorage)
//   endpoint: string
//   expirationTime: number | null
//   keys: { p256dh: string; auth: string }
// }

pushRouter.post('/subscribe', (req: Request, res: Response) => {
  const body = req.body as {
    userId?:         string;
    deviceId?:       string;
    endpoint?:       string;
    expirationTime?: number | null;
    keys?: { p256dh?: string; auth?: string };
  };

  // Walidacja
  if (!body.userId || typeof body.userId !== 'string' || body.userId.length < 8) {
    res.status(400).json({ status: 'error', message: 'Missing or invalid userId' });
    return;
  }
  if (!body.deviceId || typeof body.deviceId !== 'string' || body.deviceId.length < 8) {
    res.status(400).json({ status: 'error', message: 'Missing or invalid deviceId' });
    return;
  }
  if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    res.status(400).json({ status: 'error', message: 'Missing endpoint or keys' });
    return;
  }

  // Sprawdź czy ten endpoint jest już przypisany innemu użytkownikowi
  const byEndpoint = db.getSubscriptionByEndpoint(body.endpoint);
  if (byEndpoint && byEndpoint.userId !== body.userId) {
    // Inny userId na tym samym endpointcie — usuń stary wpis (urządzenie zmieniło użytkownika)
    console.log(`[Push] Endpoint belonged to different userId — removing old record`);
    db.deleteSubscriptionByEndpoint(body.endpoint);
  }

  const record: PushSubscriptionRecord = {
    id:             `${body.userId}:${body.deviceId}`,
    userId:         body.userId,
    deviceId:       body.deviceId,
    endpoint:       body.endpoint,
    expirationTime: body.expirationTime ?? null,
    keys: {
      p256dh: body.keys.p256dh,
      auth:   body.keys.auth,
    },
    createdAt: new Date().toISOString(),
  };

  // saveSubscription robi upsert — nie tworzy duplikatów
  const saved = db.saveSubscription(record);
  console.log(`[Push] Subscription saved: userId=${body.userId} deviceId=${body.deviceId}`);
  res.status(201).json({ status: 'ok', message: 'Subscribed', id: saved.id });
});

// ── POST /push/unsubscribe ────────────────────────────────────────────────────
//
// Body: { endpoint: string }  LUB  { userId: string, deviceId: string }

pushRouter.post('/unsubscribe', (req: Request, res: Response) => {
  const body = req.body as {
    endpoint?: string;
    userId?:   string;
    deviceId?: string;
  };

  let deleted = false;

  if (body.endpoint) {
    deleted = db.deleteSubscriptionByEndpoint(body.endpoint);
  } else if (body.userId && body.deviceId) {
    deleted = db.deleteSubscription(`${body.userId}:${body.deviceId}`);
  } else {
    res.status(400).json({ status: 'error', message: 'Provide endpoint or userId+deviceId' });
    return;
  }

  if (!deleted) {
    res.status(404).json({ status: 'error', message: 'Subscription not found' });
    return;
  }

  res.json({ status: 'ok', message: 'Unsubscribed' });
});

// ── POST /push/notify/:userId ─────────────────────────────────────────────────
//
// Wysyła powiadomienie TYLKO do urządzeń konkretnego użytkownika.
// To jest główny endpoint używany przez frontend po każdej akcji.
//
// Body: { title: string; body: string; icon?: string; url?: string }

pushRouter.post('/notify/:userId', async (req: Request, res: Response) => {
  const { userId } = req.params;
  const body = req.body as Partial<PushPayload>;

  if (!body.title || !body.body) {
    res.status(400).json({ status: 'error', message: 'Missing title or body' });
    return;
  }

  // Pobierz TYLKO subskrypcje tego użytkownika
  const subscriptions = db.getSubscriptionsByUserId(userId);

  if (subscriptions.length === 0) {
    console.log(`[Push] No subscriptions for userId=${userId}`);
    res.json({ status: 'ok', message: 'No subscriptions for this user', sent: 0 });
    return;
  }

  const payload: PushPayload = {
    title: body.title,
    body:  body.body,
    icon:  body.icon  ?? '/icon-192.png',
    badge: body.badge ?? '/icon-192.png',
    url:   body.url   ?? '/',
  };

  const { sent, failed } = await sendToSubscriptions(subscriptions, payload);

  console.log(`[Push] notify userId=${userId}: sent=${sent}, failed=${failed}, devices=${subscriptions.length}`);
  res.json({
    status:  'ok',
    message: `Sent to ${sent}/${subscriptions.length} devices`,
    sent,
    failed,
  });
});

// ── POST /push/send ───────────────────────────────────────────────────────────
//
// Zaktualizowana wersja starego endpointu.
// WYMAGA teraz pola userId — nie robi już broadcastu do wszystkich.
// Zachowany dla kompatybilności z istniejącym kodem frontendu.
//
// Body: { userId: string; title: string; body: string; ... }

pushRouter.post('/send', async (req: Request, res: Response) => {
  const body = req.body as Partial<PushPayload> & { userId?: string };

  if (!body.userId) {
    res.status(400).json({
      status:  'error',
      message: 'userId is required. Use /push/notify/:userId instead.',
    });
    return;
  }
  if (!body.title || !body.body) {
    res.status(400).json({ status: 'error', message: 'Missing title or body' });
    return;
  }

  const subscriptions = db.getSubscriptionsByUserId(body.userId);
  if (subscriptions.length === 0) {
    res.json({ status: 'ok', message: 'No subscriptions for this user', sent: 0 });
    return;
  }

  const payload: PushPayload = {
    title: body.title,
    body:  body.body,
    icon:  body.icon  ?? '/icon-192.png',
    badge: body.badge ?? '/icon-192.png',
    url:   body.url   ?? '/',
  };

  const { sent, failed } = await sendToSubscriptions(subscriptions, payload);

  console.log(`[Push] /send userId=${body.userId}: sent=${sent}, failed=${failed}`);
  res.json({
    status:  'ok',
    message: `Sent to ${sent}/${subscriptions.length} devices`,
    sent,
    failed,
  });
});

// ── GET /push/subscriptions — diagnostyka ─────────────────────────────────────

pushRouter.get('/subscriptions', (_req: Request, res: Response) => {
  const all = db.getAllSubscriptions();
  // Grupuj po userId żeby zobaczyć ile urządzeń ma każdy użytkownik
  const byUser: Record<string, number> = {};
  for (const sub of all) {
    byUser[sub.userId] = (byUser[sub.userId] ?? 0) + 1;
  }
  res.json({
    status:      'ok',
    totalCount:  all.length,
    byUser,
  });
});
