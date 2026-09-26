import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CalendarPicker } from './CalendarPicker';

const getDatesWithShots = vi.hoisted(() => vi.fn());
vi.mock('../../bridge', () => ({ bridge: { getDatesWithShots } }));

afterEach(() => {
    cleanup();
    vi.resetAllMocks();
});

it('keeps dates from the latest filters when an older request finishes last', async () => {
    let finishOld!: (dates: string[]) => void;
    let finishNew!: (dates: string[]) => void;
    getDatesWithShots
        .mockImplementationOnce(() => new Promise<string[]>((resolve) => { finishOld = resolve; }))
        .mockImplementationOnce(() => new Promise<string[]>((resolve) => { finishNew = resolve; }));
    const { rerender } = render(<CalendarPicker value="2026-09-01" onChange={vi.fn()} folderId={1} />);
    rerender(<CalendarPicker value="2026-09-01" onChange={vi.fn()} folderId={2} />);
    await act(async () => { finishNew(['2026-09-02']); });
    await act(async () => { finishOld(['2026-09-03']); });
    fireEvent.click(screen.getByText('2026-09-01'));
    expect(screen.getByRole('button', { name: '2', exact: true }).querySelector('div')).not.toBeNull();
    expect(screen.getByRole('button', { name: '3', exact: true }).querySelector('div')).toBeNull();
});
