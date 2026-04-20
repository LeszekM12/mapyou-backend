// ─── WORKOUT TYPES ───────────────────────────────────────────────────────────

export type WorkoutType = 'running' | 'cycling' | 'walking';

export type Coords = [number, number];

export interface Workout {
  id:            string;
  type:          WorkoutType;
  date:          string;          // ISO string
  coords:        Coords;
  description:   string;
  distance:      number;          // km
  duration:      number;          // min
  cadence:       number | null;
  pace:          number | null;   // min/km
  elevGain:      number | null;
  elevationGain: number | null;
  speed:         number | null;   // km/h
  routeCoords:   Coords[] | null;
}

export interface CreateWorkoutDto {
  type:           WorkoutType;
  coords:         Coords;
  distance:       number;
  duration:       number;
  cadence?:       number | null;
  elevGain?:      number | null;
  elevationGain?: number | null;
  routeCoords?:   Coords[] | null;
  description?:   string;
  date?:          string;
}

export interface UpdateWorkoutDto extends Partial<CreateWorkoutDto> {}

// ─── PUSH SUBSCRIPTION ───────────────────────────────────────────────────────

/**
 * Każda subskrypcja jest powiązana z konkretnym userId + deviceId.
 *
 * userId   — trwały identyfikator użytkownika (UUID v4 generowany raz
 *             w przeglądarce i trzymany w localStorage).
 * deviceId — identyfikator urządzenia (UUID v4, też w localStorage).
 *            Pozwala użytkownikowi mieć wiele urządzeń.
 *
 * Dzięki temu /notify/:userId wyśle powiadomienie TYLKO na urządzenia
 * tego konkretnego użytkownika, a nie do wszystkich.
 */
export interface PushSubscriptionRecord {
  id:             string;         // wewnętrzny klucz DB = userId:deviceId
  userId:         string;         // UUID użytkownika
  deviceId:       string;         // UUID urządzenia
  endpoint:       string;
  expirationTime: number | null;
  keys: {
    p256dh: string;
    auth:   string;
  };
  createdAt: string;
}

export interface PushPayload {
  title:  string;
  body:   string;
  icon?:  string;
  badge?: string;
  url?:   string;
}
