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

import { Workout, PushSubscriptionRecord } from './Workout.js';

class MemoryDB {

  // ── Workouty ────────────────────────────────────────────────────────────────

  private workouts: Map<string, Workout> = new Map();

  getAllWorkouts(): Workout[] {
    return Array.from(this.workouts.values())
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  getWorkoutById(id: string): Workout | undefined {
    return this.workouts.get(id);
  }

  saveWorkout(workout: Workout): Workout {
    this.workouts.set(workout.id, workout);
    return workout;
  }

  updateWorkout(id: string, data: Partial<Workout>): Workout | null {
    const existing = this.workouts.get(id);
    if (!existing) return null;
    const updated: Workout = { ...existing, ...data, id };
    this.workouts.set(id, updated);
    return updated;
  }

  deleteWorkout(id: string): boolean {
    return this.workouts.delete(id);
  }

  clearWorkouts(): void { this.workouts.clear(); }
  workoutCount():  number { return this.workouts.size; }

  // ── Push subskrypcje ────────────────────────────────────────────────────────
  //
  // Klucz mapy: `${userId}:${deviceId}` — gwarantuje:
  //   1. Jeden rekord per urządzenie (nie duplikaty przy re-subskrypcji).
  //   2. Szybkie pobranie wszystkich urządzeń danego userId.

  private subscriptions: Map<string, PushSubscriptionRecord> = new Map();

  /** Zwróć WSZYSTKIE subskrypcje (tylko do diagnostyki). */
  getAllSubscriptions(): PushSubscriptionRecord[] {
    return Array.from(this.subscriptions.values());
  }

  /**
   * Zwróć subskrypcje konkretnego użytkownika (wszystkie jego urządzenia).
   * To jest metoda używana przy wysyłaniu powiadomień.
   */
  getSubscriptionsByUserId(userId: string): PushSubscriptionRecord[] {
    return Array.from(this.subscriptions.values())
      .filter(sub => sub.userId === userId);
  }

  /** Znajdź subskrypcję po endpointcie (do sprawdzenia duplikatów). */
  getSubscriptionByEndpoint(endpoint: string): PushSubscriptionRecord | undefined {
    for (const sub of this.subscriptions.values()) {
      if (sub.endpoint === endpoint) return sub;
    }
    return undefined;
  }

  /** Znajdź subskrypcję po parze userId:deviceId. */
  getSubscriptionByDevice(userId: string, deviceId: string): PushSubscriptionRecord | undefined {
    return this.subscriptions.get(`${userId}:${deviceId}`);
  }

  /** Zapisz lub zaktualizuj subskrypcję (upsert). */
  saveSubscription(sub: PushSubscriptionRecord): PushSubscriptionRecord {
    const key = `${sub.userId}:${sub.deviceId}`;
    this.subscriptions.set(key, { ...sub, id: key });
    return this.subscriptions.get(key)!;
  }

  /** Usuń po wewnętrznym ID (klucz = userId:deviceId). */
  deleteSubscription(id: string): boolean {
    return this.subscriptions.delete(id);
  }

  /** Usuń po endpointcie (używane gdy backend dostaje 410 Gone). */
  deleteSubscriptionByEndpoint(endpoint: string): boolean {
    for (const [key, sub] of this.subscriptions.entries()) {
      if (sub.endpoint === endpoint) {
        this.subscriptions.delete(key);
        return true;
      }
    }
    return false;
  }

  /** Usuń wszystkie subskrypcje danego użytkownika (np. przy wylogowaniu). */
  deleteSubscriptionsByUserId(userId: string): number {
    let deleted = 0;
    for (const [key, sub] of this.subscriptions.entries()) {
      if (sub.userId === userId) {
        this.subscriptions.delete(key);
        deleted++;
      }
    }
    return deleted;
  }

  subscriptionCount(): number { return this.subscriptions.size; }
}

// Singleton — jedna instancja na cały proces Node.js
export const db = new MemoryDB();
