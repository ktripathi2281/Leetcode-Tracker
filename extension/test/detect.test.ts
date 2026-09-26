import { describe, expect, it, vi } from 'vitest';
import { createDetector, type AcceptedSubmission } from '../src/lib/detect';

// Shapes recorded from LeetCode's submit flow.
const SUBMIT_URL = 'https://leetcode.com/problems/two-sum/submit/';
const submitBody = JSON.stringify({ lang: 'python3', question_id: '1', typed_code: 'class Solution: ...' });
const checkUrl = (id: string | number) => `https://leetcode.com/submissions/detail/${id}/check/`;

const pendingCheck = { state: 'STARTED' };
const accepted = (id: number) => ({
  status_code: 10,
  lang: 'python3',
  run_success: true,
  status_runtime: '3 ms',
  status_memory: '17.9 MB',
  question_id: '1',
  task_finish_time: 1_790_400_000_000,
  state: 'SUCCESS',
  status_msg: 'Accepted',
  submission_id: String(id),
});
const wrongAnswer = (id: number) => ({ ...accepted(id), status_code: 11, status_msg: 'Wrong Answer' });

function setup() {
  const found: AcceptedSubmission[] = [];
  const detector = createDetector((s) => found.push(s), () => new Date('2026-09-26T10:00:00Z'));
  return { found, detector };
}

describe('detecting accepted submissions', () => {
  it('reports an accepted submission with the code that was submitted', () => {
    const { found, detector } = setup();
    detector.observe(SUBMIT_URL, 'POST', submitBody, { submission_id: 1234 });
    detector.observe(checkUrl(1234), 'GET', null, pendingCheck);
    expect(found).toHaveLength(0); // still judging

    detector.observe(checkUrl(1234), 'GET', null, accepted(1234));
    expect(found).toEqual([
      {
        slug: 'two-sum',
        submissionId: '1234',
        lang: 'python3',
        code: 'class Solution: ...',
        acceptedAt: new Date(1_790_400_000_000).toISOString(),
        runtime: '3 ms',
        memory: '17.9 MB',
      },
    ]);
  });

  it('ignores submissions that were not accepted', () => {
    const { found, detector } = setup();
    detector.observe(SUBMIT_URL, 'POST', submitBody, { submission_id: 1 });
    detector.observe(checkUrl(1), 'GET', null, wrongAnswer(1));
    expect(found).toHaveLength(0);
    expect(detector.pendingCount()).toBe(0);
  });

  it('reports each submission once, even if the result is fetched again', () => {
    const { found, detector } = setup();
    detector.observe(SUBMIT_URL, 'POST', submitBody, { submission_id: 7 });
    detector.observe(checkUrl(7), 'GET', null, accepted(7));
    detector.observe(checkUrl(7), 'GET', null, accepted(7));
    expect(found).toHaveLength(1);
  });

  it('ignores "Run" results and checks it never saw submitted', () => {
    const { found, detector } = setup();
    // "Run" uses a different endpoint and interprets code without submitting it.
    detector.observe('https://leetcode.com/problems/two-sum/interpret_solution/', 'POST', submitBody, { interpret_id: 'x' });
    detector.observe(checkUrl(99), 'GET', null, accepted(99));
    expect(found).toHaveLength(0);
  });

  it('keeps simultaneous submissions apart', () => {
    const { found, detector } = setup();
    detector.observe(SUBMIT_URL, 'POST', submitBody, { submission_id: 1 });
    detector.observe(
      'https://leetcode.com/problems/lru-cache/submit/',
      'POST',
      JSON.stringify({ lang: 'java', question_id: '146', typed_code: 'class LRUCache {}' }),
      { submission_id: 2 },
    );
    detector.observe(checkUrl(2), 'GET', null, { ...accepted(2), lang: 'java' });
    detector.observe(checkUrl(1), 'GET', null, accepted(1));
    expect(found.map((s) => [s.slug, s.lang])).toEqual([
      ['lru-cache', 'java'],
      ['two-sum', 'python3'],
    ]);
  });

  it('works with relative URLs and query strings', () => {
    const { found, detector } = setup();
    detector.observe('/problems/two-sum/submit/', 'POST', submitBody, { submission_id: 5 });
    detector.observe('/submissions/detail/5/check/?t=1', 'GET', null, accepted(5));
    expect(found).toHaveLength(1);
  });

  it('shrugs off malformed traffic', () => {
    const { found, detector } = setup();
    detector.observe(SUBMIT_URL, 'POST', 'not json', { submission_id: 1 });
    detector.observe(SUBMIT_URL, 'POST', submitBody, null);
    detector.observe(SUBMIT_URL, 'GET', submitBody, { submission_id: 3 });
    detector.observe(checkUrl(1), 'GET', null, 'garbage');
    expect(found).toHaveLength(0);
  });

  it('forgets old submissions that never got a result', () => {
    const { detector } = setup();
    for (let i = 0; i < 30; i++) detector.observe(SUBMIT_URL, 'POST', submitBody, { submission_id: i });
    expect(detector.pendingCount()).toBe(20);
  });

  it('uses the current time when LeetCode gives no finish time', () => {
    const onAccepted = vi.fn();
    const detector = createDetector(onAccepted, () => new Date('2026-09-26T10:00:00Z'));
    detector.observe(SUBMIT_URL, 'POST', submitBody, { submission_id: 8 });
    const { task_finish_time: _drop, ...noTime } = accepted(8);
    detector.observe(checkUrl(8), 'GET', null, noTime);
    expect(onAccepted.mock.calls[0]![0].acceptedAt).toBe('2026-09-26T10:00:00.000Z');
  });
});
