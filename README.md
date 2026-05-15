# pi-cut-the-think

A [Pi](https://pi.dev) package that removes model thinking blocks from the context sent to the LLM.

## Why

When extended thinking is enabled, assistant messages can contain `ThinkingContent` blocks. Across multiple turns these blocks can become large and waste context tokens.

`pi-cut-the-think` removes `type: "thinking"` blocks from assistant messages in the LLM context. It can also remove them before new assistant messages are saved to disk.

## Behavior

- Thinking is always removed from the LLM context.
- Thinking is kept in the session by default.
- `/ctt` controls whether new thinking blocks are saved.
- `PI_CUT_THE_THINK=1` starts Pi with CTT mode enabled.
- When CTT mode is enabled, the footer shows `[CTT]`.
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

The extension filters thinking blocks before each LLM request.

Use `/ctt` to control whether thinking blocks are saved to the session:

```text
/ctt          # toggle CTT mode
/ctt on       # do not save thinking blocks from new assistant messages
/ctt off      # keep thinking blocks in the session
/ctt status   # show current mode
```

The setting is stored in the current session branch. It affects new assistant messages only.

To start Pi with CTT mode enabled, set `PI_CUT_THE_THINK` to `1`, `true`, `yes`, or `on`:

```bash
PI_CUT_THE_THINK=1 pi --thinking high
```

## How it works

Pi loads `extensions/cut-the-think.ts` from the package manifest in `package.json`.

The extension listens for the `context` event and removes `type: "thinking"` blocks from assistant messages before each request to the LLM. When CTT mode is enabled, it also listens for `message_end` and removes thinking blocks from finalized assistant messages before they are saved.

## Limitations

- `/ctt` affects only new assistant messages.
- Existing JSONL session entries are not modified.
- If thinking is not saved, it is lost after the current streaming view is gone.

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
