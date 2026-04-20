"use strict";
// ─── IN-MEMORY DATABASE ───────────────────────────────────────────────────────
//
// Prosta baza w pamięci — gotowa do zamiany na MongoDB/Redis.
// Interfejs publiczny pozostaje niezmieniony — wystarczy podmienić
// implementację metod, nie zmieniając reszty kodu.
//
// Kluczowa zmiana względem starej wersji:
//   • Subskrypcje są indeksowane PO userId, nie globalnie.
//   • Klucz rekordu = `${userId}:${deviceId}` — unikalny per urządzenie.
//   • Metody getSubscriptionsByUserId() zwracają TYLKO subskrypcje
//     danego użytkownika — koniec z broadcastem do wszystkich.
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
class MemoryDB {
    constructor() {
        // ── Workouty ────────────────────────────────────────────────────────────────
        this.workouts = new Map();
        // ── Push subskrypcje ────────────────────────────────────────────────────────
        //
        // Klucz mapy: `${userId}:${deviceId}` — gwarantuje:
        //   1. Jeden rekord per urządzenie (nie duplikaty przy re-subskrypcji).
        //   2. Szybkie pobranie wszystkich urządzeń danego userId.
        this.subscriptions = new Map();
    }
    getAllWorkouts() {
        return Array.from(this.workouts.values())
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }
    getWorkoutById(id) {
        return this.workouts.get(id);
    }
    saveWorkout(workout) {
        this.workouts.set(workout.id, workout);
        return workout;
    }
    updateWorkout(id, data) {
        const existing = this.workouts.get(id);
        if (!existing)
            return null;
        const updated = { ...existing, ...data, id };
        this.workouts.set(id, updated);
        return updated;
    }
    deleteWorkout(id) {
        return this.workouts.delete(id);
    }
    clearWorkouts() { this.workouts.clear(); }
    workoutCount() { return this.workouts.size; }
    /** Zwróć WSZYSTKIE subskrypcje (tylko do diagnostyki). */
    getAllSubscriptions() {
        return Array.from(this.subscriptions.values());
    }
    /**
     * Zwróć subskrypcje konkretnego użytkownika (wszystkie jego urządzenia).
     * To jest metoda używana przy wysyłaniu powiadomień.
     */
    getSubscriptionsByUserId(userId) {
        return Array.from(this.subscriptions.values())
            .filter(sub => sub.userId === userId);
    }
    /** Znajdź subskrypcję po endpointcie (do sprawdzenia duplikatów). */
    getSubscriptionByEndpoint(endpoint) {
        for (const sub of this.subscriptions.values()) {
            if (sub.endpoint === endpoint)
                return sub;
        }
        return undefined;
    }
    /** Znajdź subskrypcję po parze userId:deviceId. */
    getSubscriptionByDevice(userId, deviceId) {
        return this.subscriptions.get(`${userId}:${deviceId}`);
    }
    /** Zapisz lub zaktualizuj subskrypcję (upsert). */
    saveSubscription(sub) {
        const key = `${sub.userId}:${sub.deviceId}`;
        this.subscriptions.set(key, { ...sub, id: key });
        return this.subscriptions.get(key);
    }
    /** Usuń po wewnętrznym ID (klucz = userId:deviceId). */
    deleteSubscription(id) {
        return this.subscriptions.delete(id);
    }
    /** Usuń po endpointcie (używane gdy backend dostaje 410 Gone). */
    deleteSubscriptionByEndpoint(endpoint) {
        for (const [key, sub] of this.subscriptions.entries()) {
            if (sub.endpoint === endpoint) {
                this.subscriptions.delete(key);
                return true;
            }
        }
        return false;
    }
    /** Usuń wszystkie subskrypcje danego użytkownika (np. przy wylogowaniu). */
    deleteSubscriptionsByUserId(userId) {
        let deleted = 0;
        for (const [key, sub] of this.subscriptions.entries()) {
            if (sub.userId === userId) {
                this.subscriptions.delete(key);
                deleted++;
            }
        }
        return deleted;
    }
    subscriptionCount() { return this.subscriptions.size; }
}
// Singleton — jedna instancja na cały proces Node.js
exports.db = new MemoryDB();
//# sourceMappingURL=memoryDB.js.map