// ─── LIKE MODEL ──────────────────────────────────────────────────────────────
import { Schema, model, Document } from 'mongoose';

export interface ILike extends Document {
  itemId:    string;   // activityId or postId
  itemType:  'activity' | 'post';
  userId:    string;   // who liked
  createdAt: Date;
}

const LikeSchema = new Schema<ILike>(
  {
    itemId:   { type: String, required: true, index: true },
    itemType: { type: String, enum: ['activity', 'post'], required: true },
    userId:   { type: String, required: true, index: true },
  },
  { timestamps: true, versionKey: false },
);

LikeSchema.index({ itemId: 1, userId: 1 }, { unique: true });

export const Like = model<ILike>('Like', LikeSchema);

// ─── COMMENT MODEL ────────────────────────────────────────────────────────────

export interface IComment extends Document {
  commentId:  string;
  itemId:     string;   // activityId or postId
  itemType:   'activity' | 'post';
  userId:     string;   // who commented
  authorName: string;
  text:       string;
  createdAt:  Date;
}

const CommentSchema = new Schema<IComment>(
  {
    commentId:  { type: String, required: true, unique: true },
    itemId:     { type: String, required: true, index: true },
    itemType:   { type: String, enum: ['activity', 'post'], required: true },
    userId:     { type: String, required: true },
    authorName: { type: String, default: '' },
    text:       { type: String, required: true, maxlength: 500 },
  },
  { timestamps: true, versionKey: false },
);

export const Comment = model<IComment>('Comment', CommentSchema);
