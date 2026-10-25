import { describe, expect, it, vi } from "vitest";
import { repairComponentCopy } from "./component-copy-repair";
import { SimpleArtifactSchema } from "./simple-content";

const tooLong = "This description is far too verbose for a concise comparison entry and needs to be rewritten with the same qualified meaning while retaining any important numbers and factual constraints.";
const component = () => ({kind:"comparison", leftTitle:"GitHub", rightTitle:"GitLab", items:[
  {label:"Reviews", detail:tooLong}, {label:"CI/CD", detail:tooLong, value:42},
]});
const poster = () => ({type:"poster", headline:"GitHub vs GitLab", subline:"A neutral comparison.", semanticComponent:component()});

describe("generated component length repair", () => {
  it("shortens only rejected descriptions while preserving labels, numbers and other copy", async () => {
    const input = poster(), ask = vi.fn().mockResolvedValue(JSON.stringify({edits:[
      {source:"semanticComponent.items.0.detail", value:"Reviews support comments, approvals and change requests."},
      {source:"semanticComponent.items.1.detail", value:"YAML jobs run on runners, organized into stages."},
    ]})), record = vi.fn();
    const output = await repairComponentCopy(SimpleArtifactSchema, input, "A professional comparison for developers.", ask, record);
    expect(output.type).toBe("poster");
    if (output.type !== "poster") throw Error("Wrong artifact type");
    expect(output.headline).toBe(input.headline);
    expect(output.subline).toBe(input.subline);
    expect(output.semanticComponent?.items.map(item => item.label)).toEqual(["Reviews", "CI/CD"]);
    expect(output.semanticComponent?.items[1].value).toBe(42);
    expect(output.semanticComponent?.items.every(item => item.detail.length <= 140)).toBe(true);
    expect(input.semanticComponent.items[0].detail).toBe(tooLong);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledTimes(1);
  });

  it.each(["slides", "sections"])("repairs a nested %s field without changing other pages", async (key) => {
    const input = key === "slides" ? {type:"carousel",title:"Compare",caption:"",slides:[
      {title:"First",body:"Keep this."}, {title:"Comparison",body:"",semanticComponent:component()}, {title:"Close",body:"Keep this too."},
    ]} : {type:"article",title:"Compare",sections:[{title:"First",body:"Keep this."},{title:"Comparison",body:"",semanticComponent:component()}]};
    const ask = vi.fn().mockResolvedValue(JSON.stringify({edits:[
      {source:`${key}.1.semanticComponent.items.0.detail`,value:"Qualified review support."},
      {source:`${key}.1.semanticComponent.items.1.detail`,value:"Jobs run in stages."},
    ]}));
    const output = await repairComponentCopy(SimpleArtifactSchema,input,"Compare two tools.",ask);
    expect(output.type).toBe(input.type);
    if (output.type === "carousel") expect(output.slides[0].body).toBe("Keep this.");
    if (output.type === "article") expect(output.sections[0].body).toBe("Keep this.");
  });

  it("does not call the model for already valid content", async () => {
    const ask = vi.fn();
    const input = {type:"poster", headline:"Short headline", subline:"Clear detail."};
    expect(await repairComponentCopy(SimpleArtifactSchema,input,"Create a poster.",ask)).toEqual(SimpleArtifactSchema.parse(input));
    expect(ask).not.toHaveBeenCalled();
  });

  it("rejects attempts to edit a valid field, gives feedback and retries only the rejected fields", async () => {
    const ask = vi.fn().mockResolvedValueOnce(JSON.stringify({edits:[{source:"headline",value:"Changed"}]}))
      .mockResolvedValueOnce(JSON.stringify({edits:[{source:"semanticComponent.items.0.detail",value:"Short description."}]}));
    const input = poster(); input.semanticComponent.items[1].detail = "Valid detail.";
    const output = await repairComponentCopy(SimpleArtifactSchema,input,"Create a poster.",ask);
    expect(output.type === "poster" && output.headline).toBe(input.headline);
    expect(ask).toHaveBeenCalledTimes(2);
    expect(ask.mock.calls[1][0]).toContain("Previous shortening attempt rejected");
  });

  it("fails within two attempts when the model keeps exceeding the actual limit", async () => {
    const ask = vi.fn().mockResolvedValue(JSON.stringify({edits:[
      {source:"semanticComponent.items.0.detail",value:tooLong},
      {source:"semanticComponent.items.1.detail",value:tooLong},
    ]}));
    await expect(repairComponentCopy(SimpleArtifactSchema,poster(),"Create a poster.",ask)).rejects.toThrow("Generated component copy repair failed");
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it("preserves verbatim supplied wording rather than silently shortening it", async () => {
    const ask = vi.fn();
    await expect(repairComponentCopy(SimpleArtifactSchema,poster(),`Include this exact detail: “${tooLong}”`,ask)).rejects.toThrow("Supplied copy");
    expect(ask).not.toHaveBeenCalled();
  });

  it("leaves structural validation failures to the existing draft repair", async () => {
    const ask = vi.fn(), input = poster(); input.semanticComponent.leftTitle = "";
    await expect(repairComponentCopy(SimpleArtifactSchema,input,"Create a poster.",ask)).rejects.toThrow();
    expect(ask).not.toHaveBeenCalled();
  });
});
