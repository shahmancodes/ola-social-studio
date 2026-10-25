/** Derive one visible linear domain from canonical numeric data. Percent shares use the whole 0–100 range. */
export function barScale(values:number[],unit:string){
 const data=values.filter(Number.isFinite),low=Math.min(0,...data),high=Math.max(0,...data);
 if(unit.trim()==='%'&&low>=0&&high<=100)return {min:0,max:100,ticks:[0,50,100]};
 const step=10**Math.floor(Math.log10(Math.max(1,high-low))),min=Math.floor(low/step)*step,max=Math.max(min+step,Math.ceil(high/step)*step);
 return{min,max,ticks:[min,(min+max)/2,max]};
}
