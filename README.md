# pi-think-off

A [Pi](https://pi.dev) package that removes model thinking blocks (extended thinking / reasoning) from the context sent to the LLM.

The extension keeps thinking blocks in the session file for human review, but strips them from outgoing model requests. This reduces token usage and prevents old reasoning from accumulating in the context.

## Why

When extended thinking is enabled, assistant messages can contain `ThinkingContent` blocks. Across multiple turns these blocks can become large and waste context tokens.

`pi-think-off` removes `type: "thinking"` blocks from assistant messages in the LLM context while preserving the original session history on disk.

## Behavior

- Thinking is **removed from the LLM context**.
- Thinking is **kept in the session file**.
- Thinking remains visible in `/tree` and in the JSONL session data.
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

## How it works

The package declares its extension in `package.json` under the `pi.extensions` manifest key. Pi loads `extensions/think-off.ts` and the extension listens for the `context` event, which fires before each request to the LLM.

For every assistant message in the outgoing context, the extension removes content blocks with `type: "thinking"`. Saved session messages are not modified.

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
