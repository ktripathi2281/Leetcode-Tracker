import { ApiError, FunctionCallingConfigMode, GoogleGenAI, ThinkingLevel, type Content } from '@google/genai';
import { env } from '../../config/env.js';

// A thin wrapper over the Gemini SDK: one place for retries, the fallback model,
// timeouts and token counts. Agents call ai.generate(); tests replace it.

export type { Content };
export { ThinkingLevel };

export interface ToolDeclaration {
  name: string;
  description: string;
  /** JSON Schema for the arguments. */
  parameters: object;
}

export interface GenerateRequest {
  system: string;
  contents: Content[];
  /** Ask for JSON matching this JSON Schema. */
  jsonSchema?: object;
  /** Tools the model may call; with forceTools it must call one every turn. */
  tools?: ToolDeclaration[];
  forceTools?: boolean;
  temperature?: number;
  thinking?: ThinkingLevel;
}

export interface FunctionCall {
  /** Echo back in the function response so the model can match them up. */
  id?: string;
  name: string;
  args: Record<string, unknown>;
}

export interface GenerateResponse {
  text: string;
  functionCalls: FunctionCall[];
  /** The model's turn exactly as received (including thought signatures), to send back next turn. */
  content: Content;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export class AiNotConfiguredError extends Error {
  constructor() {
    super('GEMINI_API_KEY is not set');
  }
}

/** Gemini is overloaded or unreachable, even after retries. */
export class AiUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('Gemini is not responding right now', { cause });
  }
}

/** The whole call, retries and fallback included, gives up after this long. */
const TOTAL_BUDGET_MS = 120_000;
const REQUEST_TIMEOUT_MS = 60_000;
const RETRY_DELAYS_MS = [1_000, 3_000];
// Overloaded, rate-limited, or a server hiccup: worth another try.
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

let client: GoogleGenAI | undefined;
function getClient() {
  if (!env.GEMINI_API_KEY) throw new AiNotConfiguredError();
  client ??= new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  return client;
}

const isRetryable = (err: unknown) =>
  !(err instanceof ApiError) || RETRYABLE.has(err.status); // network errors have no status: retry

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function callModel(model: string, req: GenerateRequest, timeoutMs: number): Promise<GenerateResponse> {
  const response = await getClient().models.generateContent({
    model,
    contents: req.contents,
    config: {
      systemInstruction: req.system,
      temperature: req.temperature,
      thinkingConfig: req.thinking ? { thinkingLevel: req.thinking } : undefined,
      responseMimeType: req.jsonSchema ? 'application/json' : undefined,
      responseJsonSchema: req.jsonSchema,
      tools: req.tools
        ? [{ functionDeclarations: req.tools.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.parameters })) }]
        : undefined,
      toolConfig: req.tools && req.forceTools ? { functionCallingConfig: { mode: FunctionCallingConfigMode.ANY } } : undefined,
      abortSignal: AbortSignal.timeout(timeoutMs),
    },
  });

  return {
    text: response.text ?? '',
    functionCalls: (response.functionCalls ?? []).map((c) => ({ id: c.id, name: c.name ?? '', args: c.args ?? {} })),
    content: response.candidates?.[0]?.content ?? { role: 'model', parts: [] },
    model,
    inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: (response.usageMetadata?.candidatesTokenCount ?? 0) + (response.usageMetadata?.thoughtsTokenCount ?? 0),
  };
}

async function generate(req: GenerateRequest): Promise<GenerateResponse> {
  const models = [env.GEMINI_MODEL, env.GEMINI_FALLBACK_MODEL].filter(Boolean);
  const deadline = Date.now() + TOTAL_BUDGET_MS;
  let lastError: unknown;

  for (const model of models) {
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      const remaining = deadline - Date.now();
      if (remaining < 5_000) throw new AiUnavailableError(lastError);
      try {
        return await callModel(model, req, Math.min(REQUEST_TIMEOUT_MS, remaining));
      } catch (err) {
        if (err instanceof AiNotConfiguredError) throw err;
        if (!isRetryable(err)) throw err; // a bad request won't get better
        lastError = err;
        if (attempt < RETRY_DELAYS_MS.length) await sleep(RETRY_DELAYS_MS[attempt]!);
      }
    }
    console.warn(`Gemini model ${model} unavailable after retries${model === models.at(-1) ? '' : '; trying fallback'}`);
  }
  throw new AiUnavailableError(lastError);
}

export const aiConfigured = () => Boolean(env.GEMINI_API_KEY);

/** Replaceable in tests: vi.spyOn(ai, 'generate'). */
export const ai = { generate };
