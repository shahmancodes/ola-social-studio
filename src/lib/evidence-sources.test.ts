import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./internet-assets", () => ({ safeRemoteUrl: async (raw: string) => {
  const url = new URL(raw);
  if (url.hostname === "127.0.0.1") throw new Error("Private address rejected");
  return url;
} }));
import { reopenedPage, resolveEvidenceSources } from "./evidence-sources";
import * as excerpts from "./evidence-excerpts";

const source = (url: string, claim = "A supported fact") => ({ title: "Study", url, claim });
const readable = () => new Response(`<html><body>${"Primary research text about learning and retention. ".repeat(12)}</body></html>`, { headers: { "content-type": "text/html" } });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("independent source access and recovery", () => {
  it("replaces a publisher 403 with a reopened source, preserving source indices and replacement claims", async () => {
    const blocked = source("https://journal.example/blocked"), valid = source("https://official.example/guide");
    const replacement = source("https://university.example/study", "The replacement's narrower supported fact");
    const fetcher = vi.fn(async (url: URL) => url.pathname === "/blocked" ? new Response("Forbidden", { status: 403 }) : readable());
    vi.stubGlobal("fetch", fetcher);
    const find = vi.fn().mockResolvedValue([blocked, source("https://other.example/blocked"), replacement]);
    const notify = vi.fn();
    const resolved = await resolveEvidenceSources([blocked, valid], find, notify);
    expect(resolved).toEqual([replacement, valid]);
    expect(find).toHaveBeenCalledExactlyOnceWith(blocked, "HTTP 403 or unreadable source");
    expect(notify).toHaveBeenCalledExactlyOnceWith(blocked, replacement);
    expect(fetcher.mock.calls.map(([url]) => url.toString())).toContain(replacement.url);
    expect(blocked.url).toBe("https://journal.example/blocked");
  });

  it("keeps readable sources without doing additional research", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => readable()));
    const find = vi.fn(), sources = [source("https://official.example/guide")];
    expect(await resolveEvidenceSources(sources, find)).toEqual(sources);
    expect(find).not.toHaveBeenCalled();
  });

  it("fails when search results cannot be reopened instead of trusting search claims", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Forbidden", { status: 403 })));
    const find = vi.fn().mockResolvedValue([source("https://another.example/paper")]);
    await expect(resolveEvidenceSources([source("https://journal.example/paper")], find)).rejects.toThrow("No readable replacement was found");
    expect(find).toHaveBeenCalledTimes(1);
  });

  it("does not hide provider credential failures during replacement research", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Forbidden", { status: 403 })));
    await expect(resolveEvidenceSources([source("https://journal.example/paper")], async () => { throw new Error("OpenRouter 403: forbidden"); })).rejects.toThrow("OpenRouter 403: forbidden");
  });

  it("propagates parser programming errors without doing replacement research", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => readable()));
    vi.spyOn(excerpts, "readableEvidence").mockImplementation(() => { throw new ReferenceError("readableEvidence is not defined"); });
    const replace = vi.fn();
    await expect(resolveEvidenceSources([source("https://nasa.example/artemis-ii")], replace)).rejects.toThrow(ReferenceError);
    expect(replace).not.toHaveBeenCalled();
  });

  it("validates redirect destinations before fetching them", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 302, headers: { location: "http://127.0.0.1/private" } }));
    vi.stubGlobal("fetch", fetcher);
    await expect(reopenedPage("https://journal.example/paper")).rejects.toThrow("Private address rejected");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
