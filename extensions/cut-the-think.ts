/**
 * cut-the-think — strip model thinking from context so it doesn't accumulate.
 *
 * Thinking blocks (extended reasoning) are always removed from messages sent
 * to the LLM. By default they are still saved in the session for human
 * review, but saving can be toggled with /ctt.
 */
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

type ContentBlock = { type: string };

interface CutTheThinkState {
  saveThinking: boolean;
}

const STATE_TYPE = "cut-the-think-state";

function removeThinkingBlocks<T extends { content: unknown }>(msg: T): T {
  if (!Array.isArray(msg.content)) return msg;

  const content = msg.content as ContentBlock[];
  const filtered = content.filter((block) => block.type !== "thinking");

  if (filtered.length === content.length) return msg;

  return { ...msg, content: filtered } as T;
}

export default function (pi: ExtensionAPI) {
  let saveThinking = true;

  function persistState() {
    pi.appendEntry<CutTheThinkState>(STATE_TYPE, { saveThinking });
  }

  function restoreState(ctx: ExtensionContext) {
    saveThinking = true;

    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type !== "custom" || entry.customType !== STATE_TYPE) continue;

      const data = entry.data as CutTheThinkState | undefined;
      if (typeof data?.saveThinking === "boolean") {
        saveThinking = data.saveThinking;
      }
    }
  }

  function updateStatus(ctx: ExtensionContext) {
    ctx.ui.setStatus(
      "cut-the-think",
      saveThinking ? undefined : ctx.ui.theme.fg("warning", "[CTT]"),
    );
  }

  function notifyStatus(ctx: ExtensionContext) {
    updateStatus(ctx);
    ctx.ui.notify(
      saveThinking
        ? "cut-the-think: thinking blocks are kept in the session"
        : "cut-the-think: thinking blocks are NOT saved to the session",
      "info",
    );
  }

  pi.registerCommand("ctt", {
    description: "Control whether model thinking blocks are saved to the session. Usage: /ctt [off|on|status]",
    getArgumentCompletions: (prefix: string) => {
      const values = ["off", "on", "status"];
      const items = values
        .filter((value) => value.startsWith(prefix.trim()))
        .map((value) => ({ value, label: value }));
      return items.length > 0 ? items : null;
    },
    handler: async (args, ctx) => {
      const action = args.trim().toLowerCase();

      if (!action) {
        saveThinking = !saveThinking;
        persistState();
        notifyStatus(ctx);
        return;
      }

      if (action === "off") {
        saveThinking = true;
        persistState();
        notifyStatus(ctx);
        return;
      }

      if (action === "on") {
        saveThinking = false;
        persistState();
        notifyStatus(ctx);
        return;
      }

      if (action === "status") {
        notifyStatus(ctx);
        return;
      }

      ctx.ui.notify("Usage: /ctt [off|on|status]", "error");
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    restoreState(ctx);
    updateStatus(ctx);
  });

  pi.on("session_tree", async (_event, ctx) => {
    restoreState(ctx);
    updateStatus(ctx);
  });

  pi.on("context", async (event, _ctx) => {
    return {
      messages: event.messages.map((msg) => {
        // Only touch assistant messages — thinking blocks live there.
        if (msg.role !== "assistant") return msg;
        return removeThinkingBlocks(msg);
      }),
    };
  });

  pi.on("message_end", async (event, _ctx) => {
    if (saveThinking) return;
    if (event.message.role !== "assistant") return;

    return { message: removeThinkingBlocks(event.message) };
  });
}
