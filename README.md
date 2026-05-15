# pi-cut-the-think

A [Pi](https://pi.dev) package that controls removal of model thinking blocks.

## Why

When extended thinking is enabled, assistant messages can contain `ThinkingContent` blocks. Across multiple turns these blocks can become large and waste context tokens.

This is especially useful for local models. Thinking blocks can pollute the conversation context, especially with models that reason verbosely and explore multiple alternatives in their reasoning traces, often starting with phrases like "Wait...".

Local models are often sensitive to context pressure: as the prompt grows and the context window fills up, their output quality can degrade noticeably. Removing thinking blocks before they accumulate keeps the effective context smaller and helps avoid feeding stale or contradictory reasoning back into later turns.

Unlike plugins that rewrite the beginning of the context, `pi-cut-the-think` only touches the latest context suffix: either the latest assistant message or, in `lazy` mode, the last completed tool-call chain. This keeps the stable prompt prefix intact and helps local inference reuse the KV cache. Re-processing long context is especially expensive for local models, and can be painful in heterogeneous GPU+CPU setups. Use `full` mode to prevent newly generated thinking blocks from accumulating in the saved session.

`pi-cut-the-think` can remove `type: "thinking"` blocks from recent assistant messages in the LLM context. It can also remove them before new assistant messages are saved to disk.

## Behavior

- `off`: thinking blocks are not removed.
- `context`: thinking blocks are removed only from the latest assistant message in the LLM context.
- `lazy`: thinking blocks are preserved during tool-call chains; after the next user prompt, they are removed only from the last completed chain between the previous and current user messages.
- `full`: thinking blocks are removed from the latest assistant message in the LLM context and from new assistant messages before they are saved.
- The default mode is `off`.
- `/ctt` without arguments toggles between `off` and the previous active mode.
- The first `/ctt` toggle enables `context` mode.
- `PI_CUT_THE_THINK=1` starts Pi in `context` mode.
- When CTT mode is enabled, the footer shows `[CTT]`, `[CTT:L]`, or `[CTT:F]`.
- Existing session entries are not rewritten.

## Installation

### From git

```bash
pi install git:github.com/punzik/pi-cut-the-think
```

### From a local checkout

```bash
pi install /path/to/pi-cut-the-think
```

### Project-local install

```bash
pi install -l /path/to/pi-cut-the-think
```

### Try without installing

```bash
pi -e /path/to/pi-cut-the-think
```

If Pi is already running, reload packages and extensions with:

```text
/reload
```

## Usage

Use Pi with extended thinking as usual:

```bash
pi --thinking high
```

Use `/ctt` to control thinking block removal:

```text
/ctt          # toggle between off and the previous active mode
/ctt off      # disable thinking block removal
/ctt context  # remove thinking blocks from the latest assistant message in LLM context only
/ctt lazy     # preserve thinking during tool-call chains; clean the last completed chain later
/ctt full     # remove thinking blocks from the latest context assistant message and new session messages
/ctt status   # show current mode
```

The setting is stored in the current session branch. `lazy` mode affects the outgoing LLM context only. `full` mode affects new assistant messages only.

To start Pi in `context` mode, set `PI_CUT_THE_THINK` to `1`, `true`, `yes`, `on`, or `context`:

```bash
PI_CUT_THE_THINK=context pi --thinking high
```

To start Pi in `lazy` or `full` mode, set `PI_CUT_THE_THINK` to `lazy` or `full`:

```bash
PI_CUT_THE_THINK=lazy pi --thinking high
```

For `full` mode:

```bash
PI_CUT_THE_THINK=full pi --thinking high
```

## How it works

Pi loads `extensions/cut-the-think.ts` from the package manifest in `package.json`.

The extension listens for the `context` event before each request to the LLM. In `context` or `full` mode, it removes `type: "thinking"` blocks only from the latest assistant message. In `lazy` mode, it does nothing while a tool-call chain is active; when a later user prompt starts a new request, it removes thinking only from assistant messages in the last completed chain between the previous and current user messages.

Earlier context messages are left unchanged to keep the prompt prefix stable for KV-cache reuse. In `full` mode, the extension also listens for `message_end` and removes thinking blocks from finalized assistant messages before they are saved.

## Limitations

- `context` and `full` modes modify only the latest assistant message in the outgoing LLM context.
- `lazy` mode modifies only the last completed chain before the current user prompt.
- `full` mode affects only new assistant messages.
- Existing JSONL session entries are not modified.
- If thinking is not saved in `full` mode, it is lost after the current streaming view is gone.

## Package layout

```text
.
├── extensions/
│   └── cut-the-think.ts
├── LICENSE
├── package.json
└── README.md
```

## License

GPL-3.0-only. See [LICENSE](LICENSE).
