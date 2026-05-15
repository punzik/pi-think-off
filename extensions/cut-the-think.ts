/**
 * pi-cut-the-think — control removal of model thinking blocks.
 *
 * Thinking blocks (extended reasoning) can be removed from messages sent to
 * the LLM and, in full mode, from new assistant messages saved to the
 * session.
 */
import { env } from "node:process";

import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

type CutTheThinkMode = "off" | "context" | "full";
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
const COMMAND_USAGE = "Usage: /ctt [off|on|context|full|status]";
const COMMAND_ARGUMENTS = ["off", "on", "context", "full", "status"];

function isCutTheThinkMode(value: unknown): value is CutTheThinkMode {
  return value === "off" || value === "context" || value === "full";
}

function isActiveCutTheThinkMode(value: unknown): value is ActiveCutTheThinkMode {
  return value === "context" || value === "full";
}

function readModeFromEnv(): CutTheThinkMode | undefined {
  const value = env[ENABLE_CTT_ENV]?.trim().toLowerCase();
  if (value === undefined) return undefined;
  if (CONTEXT_ENV_VALUES.has(value)) return "context";
  if (value === "full") return "full";
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

  // Backward compatibility with sessions that used the old boolean state.
  if (state.mode === undefined && "saveThinking" in data) {
    const { saveThinking } = data;
    if (typeof saveThinking === "boolean") {
      state.mode = saveThinking ? "context" : "full";
      state.previousMode = state.mode;
    }
  }

  return state;
}

function removeThinkingBlocks(msg: AssistantMessage): AssistantMessage {
  const filtered = msg.content.filter((block) => block.type !== "thinking");

  if (filtered.length === msg.content.length) return msg;

  return { ...msg, content: filtered };
}

export default function (pi: ExtensionAPI) {
  let mode: CutTheThinkMode = DEFAULT_MODE;
  let previousMode: ActiveCutTheThinkMode = DEFAULT_PREVIOUS_MODE;
  let startupEnvMode = readModeFromEnv();

  function setMode(nextMode: CutTheThinkMode) {
    if (mode !== "off") {
      previousMode = mode;
    }

    mode = nextMode;

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
      setMode(startupEnvMode);
      persistState();
      startupEnvMode = undefined;
    }
  }

  function updateStatus(ctx: ExtensionContext) {
    ctx.ui.setStatus(
      "cut-the-think",
      mode === "off"
        ? undefined
        : ctx.ui.theme.fg("warning", mode === "full" ? "[CTT:F]" : "[CTT]"),
    );
  }

  function notifyStatus(ctx: ExtensionContext) {
    updateStatus(ctx);

    const message =
      mode === "off"
        ? "cut-the-think: disabled"
        : mode === "context"
          ? "cut-the-think: thinking blocks are removed from LLM context only"
          : "cut-the-think: thinking blocks are removed from LLM context and new session messages";

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

      if (action === "on" || action === "context") {
        setMode("context");
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
    if (mode === "off") return;

    return {
      messages: event.messages.map((msg) => {
        // Only touch assistant messages — thinking blocks live there.
        if (msg.role !== "assistant") return msg;
        return removeThinkingBlocks(msg);
      }),
    };
  });

  pi.on("message_end", async (event, _ctx) => {
    if (mode !== "full") return;
    if (event.message.role !== "assistant") return;

    return { message: removeThinkingBlocks(event.message) };
  });
}
