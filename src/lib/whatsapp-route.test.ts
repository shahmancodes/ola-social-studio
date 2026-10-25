import { beforeEach, describe, expect, it, vi } from "vitest";
const calls = vi.hoisted(() => ({ message: vi.fn(), signature: vi.fn() }));
vi.mock("./whatsapp", () => ({ processWhatsAppMessage: calls.message, verifyMetaSignature: calls.signature }));
vi.mock("./platform-db", () => ({ db: () => ({ prepare: vi.fn() }) }));
import { POST } from "../app/api/whatsapp/webhook/route";
beforeEach(() => { vi.clearAllMocks(); calls.signature.mockReturnValue(true); calls.message.mockResolvedValue(undefined); });
describe("WhatsApp webhook chat input", () => {
  it("passes image captions and interactive proposal replies to the conversation", async () => {
    const messages = [
      { from: "test", id: "image-1", image: { id: "media-1", caption: "Use this as a visual reference" } },
      { from: "test", id: "button-1", interactive: { button_reply: { title: "accept changes" } } },
    ];
    const response = await POST(new Request("http://localhost/api/whatsapp/webhook", { method: "POST", body: JSON.stringify({ entry: [{ changes: [{ value: { messages } }] }] }) }));
    expect(response.status).toBe(200);
    expect(calls.message).toHaveBeenNthCalledWith(1, { phone: "test", externalId: "image-1", text: "Use this as a visual reference", media: { id: "media-1", name: "reference-image" } });
    expect(calls.message).toHaveBeenNthCalledWith(2, { phone: "test", externalId: "button-1", text: "accept changes", media: undefined });
  });
  it("rejects unverified requests before processing a message", async () => {
    calls.signature.mockReturnValue(false);
    expect((await POST(new Request("http://localhost", { method: "POST", body: "{}" }))).status).toBe(401);
    expect(calls.message).not.toHaveBeenCalled();
  });
});
