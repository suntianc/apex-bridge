import { ConversationSaver } from "@/services/chat/ConversationSaver";
import type { Message } from "@/types";

function getSavedMessagesArg(mockFn: jest.Mock) {
  return mockFn.mock.calls[mockFn.mock.calls.length - 1][1] as Message[];
}

describe("ConversationSaver dedup behavior", () => {
  it("should not re-save full history each round (only last user + assistant)", async () => {
    const mockConversationHistoryService = {
      getMessageCount: jest.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(2),
      saveMessages: jest.fn(),
    } as any;

    const mockSessionManager = {
      updateMetadata: jest.fn(),
    } as any;

    const saver = new ConversationSaver(mockConversationHistoryService, mockSessionManager);

    const round1: Message[] = [{ role: "user", content: "U1" }];
    await saver.save("c1", round1, "A1");
    expect(getSavedMessagesArg(mockConversationHistoryService.saveMessages)).toHaveLength(2);

    const round2: Message[] = [
      { role: "user", content: "U1" },
      { role: "assistant", content: "A1" },
      { role: "user", content: "U2" },
    ];
    await saver.save("c1", round2, "A2");
    const saved2 = getSavedMessagesArg(mockConversationHistoryService.saveMessages);

    expect(saved2).toHaveLength(2);
    expect(saved2[0]).toMatchObject({ role: "user", content: "U2" });
    expect(saved2[1].role).toBe("assistant");
  });
});
