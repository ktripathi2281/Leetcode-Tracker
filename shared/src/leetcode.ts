import type { Difficulty } from './constants';

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Extracts the problem slug from a LeetCode problem URL, e.g. ".../problems/two-sum/description/". */
export function slugFromLeetCodeUrl(input: string): string | null {
  let url: URL;
  try {
    const s = input.trim();
    url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  if (!/(^|\.)leetcode\.com$/i.test(url.hostname)) return null;
  const slug = url.pathname.match(/^\/problems\/([^/]+)/)?.[1]?.toLowerCase();
  return slug && SLUG_RE.test(slug) ? slug : null;
}

/** Accepts a LeetCode problem URL or a bare slug like "two-sum". */
export function parseLeetCodeInput(input: string): string | null {
  const s = input.trim().toLowerCase();
  return SLUG_RE.test(s) ? s : slugFromLeetCodeUrl(s);
}

export const leetCodeUrl = (slug: string) => `https://leetcode.com/problems/${slug}/`;

export interface LeetCodeProblemInfo {
  slug: string;
  leetcodeNumber: number | null;
  title: string;
  difficulty: Difficulty;
  tags: string[];
  isPaidOnly: boolean;
  link: string;
}
