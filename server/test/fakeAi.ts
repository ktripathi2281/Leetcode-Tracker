import { vi } from 'vitest';
import { ai, type FunctionCall, type GenerateRequest, type GenerateResponse } from '../src/lib/ai/client.js';

type Scripted = string | { json: object } | { calls: FunctionCall[] } | Error;

/**
 * Replaces Gemini with scripted replies, answered in order, one per model call.
 * Records every request so tests can check the prompts.
 */
export function fakeAi(...replies: Scripted[]) {
  const requests: GenerateRequest[] = [];
  const spy = vi.spyOn(ai, 'generate').mockImplementation(async (req) => {
    requests.push(structuredClone(req));
    const reply = replies.shift();
    if (reply === undefined) throw new Error('fakeAi: no scripted reply left');
    if (reply instanceof Error) throw reply;

    const base: GenerateResponse = {
      text: '',
      functionCalls: [],
      content: { role: 'model', parts: [] },
      model: 'fake-model',
      inputTokens: 100,
      outputTokens: 50,
    };
    if (typeof reply === 'string') return { ...base, text: reply, content: { role: 'model', parts: [{ text: reply }] } };
    if ('json' in reply) return { ...base, text: JSON.stringify(reply.json) };
    return {
      ...base,
      functionCalls: reply.calls,
      content: { role: 'model', parts: reply.calls.map((c) => ({ functionCall: { id: c.id, name: c.name, args: c.args } })) },
    };
  });
  return { spy, requests };
}
