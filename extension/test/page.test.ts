// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { CHANNEL } from '../src/lib/channel';

const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });

// LeetCode's server, as the page's original fetch sees it.
const leetcode = vi.fn(async (input: RequestInfo | URL) => {
  const url = String(input);
  if (url.endsWith('/submit/')) return json({ submission_id: 42 });
  if (url.includes('/check/')) return json({ state: 'SUCCESS', status_msg: 'Accepted', submission_id: '42', status_runtime: '1 ms' });
  return json({ unrelated: true });
});

const messages: unknown[] = [];

beforeAll(async () => {
  window.fetch = leetcode as typeof fetch;
  window.addEventListener('message', (e) => messages.push(e.data));
  await import('../src/page'); // installs the hook, like the content script does at page load
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

describe('the page hook', () => {
  it('passes LeetCode’s responses through untouched', async () => {
    const res = await window.fetch('https://leetcode.com/graphql', { method: 'POST', body: '{}' });
    expect(await res.json()).toEqual({ unrelated: true });
  });

  it('announces an accepted submission to the content script', async () => {
    const submitRes = await window.fetch('https://leetcode.com/problems/two-sum/submit/', {
      method: 'POST',
      body: JSON.stringify({ lang: 'cpp', question_id: '1', typed_code: 'class Solution {};' }),
    });
    // The page can still read the response the hook also read.
    expect(await submitRes.json()).toEqual({ submission_id: 42 });
    await settle();
    await window.fetch('https://leetcode.com/submissions/detail/42/check/');
    await settle();

    expect(messages).toContainEqual({
      channel: CHANNEL,
      type: 'accepted',
      submission: expect.objectContaining({ slug: 'two-sum', submissionId: '42', lang: 'cpp', code: 'class Solution {};', runtime: '1 ms' }),
    });
  });

  it('never breaks the page when a response is not JSON', async () => {
    leetcode.mockResolvedValueOnce(new Response('<html>error</html>', { status: 500 }));
    const res = await window.fetch('https://leetcode.com/problems/two-sum/submit/', { method: 'POST', body: '{}' });
    expect(res.status).toBe(500);
    expect(await res.text()).toBe('<html>error</html>');
  });
});
