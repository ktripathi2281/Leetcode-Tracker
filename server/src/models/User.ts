import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import type { AuthUser } from '@lct/shared';

// Case-insensitive comparison, so "Alice" and "alice" count as the same username.
const CASE_INSENSITIVE = { locale: 'en', strength: 2 };

const userSchema = new Schema(
  {
    username: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true, select: false },
    leetcode: {
      username: { type: String, default: null },
      lastSyncedAt: { type: Date, default: null },
      // Set when a sync starts; used to stop overlapping or rapid-fire syncs.
      lastSyncAttemptAt: { type: Date, default: null },
      lastResult: { type: Schema.Types.Mixed, default: null },
    },
  },
  { timestamps: true },
);

userSchema.index({ username: 1 }, { unique: true, collation: CASE_INSENSITIVE });
userSchema.index({ email: 1 }, { unique: true });

export type UserDoc = HydratedDocument<InferSchemaType<typeof userSchema>>;

export const User = model('User', userSchema);

export function toAuthUser(user: UserDoc): AuthUser {
  return { id: user._id.toString(), username: user.username, email: user.email };
}
