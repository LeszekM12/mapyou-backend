// ─── ACTIVITY MODEL (GPS tracked activities) ─────────────────────────────────
import { Schema, model, Document } from 'mongoose';

export type SportType = 'running' | 'walking' | 'cycling';

export interface IActivity extends Document {
  activityId:  string;   // ID z frontendu
  userId:      string;
  sport:       SportType;
  date:        string;   // ISO string
  distanceKm:  number;
  durationSec: number;
  paceMinKm:   number;
  speedKmH:    number;
  coords:      [number, number][];
  description: string;
  syncedAt:    Date;
}

const ActivitySchema = new Schema<IActivity>(
  {
    activityId:  { type: String, required: true },
    userId:      { type: String, required: true, index: true },
    sport:       { type: String, enum: ['running', 'walking', 'cycling'], required: true },
    date:        { type: String, required: true },
    distanceKm:  { type: Number, required: true },
    durationSec: { type: Number, required: true },
    paceMinKm:   { type: Number, default: 0 },
    speedKmH:    { type: Number, default: 0 },
    coords:      { type: [[Number]], default: [] },
    description: { type: String, default: '' },
    syncedAt:    { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

ActivitySchema.index({ userId: 1, activityId: 1 }, { unique: true });

export const Activity = model<IActivity>('Activity', ActivitySchema);
