// ─── NOTIFICATION MODEL ───────────────────────────────────────────────────────
import { Schema, model, Document } from 'mongoose';

export type NotifType =
  | 'activity_added'
  | 'achievement'
  | 'weekly_goal'
  | 'streak'
  | 'friend_activity'
  | 'club_post'
  | 'system';

export interface INotification extends Document {
  notifId:   string;
  userId:    string;
  type:      NotifType;
  title:     string;
  body:      string;
  icon:      string;
  read:      boolean;
  timestamp: number;
  syncedAt:  Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    notifId:   { type: String, required: true },
    userId:    { type: String, required: true, index: true },
    type:      {
      type: String,
      enum: ['activity_added','achievement','weekly_goal','streak','friend_activity','club_post','system'],
      default: 'system',
    },
    title:     { type: String, required: true },
    body:      { type: String, default: '' },
    icon:      { type: String, default: '🔔' },
    read:      { type: Boolean, default: false },
    timestamp: { type: Number, required: true },
    syncedAt:  { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

NotificationSchema.index({ userId: 1, notifId: 1 }, { unique: true });

export const Notification = model<INotification>('Notification', NotificationSchema);
