/**
 * think-off — strip model thinking from context so it doesn't accumulate.
 *
 * Thinking blocks (extended reasoning) are still saved in the session file
 * for human review, but are removed from the messages sent to the LLM on
 * each turn. This keeps context usage low while preserving the full history
 * on disk.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.on("context", async (event, _ctx) => {
    const pruned = event.messages.map((msg) => {
      // Only touch assistant messages — thinking blocks live there
      if (msg.role !== "assistant") return msg;

      const content = msg.content as Array<{ type: string }>;
      const filtered = content.filter((block) => block.type !== "thinking");

      if (filtered.length === content.length) return msg; // nothing to remove

      return { ...msg, content: filtered };
    });

    return { messages: pruned };
  });
}
