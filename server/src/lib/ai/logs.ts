import type { Types } from 'mongoose';
import {
  AGENTS,
  AGENT_STATS_DAYS,
  type AgentLogDetail,
  type AgentLogListResponse,
  type AgentLogQuery,
  type AgentLogSummary,
  type AgentName,
  type AgentStats,
} from '@lct/shared';
import { AgentLog } from '../../models/AgentLog.js';
import { DAY_MS } from '../time.js';

const PREVIEW_LENGTH = 160;

type LogDoc = {
  _id: Types.ObjectId;
  agent: AgentName;
  status: 'ok' | 'error';
  problem: { _id: Types.ObjectId; title: string } | null;
  input?: unknown;
  toolCalls: { name: string; args?: unknown; result?: unknown }[];
  output?: unknown;
  error?: string | null;
  model?: string | null;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  createdAt: Date;
};

const clip = (text: string) => (text.length > PREVIEW_LENGTH ? `${text.slice(0, PREVIEW_LENGTH - 1)}…` : text);
const field = (value: unknown, key: string) =>
  value && typeof value === 'object' && key in value ? (value as Record<string, unknown>)[key] : undefined;

/** One line that identifies the run in a list. */
function preview(log: LogDoc): string {
  if (log.status === 'error') return clip(log.error ?? 'Failed');
  switch (log.agent) {
    case 'tutor': {
      const message = field(log.input, 'message');
      return clip(typeof message === 'string' ? `“${message}”` : 'Hint conversation');
    }
    case 'post-mortem': {
      const time = field(log.output, 'timeComplexity');
      const optimal = field(log.output, 'isOptimal');
      return clip(`${typeof time === 'string' ? time : 'Analysis'}${optimal === true ? ' · optimal' : optimal === false ? ' · can be improved' : ''}`);
    }
    case 'planner': {
      const summary = field(log.output, 'summary');
      return clip(typeof summary === 'string' ? summary : 'Weekly plan');
    }
  }
}

function toSummary(log: LogDoc): AgentLogSummary {
  return {
    id: log._id.toString(),
    agent: log.agent,
    status: log.status,
    problem: log.problem ? { id: log.problem._id.toString(), title: log.problem.title } : null,
    preview: preview(log),
    toolCallCount: log.toolCalls.length,
    model: log.model ?? null,
    inputTokens: log.inputTokens,
    outputTokens: log.outputTokens,
    durationMs: log.durationMs,
    createdAt: log.createdAt.toISOString(),
  };
}

export async function listAgentLogs(user: Types.ObjectId, query: AgentLogQuery): Promise<AgentLogListResponse> {
  const filter: Record<string, unknown> = { user };
  if (query.agent) filter.agent = query.agent;
  if (query.status) filter.status = query.status;

  const [total, logs] = await Promise.all([
    AgentLog.countDocuments(filter),
    AgentLog.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      // The list only needs a preview; the full input and output load with the detail.
      .select('-toolCalls.args -toolCalls.result')
      .populate('problem', 'title')
      .lean<LogDoc[]>(),
  ]);

  return { logs: logs.map(toSummary), total, page: query.page, pages: Math.max(1, Math.ceil(total / query.limit)) };
}

export async function getAgentLog(user: Types.ObjectId, id: string): Promise<AgentLogDetail | null> {
  const log = await AgentLog.findOne({ _id: id, user }).populate('problem', 'title').lean<LogDoc>();
  if (!log) return null;
  return {
    ...toSummary(log),
    input: log.input ?? null,
    toolCalls: log.toolCalls.map((t) => ({ name: t.name, args: t.args ?? {}, result: t.result ?? null })),
    output: log.output ?? null,
    error: log.error ?? null,
  };
}

/** Runs, failures, tokens and speed per agent over the last AGENT_STATS_DAYS. */
export async function getAgentStats(user: Types.ObjectId, now = new Date()): Promise<AgentStats[]> {
  const rows = await AgentLog.aggregate<{
    _id: AgentName;
    runs: number;
    errors: number;
    inputTokens: number;
    outputTokens: number;
    okDuration: number;
    okRuns: number;
  }>([
    { $match: { user, createdAt: { $gte: new Date(now.getTime() - AGENT_STATS_DAYS * DAY_MS) } } },
    {
      $group: {
        _id: '$agent',
        runs: { $sum: 1 },
        errors: { $sum: { $cond: [{ $eq: ['$status', 'error'] }, 1, 0] } },
        inputTokens: { $sum: '$inputTokens' },
        outputTokens: { $sum: '$outputTokens' },
        okDuration: { $sum: { $cond: [{ $eq: ['$status', 'ok'] }, '$durationMs', 0] } },
        okRuns: { $sum: { $cond: [{ $eq: ['$status', 'ok'] }, 1, 0] } },
      },
    },
  ]);

  return AGENTS.map((agent) => {
    const r = rows.find((row) => row._id === agent);
    return {
      agent,
      runs: r?.runs ?? 0,
      errors: r?.errors ?? 0,
      inputTokens: r?.inputTokens ?? 0,
      outputTokens: r?.outputTokens ?? 0,
      avgDurationMs: r && r.okRuns > 0 ? Math.round(r.okDuration / r.okRuns) : 0,
    };
  });
}
