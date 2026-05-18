/**
 * pi-cut-the-think — control removal of model thinking blocks.
 *
 * Thinking blocks (extended reasoning) can be removed from messages sent to
 * the LLM and, in full/lazyfull mode, from new assistant messages saved to the
 * session. Lazy modes preserve thinking during tool-call chains and remove
 * it from the last completed chain only after the next user prompt.
 */
import { env } from "node:process";

import type { AssistantMessage, TextContent } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

type CutTheThinkMode = "off" | "context" | "lazy" | "full" | "lazyfull";
type ActiveCutTheThinkMode = Exclude<CutTheThinkMode, "off">;

interface CutTheThinkState {
  mode: CutTheThinkMode;
  previousMode: ActiveCutTheThinkMode;
}

interface RestoredCutTheThinkState {
  mode?: CutTheThinkMode;
  previousMode?: ActiveCutTheThinkMode;
}

const STATE_TYPE = "cut-the-think-state";
const ENABLE_CTT_ENV = "PI_CUT_THE_THINK";
const DEFAULT_MODE: CutTheThinkMode = "off";
const DEFAULT_PREVIOUS_MODE: ActiveCutTheThinkMode = "context";
const CONTEXT_ENV_VALUES = new Set(["1", "true", "yes", "on", "context"]);
const COMMAND_USAGE = "Usage: /ctt [off|context|lazy|full|lazyfull|status]";
const COMMAND_ARGUMENTS = ["off", "context", "lazy", "full", "lazyfull", "status"];
const THINKING_REMOVED_PLACEHOLDER = "[thinking removed]";

function isCutTheThinkMode(value: unknown): value is CutTheThinkMode {
  return (
    value === "off" ||
    value === "context" ||
    value === "lazy" ||
    value === "full" ||
    value === "lazyfull"
  );
}

function isActiveCutTheThinkMode(value: unknown): value is ActiveCutTheThinkMode {
  return (
    value === "context" ||
    value === "lazy" ||
    value === "full" ||
    value === "lazyfull"
  );
}

function readModeFromEnv(): CutTheThinkMode | undefined {
  const value = env[ENABLE_CTT_ENV]?.trim().toLowerCase();
  if (value === undefined) return undefined;
  if (CONTEXT_ENV_VALUES.has(value)) return "context";
  if (value === "lazy") return "lazy";
  if (value === "full") return "full";
  if (value === "lazyfull") return "lazyfull";
  return undefined;
}

function readCutTheThinkState(data: unknown): RestoredCutTheThinkState {
  if (typeof data !== "object" || data === null) return {};

  const state: RestoredCutTheThinkState = {};

  if ("mode" in data) {
    const { mode } = data;
    if (isCutTheThinkMode(mode)) {
      state.mode = mode;
    }
  }

  if ("previousMode" in data) {
    const { previousMode } = data;
    if (isActiveCutTheThinkMode(previousMode)) {
      state.previousMode = previousMode;
    }
  }

  return state;
}

function createThinkingRemovedPlaceholder(): TextContent {
  return { type: "text", text: THINKING_REMOVED_PLACEHOLDER };
}

function removeThinkingBlocks(msg: AssistantMessage): AssistantMessage | undefined {
  const filtered = msg.content.filter((block) => block.type !== "thinking");

  if (filtered.length === msg.content.length) return msg;
  if (filtered.length === 0) return undefined;

  return { ...msg, content: filtered };
}

function removeThinkingBlocksOrPlaceholder(msg: AssistantMessage): AssistantMessage {
  const filtered = msg.content.filter((block) => block.type !== "thinking");

  if (filtered.length === msg.content.length) return msg;

  return {
    ...msg,
    content: filtered.length > 0 ? filtered : [createThinkingRemovedPlaceholder()],
  };
}

function hasThinkingBlocks(msg: AssistantMessage): boolean {
  return msg.content.some((block) => block.type === "thinking");
}

