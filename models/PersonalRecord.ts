// ─── PERSONAL RECORD MODEL ───────────────────────────────────────────────────
import { Schema, model, Document } from 'mongoose';

export interface IPersonalRecord extends Document {
  userId:            string;   // unique — jeden rekord per user
  best5k:            number | null;   // sekundy
  best10k:           number | null;
  bestHalfMarathon:  number | null;
  bestMarathon:      number | null;
  longestRun:        number | null;   // km
  longestRide:       number | null;   // km
  bestStreak:        number;  // dni
  weeklyGoalWins:    number;
  totalWorkouts:     number;
  totalDistanceKm:   number;
  updatedAt:         Date;
}

const PersonalRecordSchema = new Schema<IPersonalRecord>(
  {
    userId:           { type: String, required: true, unique: true, index: true },
    best5k:           { type: Number, default: null },
    best10k:          { type: Number, default: null },
    bestHalfMarathon: { type: Number, default: null },
    bestMarathon:     { type: Number, default: null },
    longestRun:       { type: Number, default: null },
    longestRide:      { type: Number, default: null },
    bestStreak:       { type: Number, default: 0 },
    weeklyGoalWins:   { type: Number, default: 0 },
    totalWorkouts:    { type: Number, default: 0 },
    totalDistanceKm:  { type: Number, default: 0 },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export const PersonalRecord = model<IPersonalRecord>('PersonalRecord', PersonalRecordSchema);
