import type { Attempt, Comparison, Contender, SharedInput } from "./types";
const engines = ["canva-direct", "canva-agent", "ola"] as const;
const labels = {"canva-direct":"Canva Direct", "canva-agent":"AI + Canva", ola:"Ola"};

export function comparisonContenders(c: Pick<Comparison, 'input'>): Contender[] {
  if (c.input.mode === 'ola') return c.input.companies?.length ? c.input.companies.map(company => ({id:`company-${company.companyId}`,engine:'ola',label:company.companyName,companyId:company.companyId,model:c.input.model})) : [{id:'ola',engine:'ola',label:'Ola',model:c.input.model}];
  if (c.input.mode === 'models') return (c.input.models ?? []).map((model, index) => ({ id: `model-${index + 1}`, engine: 'ola', label: model.model, model }));
  return engines.map(engine => ({ id: engine, engine, label: labels[engine], model: engine === 'canva-agent' ? c.input.model : undefined }));
}
export const contenderId = (a: Attempt) => a.contenderId ?? a.engine;

/** Resolve the frozen company for every launch and resume, including fixtures. */
export function contenderInput(input: SharedInput, id: string): SharedInput {
  if (input.mode !== 'ola' || !input.companies?.length) return input;
  const company = input.companies.find(c => `company-${c.companyId}` === id);
  if (!company) throw new Error('Company contender not found.');
  const { companies: _companies, ...shared } = input;
  return {...shared, ...company};
}
