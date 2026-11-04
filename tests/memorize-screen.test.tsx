import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { ToastProvider } from '../src/components/ui';
import { db } from '../src/lib/db';
import { addUserPoem, getPoem, memorizedVerses } from '../src/lib/store';
import MemorizeScreen from '../src/screens/Memorize';

const verses = [{ n: 1, misras: ['یک دو سه چهار', 'پنج شش هفت هشت'] }, { n: 2, misras: ['نه ده', 'یازده دوازده'] }];

function open(id: string, search = '') {
  const router = createMemoryRouter([{ path: '/poem/:poemId/memorize', element: <ToastProvider><MemorizeScreen /></ToastProvider> }, { path: '*', element: <p>جای دیگر</p> }], { initialEntries: [`/poem/${id}/memorize${search}`] });
  render(<RouterProvider router={router} />);
  return router;
}
const hidden = () => screen.queryAllByRole('button', { name: /واژهٔ پنهان/ });

describe('memorising screen', () => {
  beforeEach(async () => {
    const d = await db();
    await d.clear('userPoems');
    await d.clear('memorized');
  });
  afterEach(cleanup);

  it('fades a verse by stages, lets a word be peeked, and records recall only when asked', async () => {
    const id = await addUserPoem({ title: 'ت', poet: 'ش', verses });
    const router = open(id);
    await screen.findByText('خواندن');
    expect(hidden()).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: /پنهان‌کردن بیشتر/ }));
    expect(hidden()).toHaveLength(3); // a third of eight words, rounded up

    fireEvent.click(hidden()[0]);
    expect(hidden()).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: /پنهان‌کردن بیشتر/ }));
    fireEvent.click(screen.getByRole('button', { name: /پنهان‌کردن بیشتر/ }));
    expect(hidden()).toHaveLength(8);
    const poem = (await getPoem(id))!;
    expect((await memorizedVerses(poem)).size).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: /به یادم آمد/ }));
    await waitFor(() => expect(router.state.location.search).toBe('?v=2'));
    expect([...(await memorizedVerses(poem))]).toEqual([1]);
    expect(hidden()).toHaveLength(0); // the next verse starts fresh
  });

  it('opens a known verse as a test and celebrates when the poem is finished', async () => {
    const id = await addUserPoem({ title: null, poet: null, verses: [verses[1]] });
    open(id);
    await screen.findByText('خواندن');
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole('button', { name: /پنهان‌کردن بیشتر/ }));
    fireEvent.click(screen.getByRole('button', { name: /به یادم آمد/ }));
    await screen.findByText('همهٔ بیت‌ها را از بر کردی');

    fireEvent.click(screen.getByRole('button', { name: /مرور دوباره/ }));
    await screen.findByRole('button', { name: /هنوز یادم هست/ });
    expect(hidden()).toHaveLength(4);
  });

  it('shows the not-found page for a missing poem', async () => {
    open('u-none');
    await screen.findByText('این شعر پیدا نشد.');
  });
});
