// ─── PUSH SUBSCRIPTION MODEL ─────────────────────────────────────────────────
// Przechowywanie w MongoDB zamiast in-memory — subskrypcje przeżyją restart Rendera!
import { Schema, model, Document } from 'mongoose';

export interface IPushSubscription extends Document {
  subId:          string;   // userId:deviceId
  userId:         string;
  deviceId:       string;
  endpoint:       string;
  expirationTime: number | null;
  keys: {
    p256dh: string;
    auth:   string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const PushSubscriptionSchema = new Schema<IPushSubscription>(
  {
    subId:          { type: String, required: true, unique: true },
    userId:         { type: String, required: true, index: true },
    deviceId:       { type: String, required: true },
    endpoint:       { type: String, required: true, unique: true },
    expirationTime: { type: Number, default: null },
    keys: {
      p256dh: { type: String, required: true },
      auth:   { type: String, required: true },
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export const PushSubscription = model<IPushSubscription>('PushSubscription', PushSubscriptionSchema);
