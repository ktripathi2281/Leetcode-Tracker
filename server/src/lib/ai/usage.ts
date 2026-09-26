import { Schema, model, mongo, type Types } from 'mongoose';
import { AGENTS, AGENT_DAILY_LIMITS, type AgentName, type AgentUsage } from '@lct/shared';
import { addCalendarDays } from '../time.js';

// Daily per-user counters, one document per user, agent and UTC day.
const usageSchema = new Schema({
  user: { type: Schema.Types.ObjectId, required: true },
  agent: { type: String, enum: AGENTS, required: true },
  day: { type: String, required: true }, // YYYY-MM-DD, UTC
  count: { type: Number, required: true },
});
usageSchema.index({ user: 1, agent: 1, day: 1 }, { unique: true });

const Usage = model('AgentUsage', usageSchema);

const utcDay = (now: Date) => now.toISOString().slice(0, 10);
const resetsAt = (now: Date) => `${addCalendarDays(utcDay(now), 1)}T00:00:00.000Z`;

export class UsageLimitError extends Error {
  constructor(readonly usage: AgentUsage) {
    super('Daily limit reached');
  }
}

/**
 * Counts one use, atomically: two requests at once can't both take the last slot.
 * Throws UsageLimitError when the day's limit is used up.
 */
export async function claimUse(user: Types.ObjectId, agent: AgentName, now = new Date()): Promise<AgentUsage> {
  const limit = AGENT_DAILY_LIMITS[agent];
  const day = utcDay(now);
  try {
    // Matches only while under the limit; at the limit, the upsert collides with the
    // existing counter on the unique index instead of creating a second one.
    const doc = await Usage.findOneAndUpdate(
      { user, agent, day, count: { $lt: limit } },
      { $inc: { count: 1 } },
      { upsert: true, returnDocument: 'after' },
    );
    return { agent, used: doc.count, limit, resetsAt: resetsAt(now) };
  } catch (err) {
    if (err instanceof mongo.MongoServerError && err.code === 11000) {
      throw new UsageLimitError({ agent, used: limit, limit, resetsAt: resetsAt(now) });
    }
    throw err;
  }
}

/** Gives a use back when the AI call failed, so outages don't eat the allowance. */
export async function refundUse(user: Types.ObjectId, agent: AgentName, now = new Date()) {
  await Usage.updateOne({ user, agent, day: utcDay(now), count: { $gt: 0 } }, { $inc: { count: -1 } });
}

export async function getUsage(user: Types.ObjectId, now = new Date()): Promise<AgentUsage[]> {
  const docs = await Usage.find({ user, day: utcDay(now) }).lean();
  return AGENTS.map((agent) => ({
    agent,
    used: docs.find((d) => d.agent === agent)?.count ?? 0,
    limit: AGENT_DAILY_LIMITS[agent],
    resetsAt: resetsAt(now),
  }));
}
