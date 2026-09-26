import { Schema, model } from 'mongoose';

// One-time password reset links. Only a hash of the link's token is stored, and MongoDB
// deletes expired ones automatically.
const passwordResetSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
});
passwordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PasswordReset = model('PasswordReset', passwordResetSchema);
