/**
 * pi-cut-the-think — strip model thinking from context so it doesn't accumulate.
 *
 * Thinking blocks (extended reasoning) are always removed from messages sent
 * to the LLM. By default they are still saved in the session for human
 * review, but saving can be toggled with /ctt.
 */
import { env } from "node:process";

import type { AssistantMessage } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

interface CutTheThinkState {
  saveThinking: boolean;
}

const STATE_TYPE = "cut-the-think-state";
const ENABLE_CTT_ENV = "PI_CUT_THE_THINK";
const TRUE_ENV_VALUES = new Set(["1", "true", "yes", "on"]);
const COMMAND_USAGE = "Usage: /ctt [on|off|status]";
const COMMAND_ARGUMENTS = ["on", "off", "status"];

function isCttEnabledFromEnv(): boolean {
  const value = env[ENABLE_CTT_ENV]?.trim().toLowerCase();
  return value !== undefined && TRUE_ENV_VALUES.has(value);
}

function readSaveThinkingState(data: unknown): boolean | undefined {
  if (typeof data !== "object" || data === null) return undefined;
  if (!("saveThinking" in data)) return undefined;

  const { saveThinking } = data;
  return typeof saveThinking === "boolean" ? saveThinking : undefined;
}

function removeThinkingBlocks(msg: AssistantMessage): AssistantMessage {
  const filtered = msg.content.filter((block) => block.type !== "thinking");

  if (filtered.length === msg.content.length) return msg;

  return { ...msg, content: filtered };
}

export default function (pi: ExtensionAPI) {
  let saveThinking = true;
  let applyEnvCttOnStartup = isCttEnabledFromEnv();

  function persistState() {
    pi.appendEntry<CutTheThinkState>(STATE_TYPE, { saveThinking });
  }

  function restoreState(ctx: ExtensionContext) {
    saveThinking = true;

    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type !== "custom" || entry.customType !== STATE_TYPE) continue;

      const restoredSaveThinking = readSaveThinkingState(entry.data);
      if (restoredSaveThinking !== undefined) {
        saveThinking = restoredSaveThinking;
      }
    }

    if (applyEnvCttOnStartup) {
      saveThinking = false;
      persistState();
      applyEnvCttOnStartup = false;
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
    description: `Toggle CTT mode, which prevents saving thinking blocks. ${COMMAND_USAGE}`,
    getArgumentCompletions: (prefix: string) => {
      const items = COMMAND_ARGUMENTS
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

      ctx.ui.notify(COMMAND_USAGE, "error");
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
