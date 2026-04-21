"use strict";
// ─── LIVE TRACKING ROUTER ────────────────────────────────────────────────────
// liveTracking.ts — Backend (Node.js + Express)
//
// Przechowuje sesje live-trackingu w pamięci (Map).
// Automatycznie czyści zakończone sesje po 30 min.
// Nie wymaga bazy danych ani logowania.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.liveRouter = void 0;
const express_1 = require("express");
const web_push_1 = __importDefault(require("web-push"));
exports.liveRouter = (0, express_1.Router)();
// ── In-memory store ───────────────────────────────────────────────────────────
const sessions = new Map();
// Mapa endpoint → token — pozwala znajomemu znaleźć aktywną sesję
// po endpointcie swojej pushSub którą wysłał właściciel treningu
const endpointToToken = new Map();
// Czyść zakończone sesje po 30 min
const CLEANUP_AFTER_MS = 30 * 60 * 1000;
setInterval(() => {
    const now = Date.now();
    for (const [token, session] of sessions.entries()) {
        if (session.status === 'finished' &&
            now - session.updatedAt > CLEANUP_AFTER_MS) {
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
exports.liveRouter.post('/start', async (req, res) => {
    const { token, userName, liveUrl, friendSubs } = req.body;
    if (!token || !userName) {
        res.status(400).json({ status: 'error', message: 'Missing token or userName' });
        return;
    }
    // Utwórz sesję
    const session = {
        token,
        userName,
        status: 'running',
        startedAt: Date.now(),
        updatedAt: Date.now(),
        current: null,
        history: [],
        notifiedSubs: [],
    };
    sessions.set(token, session);
    console.log(`[Live] Session started: ${token} by ${userName}`);
    // Wyślij push do znajomych (jeśli podano subskrypcje)
    if (Array.isArray(friendSubs) && friendSubs.length > 0) {
        const payload = JSON.stringify({
            title: `🏃 ${userName} started a workout!`,
            body: 'Tap to watch the live route.',
            url: liveUrl ?? '/',
            icon: '/public/icon-192.png',
        });
        const results = await Promise.allSettled(friendSubs.map(sub => web_push_1.default.sendNotification({ endpoint: sub.endpoint, expirationTime: sub.expirationTime ?? undefined, keys: sub.keys }, payload)));
        const sent = results.filter(r => r.status === 'fulfilled').length;
        session.notifiedSubs = friendSubs.map(s => s.endpoint);
        console.log(`[Live] Push sent to ${sent}/${friendSubs.length} friends`);
    }
    // Zapisz mapowanie endpoint → token dla każdego znajomego
    if (Array.isArray(friendSubs)) {
        for (const sub of friendSubs) {
            endpointToToken.set(sub.endpoint, token);
        }
    }
    res.status(201).json({ status: 'ok', token, message: 'Session started' });
});
// ── POST /live/update ─────────────────────────────────────────────────────────
// Aktualizuje pozycję w istniejącej sesji
//
// Body: { token, lat, lng, speed, timestamp }
exports.liveRouter.post('/update', (req, res) => {
    const { token, lat, lng, speed, timestamp } = req.body;
    const session = sessions.get(token);
    if (!session) {
        res.status(404).json({ status: 'error', message: 'Session not found' });
        return;
    }
    if (session.status === 'finished') {
        res.status(409).json({ status: 'error', message: 'Session already finished' });
        return;
    }
    const point = { lat, lng, speed: speed ?? 0, timestamp: timestamp ?? Date.now() };
    session.current = point;
    session.updatedAt = Date.now();
    session.history.push(point);
    // Ogranicz historię do 10 000 punktów
    if (session.history.length > 10000)
        session.history.shift();
    res.json({ status: 'ok' });
});
// ── GET /live/:token ──────────────────────────────────────────────────────────
// Zwraca pełny stan sesji (dla odbiorcy oglądającego trasę)
exports.liveRouter.get('/status/:token', (req, res) => {
    const session = sessions.get(req.params.token);
    if (!session) {
        res.status(404).json({ status: 'error', message: 'Session not found or expired' });
        return;
    }
    res.json({
        status: 'ok',
        token: session.token,
        userName: session.userName,
        session: session.status,
        startedAt: session.startedAt,
        updatedAt: session.updatedAt,
        current: session.current,
        history: session.history,
    });
});
// ── GET /live/status/:token ───────────────────────────────────────────────────
// Lekki endpoint — tylko status (dla pollingu co 30-60s)
exports.liveRouter.get('/:token', (req, res) => {
    const session = sessions.get(req.params.token);
    if (!session) {
        res.json({ status: 'ok', session: 'not_found' });
        return;
    }
    res.json({
        status: 'ok',
        session: session.status,
        userName: session.userName,
        updatedAt: session.updatedAt,
    });
});
// ── POST /live/pause ──────────────────────────────────────────────────────────
exports.liveRouter.post('/pause', (req, res) => {
    const { token } = req.body;
    const session = sessions.get(token);
    if (!session || session.status === 'finished') {
        res.status(404).json({ status: 'error', message: 'Session not found or finished' });
        return;
    }
    session.status = 'paused';
    session.updatedAt = Date.now();
    res.json({ status: 'ok' });
});
// ── POST /live/resume ─────────────────────────────────────────────────────────
exports.liveRouter.post('/resume', (req, res) => {
    const { token } = req.body;
    const session = sessions.get(token);
    if (!session || session.status === 'finished') {
        res.status(404).json({ status: 'error', message: 'Session not found or finished' });
        return;
    }
    session.status = 'running';
    session.updatedAt = Date.now();
    res.json({ status: 'ok' });
});
// ── POST /live/finish ─────────────────────────────────────────────────────────
exports.liveRouter.post('/finish', (req, res) => {
    const { token } = req.body;
    const session = sessions.get(token);
    if (!session) {
        res.status(404).json({ status: 'error', message: 'Session not found' });
        return;
    }
    session.status = 'finished';
    session.updatedAt = Date.now();
    // Wyczyść mapowania endpoint → token
    for (const [ep, t] of endpointToToken.entries()) {
        if (t === token)
            endpointToToken.delete(ep);
    }
    console.log(`[Live] Session finished: ${token}`);
    res.json({ status: 'ok', message: 'Session finished' });
});
// ── GET /live/active/:endpoint — sprawdź czy znajomy ma aktywny trening ────────
// Telefon polluje ten endpoint co 30s z własnym subscriptionEndpoint (encoded)
// Zwraca token jeśli znajomy ma aktywną sesję, null jeśli nie
exports.liveRouter.get('/active/:endpoint', (req, res) => {
    const endpoint = decodeURIComponent(req.params.endpoint);
    const token = endpointToToken.get(endpoint);
    if (!token) {
        res.json({ status: 'ok', active: false, token: null });
        return;
    }
    const session = sessions.get(token);
    if (!session || session.status === 'finished') {
        endpointToToken.delete(endpoint);
        res.json({ status: 'ok', active: false, token: null });
        return;
    }
    res.json({
        status: 'ok',
        active: true,
        token,
        userName: session.userName,
        session: session.status,
    });
});
// ── GET /live (diagnostics) ───────────────────────────────────────────────────
exports.liveRouter.get('/', (_req, res) => {
    const active = [...sessions.values()].filter(s => s.status !== 'finished').length;
    res.json({ status: 'ok', totalSessions: sessions.size, activeSessions: active });
});
const invites = new Map();
// Czyść stare invite kody po 7 dniach
setInterval(() => {
    const now = Date.now();
    for (const [code, inv] of invites.entries()) {
        if (now - inv.created > 7 * 24 * 60 * 60 * 1000)
            invites.delete(code);
    }
}, 60 * 60 * 1000);
function randomCode() {
    return Math.random().toString(36).slice(2, 10).toUpperCase();
}
exports.liveRouter.post('/invite', (req, res) => {
    const { name, pushSub } = req.body;
    if (!name || !pushSub) {
        res.status(400).json({ status: 'error', message: 'Missing name or pushSub' });
        return;
    }
    const code = randomCode();
    invites.set(code, { name, pushSub, created: Date.now() });
    console.log(`[Live] Invite created: ${code} for ${name}`);
    res.json({ status: 'ok', code });
});
// ── GET /live/invite/:code — pobierz dane zaproszenia ───────────────────────
exports.liveRouter.get('/invite/:code', (req, res) => {
    const inv = invites.get(req.params.code.toUpperCase());
    if (!inv) {
        res.status(404).json({ status: 'error', message: 'Invite not found or expired' });
        return;
    }
    res.json({ status: 'ok', name: inv.name, pushSub: inv.pushSub });
});
//# sourceMappingURL=liveTracking.js.map