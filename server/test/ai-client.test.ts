import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The client reads the key when the env module loads, so set it before any import.
vi.hoisted(() => {
  process.env.GEMINI_API_KEY = 'test-key';
  process.env.GEMINI_MODEL = 'main-model';
  process.env.GEMINI_FALLBACK_MODEL = 'fallback-model';
});

const generateContent = vi.hoisted(() => vi.fn());

vi.mock('@google/genai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@google/genai')>();
  return {
    ...actual,
    GoogleGenAI: class {
      models = { generateContent };
    },
  };
});

const { ApiError } = await import('@google/genai');
const { ai, AiUnavailableError } = await import('../src/lib/ai/client.js');

const ok = (text: string) => ({
  text,
  functionCalls: undefined,
  candidates: [{ content: { role: 'model', parts: [{ text }] } }],
  usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, thoughtsTokenCount: 3 },
});
const apiError = (status: number) => new ApiError({ message: `HTTP ${status}`, status });
const request = { system: 'sys', contents: [{ role: 'user', parts: [{ text: 'hi' }] }] };

/** Runs a call while fast-forwarding the retry waits. */
async function run() {
  const promise = ai.generate(request);
  promise.catch(() => {}); // handled below; avoid an unhandled-rejection warning meanwhile
  await vi.runAllTimersAsync();
  return promise;
}

beforeEach(() => {
  vi.useFakeTimers();
  generateContent.mockReset();
});
afterEach(() => vi.useRealTimers());

describe('ai.generate', () => {
  it('returns text, the model turn and token counts', async () => {
    generateContent.mockResolvedValueOnce(ok('hello'));
    const res = await run();
    expect(res).toMatchObject({ text: 'hello', model: 'main-model', inputTokens: 10, outputTokens: 8 });
    expect(res.content.parts).toEqual([{ text: 'hello' }]);
  });

  it('retries when the model is overloaded', async () => {
    generateContent.mockRejectedValueOnce(apiError(503)).mockRejectedValueOnce(apiError(429)).mockResolvedValueOnce(ok('third time'));
    expect((await run()).text).toBe('third time');
    expect(generateContent).toHaveBeenCalledTimes(3);
  });

  it('falls back to the second model after the retries run out', async () => {
    generateContent
      .mockRejectedValueOnce(apiError(503))
      .mockRejectedValueOnce(apiError(503))
      .mockRejectedValueOnce(apiError(503))
      .mockResolvedValueOnce(ok('from fallback'));
    const res = await run();
    expect(res).toMatchObject({ text: 'from fallback', model: 'fallback-model' });
    expect(generateContent.mock.calls.map(([args]) => args.model)).toEqual([
      'main-model',
      'main-model',
      'main-model',
      'fallback-model',
    ]);
  });

  it('gives up with AiUnavailableError when both models stay down', async () => {
    generateContent.mockRejectedValue(apiError(503));
    await expect(run()).rejects.toBeInstanceOf(AiUnavailableError);
    expect(generateContent).toHaveBeenCalledTimes(6);
  });

  it('does not retry a bad request', async () => {
    generateContent.mockRejectedValueOnce(apiError(400));
    await expect(run()).rejects.toBeInstanceOf(ApiError);
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it('asks for JSON and forced tool use when requested', async () => {
    generateContent.mockResolvedValueOnce(ok('{}'));
    const promise = ai.generate({
      ...request,
      jsonSchema: { type: 'object' },
      tools: [{ name: 't', description: 'd', parameters: { type: 'object' } }],
      forceTools: true,
    });
    await vi.runAllTimersAsync();
    await promise;
    const { config } = generateContent.mock.calls[0]![0];
    expect(config).toMatchObject({
      systemInstruction: 'sys',
      responseMimeType: 'application/json',
      responseJsonSchema: { type: 'object' },
      toolConfig: { functionCallingConfig: { mode: 'ANY' } },
    });
    expect(config.tools[0].functionDeclarations[0]).toMatchObject({ name: 't', parametersJsonSchema: { type: 'object' } });
  });
});
