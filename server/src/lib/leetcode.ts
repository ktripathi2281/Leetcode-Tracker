import { z } from 'zod';
import { DIFFICULTIES, LEETCODE_RECENT_LIMIT, leetCodeUrl, type LeetCodeProblemInfo } from '@lct/shared';
import { env } from '../config/env.js';
import { LeetCodeProblem } from '../models/LeetCodeProblem.js';

// LeetCode has no official API; this is the GraphQL endpoint its own website uses.
// Every response is validated, so a change on LeetCode's side fails cleanly instead of saving junk.
const GRAPHQL_URL = 'https://leetcode.com/graphql';
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_BATCH = 20; // problems per request

export class LeetCodeUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('LeetCode is not responding right now', { cause });
  }
}

// Queue outgoing requests so they're spaced out, whatever the number of users.
let queue: Promise<unknown> = Promise.resolve();
function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn);
  const gap = () => new Promise((resolve) => setTimeout(resolve, env.LEETCODE_REQUEST_GAP_MS));
  queue = run.then(gap, gap);
  return run;
}

async function graphql<T>(schema: z.ZodType<T>, query: string, variables: Record<string, unknown>): Promise<T> {
  const json = await throttled(async () => {
    try {
      const res = await fetch(GRAPHQL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Referer: 'https://leetcode.com/' },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as unknown;
    } catch (err) {
      throw new LeetCodeUnavailableError(err);
    }
  });

  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new LeetCodeUnavailableError(parsed.error);
  return parsed.data;
}

// ─── Problem details ──────────────────────────────────────────────────────────

const questionSchema = z.object({
  questionFrontendId: z.string(),
  title: z.string().min(1),
  titleSlug: z.string(),
  difficulty: z.enum(DIFFICULTIES),
  isPaidOnly: z.boolean(),
  topicTags: z.array(z.object({ name: z.string() })),
});
const QUESTION_FIELDS = 'questionFrontendId title titleSlug difficulty isPaidOnly topicTags { name }';

function toInfo(q: z.infer<typeof questionSchema>): LeetCodeProblemInfo {
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

/** Looks up several problems in one request, using GraphQL aliases (q0, q1, ...). */
async function fetchQuestions(slugs: string[]): Promise<Map<string, LeetCodeProblemInfo | null>> {
  const result = new Map<string, LeetCodeProblemInfo | null>();
  for (let start = 0; start < slugs.length; start += MAX_BATCH) {
    const batch = slugs.slice(start, start + MAX_BATCH);
    const params = batch.map((_, i) => `$s${i}: String!`).join(', ');
    const fields = batch.map((_, i) => `q${i}: question(titleSlug: $s${i}) { ${QUESTION_FIELDS} }`).join('\n');
    const variables = Object.fromEntries(batch.map((slug, i) => [`s${i}`, slug]));

    const data = await graphql(
      z.object({ data: z.record(z.string(), questionSchema.nullable()) }),
      `query questions(${params}) {\n${fields}\n}`,
      variables,
    );
    batch.forEach((slug, i) => {
      const q = data.data[`q${i}`];
      result.set(slug, q ? toInfo(q) : null);
    });
  }
  return result;
}

// Several users asking for the same new problem at once share one request.
const inFlight = new Map<string, Promise<LeetCodeProblemInfo | null>>();

/**
 * Problem details by slug, from the shared cache or LeetCode (one request for all that are missing).
 * A slug maps to null if LeetCode has no such problem.
 */
export async function getLeetCodeProblems(slugs: string[]): Promise<Map<string, LeetCodeProblemInfo | null>> {
  const unique = [...new Set(slugs)];
  const result = new Map<string, LeetCodeProblemInfo | null>();

  const cached = await LeetCodeProblem.find({ slug: { $in: unique } }).lean();
  for (const c of cached) {
    result.set(c.slug, {
      slug: c.slug,
      leetcodeNumber: c.leetcodeNumber ?? null,
      title: c.title,
      difficulty: c.difficulty,
      tags: c.tags,
      isPaidOnly: c.isPaidOnly,
      link: leetCodeUrl(c.slug),
    });
  }

  const missing = unique.filter((s) => !result.has(s));
  const toFetch = missing.filter((s) => !inFlight.has(s));
  if (toFetch.length > 0) {
    const batch = fetchQuestions(toFetch);
    for (const slug of toFetch) inFlight.set(slug, batch.then((m) => m.get(slug) ?? null));
    batch.finally(() => toFetch.forEach((s) => inFlight.delete(s))).catch(() => {});
  }
  const pending = missing.map(async (slug) => [slug, await inFlight.get(slug)!] as const);
  const fetched = await Promise.all(pending);

  const found = fetched.flatMap(([, info]) => (info ? [info] : []));
  if (found.length > 0) {
    await LeetCodeProblem.bulkWrite(
      found.map(({ link: _link, ...fields }) => ({
        updateOne: { filter: { slug: fields.slug }, update: { $set: { ...fields, fetchedAt: new Date() } }, upsert: true },
      })),
    );
  }
  for (const [slug, info] of fetched) result.set(slug, info);
  return result;
}

export async function getLeetCodeProblem(slug: string) {
  return (await getLeetCodeProblems([slug])).get(slug) ?? null;
}

// ─── Users ────────────────────────────────────────────────────────────────────

/** The account's exact username (LeetCode matches case-insensitively), or null if it doesn't exist. */
export async function findLeetCodeUser(username: string): Promise<string | null> {
  const data = await graphql(
    z.object({ data: z.object({ matchedUser: z.object({ username: z.string() }).nullable() }) }),
    'query user($username: String!) { matchedUser(username: $username) { username } }',
    { username },
  );
  return data.data.matchedUser?.username ?? null;
}

export interface AcceptedSolve {
  slug: string;
  solvedAt: Date;
}

/** The user's most recent accepted submissions, newest first (LeetCode shares at most 20). */
export async function getRecentAcceptedSolves(username: string): Promise<AcceptedSolve[]> {
  const data = await graphql(
    z.object({
      data: z.object({
        recentAcSubmissionList: z
          .array(z.object({ titleSlug: z.string().min(1), timestamp: z.coerce.number().int().positive() }))
          .nullable(),
      }),
    }),
    `query recentAc($username: String!, $limit: Int!) {
      recentAcSubmissionList(username: $username, limit: $limit) { titleSlug timestamp }
    }`,
    { username, limit: LEETCODE_RECENT_LIMIT },
  );
  return (data.data.recentAcSubmissionList ?? []).map((s) => ({
    slug: s.titleSlug,
    solvedAt: new Date(s.timestamp * 1000),
  }));
}
