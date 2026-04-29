// ─── UNIFIED WORKOUT MODEL (Stats — single source of truth) ──────────────────
import { Schema, model, Document } from 'mongoose';

export interface IUnifiedWorkout extends Document {
  workoutId:   string;
  userId:      string;
  type:        'running' | 'walking' | 'cycling';
  source:      'manual' | 'tracking';
  date:        string;   // ISO string
  distanceKm:  number;
  durationSec: number;
  paceMinKm:   number;
  speedKmH:    number;
  elevGain:    number;
  coords:      [number, number][];
  name:        string;
  description: string;
  notes:       string;
  intensity:   number;
  photoUrl:    string | null;
  syncedAt:    Date;
}

const UnifiedWorkoutSchema = new Schema<IUnifiedWorkout>(
  {
    workoutId:   { type: String, required: true },
    userId:      { type: String, required: true, index: true },
    type:        { type: String, enum: ['running', 'walking', 'cycling'], required: true },
    source:      { type: String, enum: ['manual', 'tracking'], required: true },
    date:        { type: String, required: true },
    distanceKm:  { type: Number, default: 0 },
    durationSec: { type: Number, default: 0 },
    paceMinKm:   { type: Number, default: 0 },
    speedKmH:    { type: Number, default: 0 },
    elevGain:    { type: Number, default: 0 },
    coords:      { type: [[Number]], default: [] },
    name:        { type: String, default: '' },
    description: { type: String, default: '' },
    notes:       { type: String, default: '' },
    intensity:   { type: Number, default: 3 },
    photoUrl:    { type: String, default: null },
    syncedAt:    { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

UnifiedWorkoutSchema.index({ userId: 1, workoutId: 1 }, { unique: true });

export const UnifiedWorkout = model<IUnifiedWorkout>('UnifiedWorkout', UnifiedWorkoutSchema);
