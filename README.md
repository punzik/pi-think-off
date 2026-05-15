# pi-cut-the-think

A [Pi](https://pi.dev) package that controls removal of model thinking blocks.

## Why

When extended thinking is enabled, assistant messages can contain `ThinkingContent` blocks. Across multiple turns these blocks can become large and waste context tokens.

`pi-cut-the-think` can remove `type: "thinking"` blocks from assistant messages in the LLM context. It can also remove them before new assistant messages are saved to disk.

## Behavior

- `off`: thinking blocks are not removed.
- `context`: thinking blocks are removed only from the LLM context.
- `full`: thinking blocks are removed from the LLM context and from new assistant messages before they are saved.
- The default mode is `off`.
- `/ctt` without arguments toggles between `off` and the previous active mode.
- The first `/ctt` toggle enables `context` mode.
- `PI_CUT_THE_THINK=1` starts Pi in `context` mode.
- When CTT mode is enabled, the footer shows `[CTT]` or `[CTT:F]`.
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
/ctt context  # remove thinking blocks from LLM context only
/ctt full     # remove thinking blocks from context and new session messages
/ctt status   # show current mode
```

The setting is stored in the current session branch. `full` mode affects new assistant messages only.

To start Pi in `context` mode, set `PI_CUT_THE_THINK` to `1`, `true`, `yes`, `on`, or `context`:

```bash
PI_CUT_THE_THINK=context pi --thinking high
```

To start Pi in `full` mode, set `PI_CUT_THE_THINK` to `full`:

```bash
PI_CUT_THE_THINK=full pi --thinking high
```

## How it works

Pi loads `extensions/cut-the-think.ts` from the package manifest in `package.json`.

The extension listens for the `context` event and, in `context` or `full` mode, removes `type: "thinking"` blocks from assistant messages before each request to the LLM. In `full` mode, it also listens for `message_end` and removes thinking blocks from finalized assistant messages before they are saved.

## Limitations

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