function getToolCallKey(msg: AssistantMessage): string | undefined {
  const toolCallIds: string[] = [];

  for (const block of msg.content) {
    if (block.type === "toolCall") {
      toolCallIds.push(block.id);
    }
  }

  return toolCallIds.length > 0 ? toolCallIds.join("\0") : undefined;
}

export default function (pi: ExtensionAPI) {
  let mode: CutTheThinkMode = DEFAULT_MODE;
  let previousMode: ActiveCutTheThinkMode = DEFAULT_PREVIOUS_MODE;
  let startupEnvMode = readModeFromEnv();
  // lazyfull removes thinking before saving messages, but active tool-call chains
  // may still need the original assistant thinking in subsequent LLM requests.
  const pendingLazyFullToolCallMessages = new Map<string, AssistantMessage>();

  function setMode(nextMode: CutTheThinkMode) {
    if (mode !== "off") {
      previousMode = mode;
    }

    mode = nextMode;

    if (mode !== "lazyfull") {
      pendingLazyFullToolCallMessages.clear();
    }

    if (mode !== "off") {
      previousMode = mode;
    }
  }

  function persistState() {
    pi.appendEntry<CutTheThinkState>(STATE_TYPE, { mode, previousMode });
  }

  function restoreState(ctx: ExtensionContext) {
    mode = DEFAULT_MODE;
    previousMode = DEFAULT_PREVIOUS_MODE;
    pendingLazyFullToolCallMessages.clear();

    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type !== "custom" || entry.customType !== STATE_TYPE) continue;

      const restoredState = readCutTheThinkState(entry.data);

      if (restoredState.mode !== undefined) {
        mode = restoredState.mode;
      }

      if (restoredState.previousMode !== undefined) {
        previousMode = restoredState.previousMode;
      } else if (isActiveCutTheThinkMode(restoredState.mode)) {
        previousMode = restoredState.mode;
      }
    }

    if (startupEnvMode !== undefined) {
      if (startupEnvMode !== mode) {
        setMode(startupEnvMode);
        persistState();
      }
      startupEnvMode = undefined;
    }
  }

  function updateStatus(ctx: ExtensionContext) {
    const status =
      mode === "off"
        ? undefined
        : mode === "lazy"
          ? "[CTT:L]"
          : mode === "full"
            ? "[CTT:F]"
            : mode === "lazyfull"
              ? "[CTT:LF]"
              : "[CTT]";

    ctx.ui.setStatus(
      "cut-the-think",
      status === undefined ? undefined : ctx.ui.theme.fg("warning", status),
    );
  }

  function notifyStatus(ctx: ExtensionContext) {
    updateStatus(ctx);

    const message =
      mode === "off"
        ? "cut-the-think: disabled"
        : mode === "context"
          ? "cut-the-think: thinking blocks are removed from the latest assistant message in LLM context"
          : mode === "lazy"
            ? "cut-the-think: thinking blocks are preserved during tool-call chains and removed from the last completed chain"
            : mode === "full"
              ? "cut-the-think: thinking blocks are removed from LLM context and new session messages"
              : "cut-the-think: thinking blocks are preserved in active tool-call context and removed from new session messages";

    ctx.ui.notify(message, "info");
  }

  pi.registerCommand("ctt", {
    description: `Toggle CTT mode. ${COMMAND_USAGE}`,
    getArgumentCompletions: (prefix: string) => {
      const items = COMMAND_ARGUMENTS
        .filter((value) => value.startsWith(prefix.trim()))
        .map((value) => ({ value, label: value }));
      return items.length > 0 ? items : null;
    },
    handler: async (args, ctx) => {
      const action = args.trim().toLowerCase();

      if (!action) {
        setMode(mode === "off" ? previousMode : "off");
        persistState();
        notifyStatus(ctx);
        return;
      }

      if (action === "off") {
        setMode("off");
        persistState();
        notifyStatus(ctx);
        return;
      }

      if (action === "context") {
        setMode("context");
        persistState();
        notifyStatus(ctx);
        return;
      }

      if (action === "lazy") {
        setMode("lazy");
        persistState();
        notifyStatus(ctx);
        return;
      }

      if (action === "full") {
        setMode("full");
        persistState();
        notifyStatus(ctx);
        return;
      }

      if (action === "lazyfull") {
        setMode("lazyfull");
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

  pi.on("agent_end", async () => {
    pendingLazyFullToolCallMessages.clear();
  });

  pi.on("context", async (event, _ctx) => {
    if (mode === "off") return;

    if (mode === "lazy" || mode === "lazyfull") {
      let currentUserIndex = -1;

      for (let index = event.messages.length - 1; index >= 0; index -= 1) {
        if (event.messages[index]?.role === "user") {
          currentUserIndex = index;
          break;
        }
      }

      if (currentUserIndex === -1) return;

      type ContextMessage = (typeof event.messages)[number];
      const messages: Array<ContextMessage | undefined> = event.messages.slice();
      let changed = false;

      const hasActiveChainAfterCurrentUser = event.messages
        .slice(currentUserIndex + 1)
        .some((msg) => msg.role === "assistant" || msg.role === "toolResult");
      if (hasActiveChainAfterCurrentUser) {
        if (mode !== "lazyfull" || pendingLazyFullToolCallMessages.size === 0) return;

        for (let index = currentUserIndex + 1; index < event.messages.length; index += 1) {
          const msg = event.messages[index];

          if (msg?.role !== "assistant") continue;

          const toolCallKey = getToolCallKey(msg);
          if (toolCallKey === undefined) continue;

          const pendingMessage = pendingLazyFullToolCallMessages.get(toolCallKey);
          if (pendingMessage === undefined) continue;

          messages[index] = pendingMessage;
          changed = true;
        }

        return changed
          ? { messages: messages.filter((msg): msg is ContextMessage => msg !== undefined) }
          : undefined;
      }

      pendingLazyFullToolCallMessages.clear();

      let previousUserIndex = -1;
      for (let index = currentUserIndex - 1; index >= 0; index -= 1) {
        if (event.messages[index]?.role === "user") {
          previousUserIndex = index;
          break;
        }
      }

      if (previousUserIndex === -1) return;

      for (let index = previousUserIndex + 1; index < currentUserIndex; index += 1) {
        const msg = event.messages[index];

        // Only touch assistant messages — thinking blocks live there.
        if (msg?.role !== "assistant") continue;

        const filteredMessage = removeThinkingBlocks(msg);
        if (filteredMessage === msg) continue;

        messages[index] = filteredMessage;
        changed = true;
      }

      return changed
        ? { messages: messages.filter((msg): msg is ContextMessage => msg !== undefined) }
        : undefined;
    }

    let lastAssistantIndex = -1;
    let lastAssistantMessage: AssistantMessage | undefined;

    for (let index = event.messages.length - 1; index >= 0; index -= 1) {
      const msg = event.messages[index];

      // Only touch assistant messages — thinking blocks live there.
      if (msg?.role !== "assistant") continue;

      lastAssistantIndex = index;
      lastAssistantMessage = msg;
      break;
    }

    if (lastAssistantMessage === undefined) return;

    const filteredMessage = removeThinkingBlocks(lastAssistantMessage);
    if (filteredMessage === lastAssistantMessage) return;

    const messages = event.messages.slice();
    if (filteredMessage === undefined) {
      messages.splice(lastAssistantIndex, 1);
    } else {
      messages[lastAssistantIndex] = filteredMessage;
    }

    return { messages };
  });

  pi.on("message_end", async (event, _ctx) => {
    if (mode !== "full" && mode !== "lazyfull") return;
    if (event.message.role !== "assistant") return;

    if (mode === "lazyfull" && hasThinkingBlocks(event.message)) {
      const toolCallKey = getToolCallKey(event.message);
      if (toolCallKey !== undefined) {
        pendingLazyFullToolCallMessages.set(toolCallKey, event.message);
      }
    }

    return { message: removeThinkingBlocksOrPlaceholder(event.message) };
  });
}
