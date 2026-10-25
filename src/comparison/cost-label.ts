import type { Attempt } from './types';

export function costLabel(attempt: Attempt | undefined, fixture: boolean) {
  if (fixture) return 'Fixture · no provider calls';
  const active = attempt && ['queued', 'running', 'awaiting-input'].includes(attempt.status);
  const usage = attempt?.usage;
  if (!usage?.calls) return active ? 'Cost pending' : 'Cost unavailable';
  if (usage.costUsd === null) return usage.pending ? 'Cost pending' : 'Cost unavailable';
  const amount = usage.costUsd > 0 && usage.costUsd < .0001 ? '<$0.0001' : `$${usage.costUsd.toFixed(4)}`;
  const prefix = usage.incomplete ? 'Partial · ' : usage.records.some(r => r.costSource === 'estimated') ? 'Est. · ' : '';
  return `${prefix}${amount}${usage.pending ? ' · pending' : ''}`;
}
