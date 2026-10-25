import { expect, it } from 'vitest';
import { costLabel } from './cost-label';
import type { Attempt } from './types';

it('distinguishes fixtures, missing billing, estimates, partial totals and sub-cent charges', () => {
  const attempt = { status: 'complete' } as Attempt;
  expect(costLabel(attempt, true)).toBe('Fixture · no provider calls');
  expect(costLabel(attempt, false)).toBe('Cost unavailable');
  expect(costLabel({ ...attempt, status: 'running' }, false)).toBe('Cost pending');
  const usage = { calls: 1, costUsd: .000001, records: [{ costSource: 'estimated' }], pending: 0, incomplete: false } as Attempt['usage'];
  expect(costLabel({ ...attempt, usage }, false)).toBe('Est. · <$0.0001');
  expect(costLabel({ ...attempt, usage: { ...usage!, costUsd: .1234, incomplete: true, pending: 1 } }, false)).toBe('Partial · $0.1234 · pending');
  expect(costLabel({ ...attempt, usage: { ...usage!, costUsd: 0, records: [{costSource:'reported'}] as any } }, false)).toBe('$0.0000');
});
