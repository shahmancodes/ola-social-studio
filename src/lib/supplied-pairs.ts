export type SuppliedPair = {label:{start:number;end:number};detail:{start:number;end:number}};

/** Only explicit quoted label/detail lists are structural copy, never arbitrary quoted prose. */
export function suppliedPairs(brief:string):SuppliedPair[]{
 const header=/\blabel\s*(?:\/|and|&)\s*detail\s+pairs?\s*:/i.exec(brief);
 if(!header)return [];
 const quote=new RegExp(`\\s*(?:"([^"\\n]+)"|“([^”\\n]+)”|'([^'\\n]+)')`,'y');
 let offset=header.index+header[0].length;
 const quoted=()=>{quote.lastIndex=offset;const match=quote.exec(brief);if(!match)return undefined;const value=match[1]??match[2]??match[3],start=match.index+match[0].indexOf(value);offset=quote.lastIndex;return{start,end:start+value.length};};
 const result:SuppliedPair[]=[];
 while(offset<brief.length){
  const label=quoted();if(!label)break;
  const slash=/^\s*\/\s*/.exec(brief.slice(offset));if(!slash)break;offset+=slash[0].length;
  const detail=quoted();if(!detail)break;
  result.push({label,detail});
  const next=/^\s*;\s*/.exec(brief.slice(offset));if(!next)break;offset+=next[0].length;
 }
 return result;
}
