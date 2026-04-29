// ─── WORKOUT MODEL (manual map workouts) ─────────────────────────────────────
import { Schema, model, Document } from 'mongoose';

export type WorkoutType = 'running' | 'cycling' | 'walking';

export interface IWorkout extends Document {
  workoutId:     string;   // ID z frontendu (IndexedDB)
  userId:        string;
  type:          WorkoutType;
  date:          string;   // ISO string
  coords:        [number, number];
  description:   string;
  distance:      number;   // km
  duration:      number;   // min
  cadence:       number | null;
  pace:          number | null;  // min/km
  elevGain:      number | null;
  elevationGain: number | null;
  speed:         number | null;  // km/h
  routeCoords:   [number, number][] | null;
  syncedAt:      Date;
}

const WorkoutSchema = new Schema<IWorkout>(
  {
    workoutId:    { type: String, required: true },
    userId:       { type: String, required: true, index: true },
    type:         { type: String, enum: ['running', 'cycling', 'walking'], required: true },
    date:         { type: String, required: true },
    coords:       { type: [Number], required: true },
    description:  { type: String, default: '' },
    distance:     { type: Number, required: true },
    duration:     { type: Number, required: true },
    cadence:      { type: Number, default: null },
    pace:         { type: Number, default: null },
    elevGain:     { type: Number, default: null },
    elevationGain:{ type: Number, default: null },
    speed:        { type: Number, default: null },
    routeCoords:  { type: [[Number]], default: null },
    syncedAt:     { type: Date,   default: Date.now },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// Unikalny klucz: jeden workout per user per ID z frontendu
WorkoutSchema.index({ userId: 1, workoutId: 1 }, { unique: true });

export const Workout = model<IWorkout>('Workout', WorkoutSchema);
