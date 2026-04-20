"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pushRouter = void 0;
const web_push_1 = __importDefault(require("web-push"));
const express_1 = require("express");
const memoryDB_js_1 = require("./memoryDB.js");
// ── VAPID setup ───────────────────────────────────────────────────────────────
let vapidPublicKey;
let vapidPrivateKey;
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
    vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
    console.log('[Push] VAPID keys loaded from environment.');
}
else {
    const keys = web_push_1.default.generateVAPIDKeys();
    vapidPublicKey = keys.publicKey;
    vapidPrivateKey = keys.privateKey;
    console.warn('┌──────────────────────────────────────────────────────────────┐');
    console.warn('│  ⚠️  VAPID keys generated — zapisz je w zmiennych .env!     │');
    console.warn('├──────────────────────────────────────────────────────────────┤');
    console.warn(`│  VAPID_PUBLIC_KEY=${vapidPublicKey}`);
    console.warn(`│  VAPID_PRIVATE_KEY=${vapidPrivateKey}`);
    console.warn('└──────────────────────────────────────────────────────────────┘');
}
web_push_1.default.setVapidDetails(`mailto:${process.env.VAPID_EMAIL ?? 'admin@mapty.app'}`, vapidPublicKey, vapidPrivateKey);
// ── Pomocnicza funkcja wysyłki do listy subskrypcji ───────────────────────────
async function sendToSubscriptions(subscriptions, payload) {
    if (subscriptions.length === 0)
        return { sent: 0, failed: 0 };
    const results = await Promise.allSettled(subscriptions.map(sub => web_push_1.default.sendNotification({
        endpoint: sub.endpoint,
        expirationTime: sub.expirationTime ?? undefined,
        keys: sub.keys,
    }, JSON.stringify(payload)).catch((err) => {
        // 410 Gone — subskrypcja wygasła, usuń automatycznie
        if (err.statusCode === 410) {
            console.log(`[Push] Removing expired subscription: ${sub.id}`);
            memoryDB_js_1.db.deleteSubscription(sub.id);
        }
        throw err;
    })));
    const sent = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    return { sent, failed };
}
// ── Router ────────────────────────────────────────────────────────────────────
exports.pushRouter = (0, express_1.Router)();
// ── GET /push/vapid-public-key ────────────────────────────────────────────────
exports.pushRouter.get('/vapid-public-key', (_req, res) => {
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
exports.pushRouter.post('/subscribe', (req, res) => {
    const body = req.body;
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
    const byEndpoint = memoryDB_js_1.db.getSubscriptionByEndpoint(body.endpoint);
    if (byEndpoint && byEndpoint.userId !== body.userId) {
        // Inny userId na tym samym endpointcie — usuń stary wpis (urządzenie zmieniło użytkownika)
        console.log(`[Push] Endpoint belonged to different userId — removing old record`);
        memoryDB_js_1.db.deleteSubscriptionByEndpoint(body.endpoint);
    }
    const record = {
        id: `${body.userId}:${body.deviceId}`,
        userId: body.userId,
        deviceId: body.deviceId,
        endpoint: body.endpoint,
        expirationTime: body.expirationTime ?? null,
        keys: {
            p256dh: body.keys.p256dh,
            auth: body.keys.auth,
        },
        createdAt: new Date().toISOString(),
    };
    // saveSubscription robi upsert — nie tworzy duplikatów
    const saved = memoryDB_js_1.db.saveSubscription(record);
    console.log(`[Push] Subscription saved: userId=${body.userId} deviceId=${body.deviceId}`);
    res.status(201).json({ status: 'ok', message: 'Subscribed', id: saved.id });
});
// ── POST /push/unsubscribe ────────────────────────────────────────────────────
//
// Body: { endpoint: string }  LUB  { userId: string, deviceId: string }
exports.pushRouter.post('/unsubscribe', (req, res) => {
    const body = req.body;
    let deleted = false;
    if (body.endpoint) {
        deleted = memoryDB_js_1.db.deleteSubscriptionByEndpoint(body.endpoint);
    }
    else if (body.userId && body.deviceId) {
        deleted = memoryDB_js_1.db.deleteSubscription(`${body.userId}:${body.deviceId}`);
    }
    else {
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
exports.pushRouter.post('/notify/:userId', async (req, res) => {
    const { userId } = req.params;
    const body = req.body;
    if (!body.title || !body.body) {
        res.status(400).json({ status: 'error', message: 'Missing title or body' });
        return;
    }
    // Pobierz TYLKO subskrypcje tego użytkownika
    const subscriptions = memoryDB_js_1.db.getSubscriptionsByUserId(userId);
    if (subscriptions.length === 0) {
        console.log(`[Push] No subscriptions for userId=${userId}`);
        res.json({ status: 'ok', message: 'No subscriptions for this user', sent: 0 });
        return;
    }
    const payload = {
        title: body.title,
        body: body.body,
        icon: body.icon ?? '/icon-192.png',
        badge: body.badge ?? '/icon-192.png',
        url: body.url ?? '/',
    };
    const { sent, failed } = await sendToSubscriptions(subscriptions, payload);
    console.log(`[Push] notify userId=${userId}: sent=${sent}, failed=${failed}, devices=${subscriptions.length}`);
    res.json({
        status: 'ok',
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
exports.pushRouter.post('/send', async (req, res) => {
    const body = req.body;
    if (!body.userId) {
        res.status(400).json({
            status: 'error',
            message: 'userId is required. Use /push/notify/:userId instead.',
        });
        return;
    }
    if (!body.title || !body.body) {
        res.status(400).json({ status: 'error', message: 'Missing title or body' });
        return;
    }
    const subscriptions = memoryDB_js_1.db.getSubscriptionsByUserId(body.userId);
    if (subscriptions.length === 0) {
        res.json({ status: 'ok', message: 'No subscriptions for this user', sent: 0 });
        return;
    }
    const payload = {
        title: body.title,
        body: body.body,
        icon: body.icon ?? '/icon-192.png',
        badge: body.badge ?? '/icon-192.png',
        url: body.url ?? '/',
    };
    const { sent, failed } = await sendToSubscriptions(subscriptions, payload);
    console.log(`[Push] /send userId=${body.userId}: sent=${sent}, failed=${failed}`);
    res.json({
        status: 'ok',
        message: `Sent to ${sent}/${subscriptions.length} devices`,
        sent,
        failed,
    });
});
// ── GET /push/subscriptions — diagnostyka ─────────────────────────────────────
exports.pushRouter.get('/subscriptions', (_req, res) => {
    const all = memoryDB_js_1.db.getAllSubscriptions();
    // Grupuj po userId żeby zobaczyć ile urządzeń ma każdy użytkownik
    const byUser = {};
    for (const sub of all) {
        byUser[sub.userId] = (byUser[sub.userId] ?? 0) + 1;
    }
    res.json({
        status: 'ok',
        totalCount: all.length,
        byUser,
    });
});
//# sourceMappingURL=pushService.js.map