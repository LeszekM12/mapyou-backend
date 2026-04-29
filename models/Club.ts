// ─── CLUB MODEL ───────────────────────────────────────────────────────────────
import { Schema, model, Document } from 'mongoose';

export interface IClub extends Document {
  clubId:      string;
  ownerId:     string;
  name:        string;
  description: string;
  sport:       string;
  avatarB64:   string | null;
  members:     string[];  // userId[]
  posts:       string[];  // postId[]
  createdAt:   Date;
  updatedAt:   Date;
}

const ClubSchema = new Schema<IClub>(
  {
    clubId:      { type: String, required: true, unique: true },
    ownerId:     { type: String, required: true, index: true },
    name:        { type: String, required: true },
    description: { type: String, default: '' },
    sport:       { type: String, default: 'running' },
    avatarB64:   { type: String, default: null },
    members:     [{ type: String }],
    posts:       [{ type: String }],
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export const Club = model<IClub>('Club', ClubSchema);
