import { describe, expect, it } from "vitest";
import { evidenceExcerpt, readableEvidence } from "./evidence-excerpts";

describe("source evidence passages", () => {
  it("extracts the article after a long navigation shell and decodes text", () => {
    const html = `<html><nav>${"Navigation link ".repeat(15000)}</nav><main><h1>CI/CD</h1><p>Jobs run on runners &amp; stages order them.</p><script>Invented fact</script></main></html>`;
    expect(readableEvidence(html, "text/html")).toBe("CI/CD Jobs run on runners & stages order them.");
  });

  it("selects supporting facts late in the document within each source budget", () => {
    const fact = "Parent-child pipelines run within a project. Multi-project pipelines span multiple projects.";
    const page = `${"General introductory material. ".repeat(3000)} ${fact} ${"More unrelated documentation. ".repeat(1000)}`;
    const excerpt = evidenceExcerpt(page, "Pipeline architecture supports parent-child and multi-project pipelines", "GitLab pipeline architecture", 4000);
    expect(excerpt).toContain(fact);
    expect(excerpt.length).toBeLessThanOrEqual(4000);
    for (const passage of excerpt.split(" […] ")) expect(page).toContain(passage);
    expect(excerpt).not.toContain("automatically wins");
  });

  it("preserves Markdown and plain text evidence", () => {
    expect(readableEvidence("# Jobs\n\nRunners execute jobs.", "text/markdown")).toBe("# Jobs Runners execute jobs.");
  });
});
