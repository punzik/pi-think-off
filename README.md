# pi-think-off

A [Pi](https://pi.dev) package that removes model thinking blocks (extended thinking / reasoning) from the context sent to the LLM.

The extension strips thinking blocks from outgoing model requests. By default it keeps thinking blocks in the session for human review, but this can be toggled with `/think-off`.

## Why

When extended thinking is enabled, assistant messages can contain `ThinkingContent` blocks. Across multiple turns these blocks can become large and waste context tokens.

`pi-think-off` removes `type: "thinking"` blocks from assistant messages in the LLM context. Optionally, it can also remove them before assistant messages are saved to disk.

## Behavior

- Thinking is **removed from the LLM context**.
- Thinking is **kept in the session by default**.
- Use `/think-off` to toggle whether new thinking blocks are saved.
- When saving is enabled, thinking remains visible in `/tree` and in session data.
- No commands or configuration are required after installation.

## Installation

### From npm

```bash
pi install npm:pi-think-off
```

### From git

```bash
pi install git:github.com/punzik/pi-think-off
```

### From a local checkout

```bash
pi install /path/to/pi-think-off
```

Use `-l` to install into the current project's `.pi/settings.json` instead of global settings:

```bash
pi install -l /path/to/pi-think-off
```

### Try without installing

```bash
pi -e /path/to/pi-think-off
```

If Pi is already running, reload packages and extensions with:

```text
/reload
```

## Usage

Use Pi with extended thinking as usual, for example:

```bash
pi --thinking high
```

The extension automatically filters thinking blocks before each LLM request.

Use `/think-off` to toggle saving thinking blocks to the session:

```text
/think-off          # toggle saving on/off
/think-off off      # do not save thinking blocks from new assistant messages
/think-off on       # keep thinking blocks in the session
/think-off status   # show current mode
```

The setting is stored in the current session branch. It affects new assistant messages only; existing JSONL entries are not rewritten. When saving is off, the footer shows a `[TOFF]` status badge.

## How it works

The package declares its extension in `package.json` under the `pi.extensions` manifest key. Pi loads `extensions/think-off.ts` and the extension listens for the `context` event, which fires before each request to the LLM.

For every assistant message in the outgoing context, the extension removes content blocks with `type: "thinking"`. The `/think-off` command stores a per-session-branch setting, and when saving is off the extension also removes thinking blocks from finalized assistant messages before they are written to the session.

## Package layout

```text
.
├── extensions/
│   └── think-off.ts
├── LICENSE
├── package.json
└── README.md
```

## License

GPL-3.0-only. See [LICENSE](LICENSE).
