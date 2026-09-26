import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ProblemListResponse } from '@lct/shared';
import { api } from '../api/client';
import { apiError, makeProblem, renderApp, signedIn } from '../test/utils';

const twoSum = makeProblem();
const lru = makeProblem({ id: 'p2', title: 'LRU Cache', slug: 'lru-cache', leetcodeNumber: 146, difficulty: 'Medium', status: 'Solved' });
const facets = { tags: ['Array', 'Hash Table'], companies: [] };
const listOf = (...problems: typeof twoSum[]): ProblemListResponse => ({ problems, total: problems.length, page: 1, pages: 1 });

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('problem list', () => {
  it('shows problems and filters by status through the URL', async () => {
    const get = signedIn({
      '/problems': (params) => (params?.status === 'Solved' ? listOf(lru) : listOf(twoSum, lru)),
      '/problems/facets': facets,
    });
    renderApp('/problems');

    expect(await screen.findByText('Two Sum')).toBeInTheDocument();
    expect(screen.getByText('2 problems tracked')).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Status'), 'Solved');
    expect(await screen.findByText('1 problem match')).toBeInTheDocument();
    expect(screen.queryByText('Two Sum')).not.toBeInTheDocument();
    expect(get).toHaveBeenCalledWith('/problems', { params: expect.objectContaining({ status: 'Solved', page: 1 }) });
  });

  it('invites you to add a first problem when the list is empty', async () => {
    signedIn({ '/problems': listOf(), '/problems/facets': { tags: [], companies: [] } });
    renderApp('/problems');
    expect(await screen.findByText('No problems yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add your first problem' })).toHaveAttribute('href', '/problems/new');
  });

  it('offers to clear filters when nothing matches', async () => {
    signedIn({ '/problems': listOf(), '/problems/facets': facets });
    renderApp('/problems?difficulty=Hard');
    expect(await screen.findByText('No problems match these filters')).toBeInTheDocument();
  });
});

describe('adding a problem', () => {
  it('auto-fills from a pasted LeetCode link and saves', async () => {
    signedIn({
      '/problems/facets': facets,
      '/leetcode/problems/two-sum': {
        slug: 'two-sum',
        leetcodeNumber: 1,
        title: 'Two Sum',
        difficulty: 'Easy',
        tags: ['Array', 'Hash Table'],
        isPaidOnly: false,
        link: 'https://leetcode.com/problems/two-sum/',
      },
      '/problems/p1': twoSum,
    });
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: twoSum });
    renderApp('/problems/new');

    const link = await screen.findByLabelText('LeetCode link');
    fireEvent.paste(link, { clipboardData: { getData: () => 'https://leetcode.com/problems/two-sum/description/' } });

    expect(await screen.findByText('Filled in from LeetCode')).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('Two Sum');
    expect(screen.getByLabelText('Problem number')).toHaveValue(1);
    expect(screen.getByLabelText('Difficulty')).toHaveValue('Easy');

    await userEvent.type(screen.getByLabelText('Notes'), 'Use a hash map');
    await userEvent.click(screen.getByRole('button', { name: 'Save problem' }));

    expect(post).toHaveBeenCalledWith(
      '/problems',
      expect.objectContaining({
        title: 'Two Sum',
        leetcodeNumber: 1,
        difficulty: 'Easy',
        link: 'https://leetcode.com/problems/two-sum/',
        tags: ['Array', 'Hash Table'],
        notes: 'Use a hash map',
        timeTakenMinutes: null,
      }),
    );
    expect(await screen.findByRole('heading', { name: '#1Two Sum' })).toBeInTheDocument();
  });

  it('requires a title and difficulty before saving', async () => {
    signedIn({ '/problems/facets': facets });
    const post = vi.spyOn(api, 'post');
    renderApp('/problems/new');
    await userEvent.click(await screen.findByRole('button', { name: 'Save problem' }));
    expect(screen.getByText('Title is required')).toBeInTheDocument();
    expect(screen.getByText('Choose a difficulty')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalledWith('/problems', expect.anything());
  });

  it('links to the existing problem when it is already tracked', async () => {
    signedIn({ '/problems/facets': facets });
    vi.spyOn(api, 'post').mockRejectedValue(
      apiError(409, { message: "You're already tracking this problem", existingId: 'p1' }),
    );
    renderApp('/problems/new');
    await userEvent.type(await screen.findByLabelText('Title'), 'Two Sum');
    await userEvent.selectOptions(screen.getByLabelText('Difficulty'), 'Easy');
    await userEvent.click(screen.getByRole('button', { name: 'Save problem' }));

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByRole('link', { name: 'Open it' })).toHaveAttribute('href', '/problems/p1');
    expect(alert).toHaveFocus(); // brought into view, since the form is long
  });

  it('adds topics with Enter and from suggestions', async () => {
    signedIn({ '/problems/facets': facets });
    renderApp('/problems/new');
    const topics = await screen.findByLabelText('Topics');
    await userEvent.type(topics, 'dynamic programming{Enter}');
    await userEvent.click(screen.getByRole('button', { name: '+ Array' }));
    expect(screen.getByText('Dynamic Programming')).toBeInTheDocument(); // matched LeetCode's spelling
    expect(screen.getByRole('button', { name: 'Remove Array' })).toBeInTheDocument();
  });
});

describe('problem detail', () => {
  it('changes status with one click', async () => {
    signedIn({ '/problems/p1': twoSum });
    const patch = vi.spyOn(api, 'patch').mockResolvedValue({ data: { ...twoSum, status: 'Solved' } });
    renderApp('/problems/p1');

    await userEvent.click(await screen.findByRole('button', { name: 'Solved' }));
    expect(patch).toHaveBeenCalledWith('/problems/p1', { status: 'Solved' });
    expect(await screen.findByRole('button', { name: 'Solved' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('asks before deleting', async () => {
    signedIn({ '/problems/p1': twoSum, '/problems': listOf(), '/problems/facets': facets });
    const del = vi.spyOn(api, 'delete').mockResolvedValue({ data: undefined });
    renderApp('/problems/p1');

    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(del).not.toHaveBeenCalled();
    const confirm = screen.getByRole('group', { name: 'Confirm delete' });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Delete' }));

    expect(del).toHaveBeenCalledWith('/problems/p1');
    expect(await screen.findByRole('heading', { name: 'Problems' })).toBeInTheDocument();
  });

  it('shows a friendly message for a missing problem', async () => {
    signedIn({ '/problems/nope': () => apiError(404, { message: 'Problem not found' }) });
    renderApp('/problems/nope');
    expect(await screen.findByText('Problem not found')).toBeInTheDocument();
  });
});
