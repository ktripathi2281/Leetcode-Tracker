import { vi } from 'vitest';

interface FakeProblem {
  number: number;
  title: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  tags?: string[];
}

interface FakeOptions {
  problems?: Record<string, FakeProblem>;
  /** username -> accepted solves, newest first */
  users?: Record<string, { slug: string; daysAgo: number }[]>;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

export const DEFAULT_PROBLEMS: Record<string, FakeProblem> = {
  'two-sum': { number: 1, title: 'Two Sum', difficulty: 'Easy', tags: ['Array', 'Hash Table'] },
  'lru-cache': { number: 146, title: 'LRU Cache', difficulty: 'Medium', tags: ['Hash Table', 'Design'] },
  '3sum': { number: 15, title: '3Sum', difficulty: 'Medium', tags: ['Array', 'Two Pointers'] },
  'trapping-rain-water': { number: 42, title: 'Trapping Rain Water', difficulty: 'Hard', tags: ['Array', 'Stack'] },
};

/**
 * Stands in for LeetCode's GraphQL API: answers the problem, user and recent-solves
 * queries the way LeetCode does, and records each request.
 */
export function fakeLeetCode({ problems = DEFAULT_PROBLEMS, users = {} }: FakeOptions = {}) {
  const requests: { query: string; variables: Record<string, unknown> }[] = [];

  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    const { query, variables } = JSON.parse(String(init?.body)) as { query: string; variables: Record<string, string> };
    requests.push({ query, variables });

    if (query.includes('matchedUser')) {
      const name = Object.keys(users).find((u) => u.toLowerCase() === variables.username!.toLowerCase());
      return name
        ? json({ data: { matchedUser: { username: name } } })
        : json({ errors: [{ message: 'That user does not exist.' }], data: { matchedUser: null } });
    }

    if (query.includes('recentAcSubmissionList')) {
      const solves = users[variables.username!] ?? [];
      const now = Date.now() / 1000;
      return json({
        data: {
          recentAcSubmissionList: solves.slice(0, 20).map((s) => ({
            titleSlug: s.slug,
            timestamp: String(Math.floor(now - s.daysAgo * 86_400)),
          })),
        },
      });
    }

    if (query.includes('question(')) {
      const data: Record<string, unknown> = {};
      for (const [key, slug] of Object.entries(variables)) {
        const p = problems[slug];
        data[`q${key.slice(1)}`] = p
          ? {
              questionFrontendId: String(p.number),
              title: p.title,
              titleSlug: slug,
              difficulty: p.difficulty,
              isPaidOnly: false,
              topicTags: (p.tags ?? []).map((name) => ({ name })),
            }
          : null;
      }
      return json({ data });
    }

    return json({ errors: [{ message: 'Unknown query' }] }, 400);
  });

  const count = (kind: string) => requests.filter((r) => r.query.includes(kind)).length;
  return { spy, requests, count };
}
