import { z } from 'zod';
import { DIFFICULTIES, leetCodeUrl, type LeetCodeProblemInfo } from '@lct/shared';
import { LeetCodeProblem } from '../models/LeetCodeProblem.js';

// LeetCode has no official API; this is the GraphQL endpoint its own website uses.
const GRAPHQL_URL = 'https://leetcode.com/graphql';
const REQUEST_TIMEOUT_MS = 8_000;
const MIN_GAP_MS = 300; // between outgoing requests, to stay well clear of LeetCode's limits

const QUESTION_QUERY = `query questionInfo($titleSlug: String!) {
  question(titleSlug: $titleSlug) {
    questionFrontendId title titleSlug difficulty isPaidOnly topicTags { name }
  }
}`;

// Validate the response shape so a change on LeetCode's side fails cleanly instead of saving junk.
const responseSchema = z.object({
  data: z.object({
    question: z
      .object({
        questionFrontendId: z.string(),
        title: z.string().min(1),
        titleSlug: z.string(),
        difficulty: z.enum(DIFFICULTIES),
        isPaidOnly: z.boolean(),
        topicTags: z.array(z.object({ name: z.string() })),
      })
      .nullable(),
  }),
});

export class LeetCodeUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('LeetCode is not responding right now', { cause });
  }
}

// Queue outgoing requests so they're spaced out, whatever the number of users.
let queue: Promise<unknown> = Promise.resolve();
function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn);
  const gap = () => new Promise((resolve) => setTimeout(resolve, MIN_GAP_MS));
  queue = run.then(gap, gap);
  return run;
}

async function fetchFromLeetCode(slug: string): Promise<LeetCodeProblemInfo | null> {
  let json: unknown;
  try {
    const res = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Referer: leetCodeUrl(slug) },
      body: JSON.stringify({ query: QUESTION_QUERY, variables: { titleSlug: slug } }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    json = await res.json();
  } catch (err) {
    throw new LeetCodeUnavailableError(err);
  }

  const parsed = responseSchema.safeParse(json);
  if (!parsed.success) throw new LeetCodeUnavailableError(parsed.error);

  const q = parsed.data.data.question;
  if (!q) return null;

  const number = Number(q.questionFrontendId);
  return {
    slug: q.titleSlug,
    leetcodeNumber: Number.isInteger(number) && number > 0 ? number : null,
    title: q.title,
    difficulty: q.difficulty,
    tags: q.topicTags.map((t) => t.name),
    isPaidOnly: q.isPaidOnly,
    link: leetCodeUrl(q.titleSlug),
  };
}

// Several users asking for the same new problem at once share one request.
const inFlight = new Map<string, Promise<LeetCodeProblemInfo | null>>();

/** Problem details by slug, from the cache or LeetCode. Null if LeetCode has no such problem. */
export async function getLeetCodeProblem(slug: string): Promise<LeetCodeProblemInfo | null> {
  const cached = await LeetCodeProblem.findOne({ slug }).lean();
  if (cached) {
    return {
      slug: cached.slug,
      leetcodeNumber: cached.leetcodeNumber ?? null,
      title: cached.title,
      difficulty: cached.difficulty,
      tags: cached.tags,
      isPaidOnly: cached.isPaidOnly,
      link: leetCodeUrl(cached.slug),
    };
  }

  let pending = inFlight.get(slug);
  if (!pending) {
    pending = throttled(() => fetchFromLeetCode(slug)).finally(() => inFlight.delete(slug));
    inFlight.set(slug, pending);
  }
  const info = await pending;

  if (info) {
    const { link: _link, ...fields } = info;
    await LeetCodeProblem.updateOne({ slug }, { $set: { ...fields, fetchedAt: new Date() } }, { upsert: true });
  }
  return info;
}
