import { createHash, randomBytes } from 'node:crypto';
import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { API_TOKEN_PREFIX, type ApiTokenSummary } from '@lct/shared';

// Personal access tokens for the browser extension. Only a hash is stored: the token
// itself is shown once, when created, like a password.
const apiTokenSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true },
    tokenHash: { type: String, required: true, unique: true },
    preview: { type: String, required: true },
    lastUsedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export type ApiTokenDoc = HydratedDocument<InferSchemaType<typeof apiTokenSchema>>;
export const ApiToken = model('ApiToken', apiTokenSchema);

/** SHA-256 is enough here: tokens are long and random, so there's nothing to brute-force. */
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export function generateToken() {
  const token = API_TOKEN_PREFIX + randomBytes(32).toString('base64url');
  return { token, tokenHash: hashToken(token), preview: token.slice(0, API_TOKEN_PREFIX.length + 6) };
}

export function toTokenSummary(t: ApiTokenDoc): ApiTokenSummary {
  return {
    id: t._id.toString(),
    name: t.name,
    preview: t.preview,
    createdAt: t.createdAt.toISOString(),
    lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
  };
}
