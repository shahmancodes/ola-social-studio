import {it,expect} from 'vitest';
import {suppliedPairs} from './supplied-pairs';

it('returns source offsets for explicit pairs with straight, curly and single quotes',()=>{
 const brief=`Include these label/detail pairs: "Signal" / "Signal is visible."; “Action” / “Check the source.”; 'Owner' / 'A named team.' Other instructions follow.`;
 expect(suppliedPairs(brief).map(pair=>[brief.slice(pair.label.start,pair.label.end),brief.slice(pair.detail.start,pair.detail.end)])).toEqual([['Signal','Signal is visible.'],['Action','Check the source.'],['Owner','A named team.']]);
});
it.each([
 'Compare "Source" / "Claim" and use quotes in the prose.',
 'Include a headline: "Source". The detail is "Claim".',
 'The label/detail pairs are examples, not supplied wording: make suitable pairs.',
 'Label/detail pairs: "Only a label", then prose mentioning "detail".',
])('does not infer a pair from ambiguous prose: %s',brief=>expect(suppliedPairs(brief)).toEqual([]));
it('stops before instructions and unrelated later quotes',()=>{
 const brief='Label and detail pairs: "Signal" / "Check it.". Use the headline "A useful signal" and end with "Consider it."';
 expect(suppliedPairs(brief)).toHaveLength(1);
});
