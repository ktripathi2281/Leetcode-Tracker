import type { Types } from 'mongoose';
import type { AgentName, AgentUsage } from '@lct/shared';
import { AgentLog } from '../../models/AgentLog.js';
import { ai, type GenerateRequest, type GenerateResponse } from './client.js';
import { claimUse, refundUse } from './usage.js';

/** The model's answer wasn't usable (wrong shape, no final answer). */
export class AiOutputError extends Error {}

const MAX_LOGGED_RESULT_CHARS = 20_000;

/** Tool results can be large; logs keep a bounded copy. */
function forLog(value: unknown): unknown {
  const json = JSON.stringify(value ?? null);
  return json.length <= MAX_LOGGED_RESULT_CHARS ? value : { truncated: json.slice(0, MAX_LOGGED_RESULT_CHARS) };
}

/** Handed to an agent: call the model through it, and record tool calls, so the run is logged. */
export class AgentRun {
  readonly toolCalls: { name: string; args: unknown; result: unknown }[] = [];
  model: string | null = null;
  inputTokens = 0;
  outputTokens = 0;

  async generate(req: GenerateRequest): Promise<GenerateResponse> {
    const res = await ai.generate(req);
    this.model = res.model;
    this.inputTokens += res.inputTokens;
    this.outputTokens += res.outputTokens;
    return res;
  }

  recordTool(name: string, args: unknown, result: unknown) {
    this.toolCalls.push({ name, args, result: forLog(result) });
  }
}

interface RunOptions {
  user: Types.ObjectId;
  agent: AgentName;
  problem?: Types.ObjectId | null;
  /** What to show in the logs as the request. */
  input: unknown;
}

/**
 * Runs an agent: takes one of the user's daily uses, then logs the run whether it
 * succeeds or fails. A failed run gives the use back.
 */
export async function runAgent<T>(options: RunOptions, fn: (run: AgentRun) => Promise<T>): Promise<{ result: T; usage: AgentUsage }> {
  const usage = await claimUse(options.user, options.agent);
  const run = new AgentRun();
  const started = Date.now();

  const log = (fields: { status: 'ok' | 'error'; output?: unknown; error?: string }) =>
    AgentLog.create({
      user: options.user,
      agent: options.agent,
      problem: options.problem ?? null,
      input: options.input,
      toolCalls: run.toolCalls,
      model: run.model,
      inputTokens: run.inputTokens,
      outputTokens: run.outputTokens,
      durationMs: Date.now() - started,
      ...fields,
    });

  try {
    const result = await fn(run);
    await log({ status: 'ok', output: result });
    return { result, usage };
  } catch (err) {
    await refundUse(options.user, options.agent);
    await log({ status: 'error', error: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}
