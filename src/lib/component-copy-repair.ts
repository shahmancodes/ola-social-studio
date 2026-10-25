import { z } from "zod";
import { representationCopyPolicy } from "./content-representation";

type Field = { path: PropertyKey[]; name: string; value: string; maximum: number };
const componentField = /^(?:(?:slides|sections)\.\d+\.)?semanticComponent\.(?:prompt|answer|leftTitle|rightTitle|takeaway|note|items\.\d+\.(?:label|detail|tag))$/;
const parse = (raw: string) => JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, ""));

/** Repair generated component strings before strict artifact parsing; never truncate supplied copy. */
export async function repairComponentCopy<T extends z.ZodType>(
  schema: T,
  input: unknown,
  brief: string,
  ask: (prompt: string) => Promise<string>,
  record?: (data: unknown) => void,
): Promise<z.infer<T>> {
  let candidate = structuredClone(input);
  let feedback = "";
  const exact = representationCopyPolicy(brief).exactCopyRefs.map(ref => brief.slice(ref.start, ref.end));
  for (let pass = 0; pass < 2; pass++) {
    const parsed = schema.safeParse(candidate);
    if (parsed.success) return parsed.data;
    const fields: Field[] = [];
    for (const issue of parsed.error.issues) {
      const name = issue.path.join(".");
      if (issue.code !== "too_big" || issue.origin !== "string" || !componentField.test(name)) throw parsed.error;
      let value: unknown = candidate;
      for (const key of issue.path) value = (value as Record<PropertyKey, unknown>)[key];
      if (typeof value !== "string") throw parsed.error;
      if (brief.includes(value) || exact.some(text => text && value.includes(text))) {
        throw new Error(`Supplied copy in ${name} exceeds its ${issue.maximum}-character component limit. Preserve the wording and choose a representation that fits it.`);
      }
      fields.push({ path: issue.path, name, value, maximum: Number(issue.maximum) });
    }
    // Per-field schemas encode the actual limit; only rejected fields may be edited.
    const editsSchema = z.object({ edits: z.array(z.union(fields.map(field => z.object({
      source: z.literal(field.name), value: z.string().min(1).max(field.maximum),
    }).strict()))).length(fields.length) }).strict();
    const prompt = `Shorten only the GENERATED component copy listed below to meet each field's character limit. Preserve facts, names, numbers, units, qualifications and the relationship between paired comparison entries. Do not truncate mid-sentence or add claims. Keep every other field unchanged. Return JSON DATA matching ${JSON.stringify(z.toJSONSchema(editsSchema))}. Return exactly one edit per listed source. Fields: ${JSON.stringify(fields.map(({name, value, maximum}) => ({source:name, value, maximum})))}. Draft context: ${JSON.stringify(candidate)}. Authoritative brief: ${brief}.${feedback ? ` Previous shortening attempt rejected: ${feedback}` : ""}`;
    try {
      const result = editsSchema.parse(parse(await ask(prompt))) as { edits: Array<{source: string; value: string}> };
      if (new Set(result.edits.map(edit => edit.source)).size !== fields.length) throw new Error("Return each rejected source exactly once.");
      const next = structuredClone(candidate);
      for (const edit of result.edits) {
        const field = fields.find(item => item.name === edit.source)!;
        let node: unknown = next;
        for (const key of field.path.slice(0, -1)) node = (node as Record<PropertyKey, unknown>)[key];
        (node as Record<PropertyKey, unknown>)[field.path.at(-1)!] = edit.value;
      }
      const repaired = schema.parse(next);
      record?.({ pass, fields: fields.map(field => field.name), edits: result.edits });
      return repaired;
    } catch (error) {
      feedback = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error("Generated component copy repair failed: the descriptions still exceed their limits or the shortening response was invalid.");
}
