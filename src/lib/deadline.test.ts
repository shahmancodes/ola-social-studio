import {afterEach,describe,expect,it,vi} from 'vitest';
import {withDeadline} from './deadline';
afterEach(()=>vi.useRealTimers());
describe('provider deadlines',()=>{
  it('settles and cancels even when the provider ignores cancellation',async()=>{
    vi.useFakeTimers();let signal:AbortSignal|undefined;
    const result=withDeadline(125_000,s=>{signal=s;return new Promise(()=>{});});
    const assertion=expect(result).rejects.toThrow('deadline exceeded');
    await vi.advanceTimersByTimeAsync(125_000);await assertion;
    expect(signal?.aborted).toBe(true);expect(vi.getTimerCount()).toBe(0);
  });
  it('clears the timer after provider success or failure',async()=>{
    vi.useFakeTimers();expect(await withDeadline(100,async()=>42)).toBe(42);
    await expect(withDeadline(100,async()=>{throw new Error('Unavailable');})).rejects.toThrow('Unavailable');
    expect(vi.getTimerCount()).toBe(0);
  });
});
