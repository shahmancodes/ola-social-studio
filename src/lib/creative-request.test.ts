import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

const mocks = vi.hoisted(() => ({ create: vi.fn(), store: vi.fn(), queue: vi.fn(), run: vi.fn(), exec: vi.fn(), all: vi.fn() }));
vi.mock("./intake", () => ({ createIntakeRequest: mocks.create }));
vi.mock("./platform", () => ({ storeProjectReference: mocks.store, companyStorageDir: () => "/tmp/ola-intake-unit-fixture" }));
vi.mock("./platform-db", () => ({ db: () => ({ exec: mocks.exec, prepare: () => ({ run: mocks.run, all: mocks.all }) }), enqueue: mocks.queue, now: () => "2026-10-25T00:00:00Z" }));
import { createCreativeRequest, prepareBriefReferences } from "./creative-request";

beforeEach(() => { vi.clearAllMocks(); mocks.create.mockReturnValue("new-project"); mocks.store.mockResolvedValue("reference"); mocks.all.mockReturnValue([]); });
describe("reference image intake", () => {
  it("validates and normalizes actual image bytes before any project is created", async () => {
    const bytes = await sharp({ create: { width: 12, height: 8, channels: 3, background: "#ffffff" } }).jpeg().toBuffer();
    const prepared = await prepareBriefReferences([new File([new Uint8Array(bytes)], "reference.jpg", { type: "image/jpeg" })]);
    expect((await sharp(prepared[0].bytes).metadata()).format).toBe("png");
    await expect(prepareBriefReferences([new File(["not an image"], "fake.png", { type: "image/png" })])).rejects.toThrow();
    await expect(prepareBriefReferences(Array.from({ length: 5 }, () => new File(["image"], "one.png", { type: "image/png" })))).rejects.toThrow("up to 4");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("queues generation only after every reference has been stored", async () => {
    let release!: (value: string) => void;
    mocks.store.mockReturnValueOnce(new Promise<string>(resolve => { release = resolve; }));
    const task = createCreativeRequest({ companyId: "company", brief: "Create a poster" }, "user", [{ name: "ref.png", bytes: Buffer.from("image") }]);
    expect(mocks.create).toHaveBeenCalledWith("company", "user", "Create a poster", expect.objectContaining({ deferQueue: true, sourceBrief: "Create a poster" }));
    expect(mocks.queue).not.toHaveBeenCalled();
    release("stored");
    await expect(task).resolves.toBe("new-project");
    expect(mocks.queue).toHaveBeenCalledWith("new-project", "intake-route");
  });
  it("does not queue partial uploads and removes only the incomplete new request", async () => {
    mocks.store.mockRejectedValueOnce(new Error("Disk full"));
    await expect(createCreativeRequest({ companyId: "company", brief: "Create a poster" }, "user", [{ name: "ref.png", bytes: Buffer.from("image") }])).rejects.toThrow("Disk full");
    expect(mocks.queue).not.toHaveBeenCalled();
    expect(mocks.run).toHaveBeenCalledWith("new-project");
    expect(mocks.exec).toHaveBeenCalledWith("COMMIT");
  });
});
