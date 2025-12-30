# Copilot Instructions for Continue

## Architecture Overview

Continue is a multi-platform AI coding assistant with these core components:

- **core/** - Shared TypeScript logic (LLM providers, indexing, config, tools). The heart of Continue.
- **gui/** - React/Vite frontend (used by VS Code webview and CLI TUI)
- **extensions/vscode/** - VS Code extension (embeds core via `InProcessMessenger`)
- **extensions/intellij/** - JetBrains extension (communicates with binary over stdin/stdout)
- **extensions/cli/** - Command-line interface with TUI (Ink/React) and headless modes
- **binary/** - Standalone binary packaging core for JetBrains (bundled with esbuild, packaged with pkg)
- **packages/** - Shared npm packages (config-yaml, llm-info, openai-adapters, etc.)

### Message Protocol System

Communication between components uses typed protocols in `core/protocol/`:

- Messages flow: IDE ↔ Core ↔ Webview
- `passThrough.ts` defines which messages pass between webview and core
- **When adding protocol messages**: Update `core/protocol/passThrough.ts` AND `extensions/intellij/.../MessageTypes.kt`

## Development Commands

```bash
# Install all dependencies (run from root)
./scripts/install-dependencies.sh

# VS Code extension development
# Use VS Code task: "Launch extension" (F5) - starts debug host window

# Type checking (watches all packages)
npm run tsc:watch

# Format code (Prettier)
npm run format

# CLI development
cd extensions/cli && npm run build && node dist/index.js
```

## Key Conventions

### Import Paths

- Use explicit `.js` extensions for relative imports: `from "./module.js"` not `from "./module"`
- Core package imports: `from "core/..."` or `from "@continuedev/..."`

### Adding LLM Providers

1. Create class in `core/llm/llms/` extending `BaseLLM`
2. Add to `LLMs` array in `core/llm/llms/index.ts`
3. Update `core/llm/autodetect.ts` for image support and template detection
4. Add docs in `docs/customize/model-providers/`

### GUI Links to hub.continue.dev

Use `ideMessenger.request("controlPlane/openUrl", { path, orgSlug: undefined })` instead of direct `href` links.

### Theme Colors

Use Tailwind classes from `gui/src/styles/theme.ts` - maps VS Code theme variables to Tailwind. Avoid explicit color classes like `text-yellow-400`.

## Testing

```bash
# Core tests (Vitest)
cd core && npm test

# GUI tests (Vitest)
cd gui && npm test

# CLI tests (Vitest)
cd extensions/cli && npm test

# VS Code E2E tests
cd extensions/vscode && npm run e2e
```

Test file naming: `*.test.ts` for Jest, `*.vitest.ts` for Vitest in core.

## Project-Specific Rules

See component-specific rules:

- `core/rules.md` - Protocol message requirements
- `gui/rules.md` - Hub URL handling
- `extensions/cli/AGENTS.md` - CLI development guide

## File Structure Patterns

```
core/
├── llm/llms/          # LLM provider implementations
├── protocol/          # Message type definitions
├── config/            # Configuration handling
├── indexing/          # Codebase indexing
├── tools/             # Built-in agent tools
└── context/           # Context providers (MCP, docs)

gui/src/
├── redux/             # State management
├── components/        # React components
├── pages/             # Route pages
└── hooks/             # Custom hooks

extensions/vscode/src/
├── extension/         # Extension entry, messenger
├── diff/              # Diff view management
└── autocomplete/      # Inline completions
```
