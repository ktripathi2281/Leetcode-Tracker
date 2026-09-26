import { Schema, model } from 'mongoose';
import { AGENTS, AGENT_LOG_RETENTION_DAYS } from '@lct/shared';

// Every agent run: what went in, the tools it called, what came out, and what it cost.
// Powers the Agent Logs page, and the weekly planner's "latest plan".
const agentLogSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    agent: { type: String, enum: AGENTS, required: true },
    problem: { type: Schema.Types.ObjectId, ref: 'Problem', default: null },
    status: { type: String, enum: ['ok', 'error'], required: true },
    /** A readable summary of the request (the prompt itself can be large). */
    input: { type: Schema.Types.Mixed, default: null },
    toolCalls: [
      {
        _id: false,
        name: { type: String, required: true },
        args: { type: Schema.Types.Mixed, default: {} },
        result: { type: Schema.Types.Mixed, default: null },
      },
    ],
    output: { type: Schema.Types.Mixed, default: null },
    error: { type: String, default: null },
    model: { type: String, default: null },
    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    durationMs: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

agentLogSchema.index({ user: 1, createdAt: -1 });
// Runs hold the user's code and messages, so MongoDB deletes them after the retention period.
agentLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: AGENT_LOG_RETENTION_DAYS * 24 * 60 * 60 });
agentLogSchema.index({ user: 1, agent: 1, status: 1, createdAt: -1 });

export const AgentLog = model('AgentLog', agentLogSchema);
