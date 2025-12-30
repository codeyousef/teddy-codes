# Project Catalyst: Implementation Specification (Extension Edition)

This document outlines the sequential feature list for forking and enhancing the "Continue" VS Code extension into **Catalyst**. It is designed to be read by AI coding assistants to implement features without "guessing" the architectural intent.

## Phase 1: Core Architecture & Safety (The Foundation)

### Feature 1.1: Dynamic Model Configuration & Safety Patch

**Goal:** Prevent the "200k Token Crash" by intercepting model definitions and enforcing a strict safety buffer, regardless of what the user configures or what the API reports.

**Implementation Logic:**

1. **Intercept Model Loading:** Locate the core model configuration loader (typically in `core/llm/` or `core/config/`).
2. **Fetch & Override:** Instead of reading static YAML defaults, implement a `fetchProviderModels()` routine that queries the Anthropic/Provider API for available models.
3. **Apply Heuristic Patches:** Iterate through the fetched models and apply the following logic:

   - **Identification:** If `model.id` matches regex `^claude-3-(5|7)-(sonnet|opus)`, apply overrides.
   - **Context Safety:** Force `contextLength` to **190,000** (leaving a 10k buffer for output).
   - **Output Reservation:** Force `maxTokens` (completion limit) to **8,192**.
   - **Capability Injection:** Auto-inject `["tool_use", "caching"]` into the capabilities array.

4. **Fallback:** If the API fetch fails, fallback to a hardcoded internal list containing the verified 2025 IDs (`claude-sonnet-4-5-20250929`).

### Feature 1.2: Context Budget Manager (The Brain)

**Goal:** Replace the default sliding window with a tiered priority system that ensures critical context (Active File, Constitution) is never evicted.

**Implementation Logic:**

1. **Define Priority Layers:** Modify the `ContextManager` to classify context items into four immutable layers:

   - **Layer 1 (Critical):** Active Text Editor content + Current Selection. (Priority: Highest, never truncate).
   - **Layer 2 (Constitution):** System Prompts + `CATALYST.md` content. (Priority: High, never truncate).
   - **Layer 3 (Intelligence):** RAG results, `@Codebase` snippets, and Dependency Docs. (Priority: Medium, truncate first if budget exceeded).
   - **Layer 4 (Conversation):** Chat history and previous turns. (Priority: Low, truncate second).

2. **Budget Enforcement Routine:** Before every API call:

   - Calculate `TotalTokens = L1 + L2 + L3 + L4`.
   - If `TotalTokens > 190,000`:
     - Step A: Drop items from **Layer 3** (starting with lowest relevance score) until fit.
     - Step B: If still over, drop oldest messages from **Layer 4**.
     - Step C: **NEVER** touch Layer 1 or 2. Raise error if L1+L2 > Limit.

### Feature 1.3: Native VS Code Settings Integration

**Goal:** Eliminate reliance on "finnicky" `config.yaml` by exposing all critical Catalyst settings directly in the VS Code Settings UI.

**Implementation Logic:**

1. **Schema Definition:** Update `package.json` to define the `configuration` contribution point:

   - `catalyst.budget.dailyLimit`: Number (Default: 1.00).
   - `catalyst.models.preferredModel`: Enum ["Claude 3.5 Sonnet", "Claude 3.7 Opus", "Auto-Route"].
   - `catalyst.context.enableDependencyDocs`: Boolean (Default: true).
   - `catalyst.agent.mode`: Enum ["Assistant", "Autonomous"].

2. **Secret Management:** Implement a `SecretManager` class using `vscode.SecretStorage` to securely store API keys, removing them from plain text config files.

   - Command: `Catalyst: Set Anthropic API Key`.

3. **Config Unification Strategy:**

   - Create a `ConfigService` that runs on startup.
   - **Priority Logic:** Read from VS Code Settings API (`workspace.getConfiguration('catalyst')`) first. If values are missing, check `config.yaml` (legacy support), then fall back to hardcoded defaults.
   - **Reactive Updates:** Listen to `workspace.onDidChangeConfiguration` to instantly update the `ContextManager` (Feature 1.2) limits without requiring a window reload.

## Phase 2: Context Intelligence (The Data)

### Feature 2.1: Project Constitution (`CATALYST.md`)

**Goal:** Enforce architectural rules by injecting a persistent "Constitution" file into the system prompt.

**Implementation Logic:**

1. **File Watcher:** Initialize a workspace file watcher specifically for `CATALYST.md` in the project root.
2. **Context Provider:** Create a custom `CatalystContextProvider`.
3. **Injection Logic:**

   - On extension load, read `CATALYST.md`.
   - Format the content as a System Message: "You are Catalyst. You must follow these architectural rules: \n
     $$Content$$
     ".
   - Register this message into **Layer 2** of the Context Budget Manager.
   - Mark as `immutable` to prevent eviction.

### Feature 2.2: Dependency Intelligence Engine

**Goal:** Automatically provide context about the libraries used in the project by fetching "AI-native" documentation.

**Implementation Logic:**

1. **Manifest Parser:** Create a scanner that reads `package.json`, `Cargo.toml`, or `requirements.txt` on startup.
2. **Version Extraction:** Extract the list of top 10 dependencies and their exact versions (e.g., `react@18.3.0`).
3. **Doc Fetcher Strategy:**

   - Construct standard URL patterns: `https://[package_homepage]/llms.txt`, `https://[package_homepage]/llm.txt`.
   - Attempt HTTP GET.
   - **Fallback:** If `llm.txt` is missing, trigger a "Light Scraper" that targets the repository's `README.md` and `docs/` folder.

4. **Vectorization Pipeline:**

   - Pass the fetched text to the local embedding model.
   - Store embeddings in the local **Qdrant** instance (see Feature 2.3) tagged with `type: dependency`.

### Feature 2.3: Local Vector Memory (Qdrant Integration)

**Goal:** Embed a high-performance vector database directly into the extension for low-latency RAG.

**Implementation Logic:**

1. **Binary Management:** Bundle or download the **Qdrant** binary (or use the Rust/WASM client if available) during extension install.
2. **Initialization:** Start Qdrant on a local port (e.g., 6334) restricted to localhost.
3. **Collections:** Initialize two collections:

   - `codebase`: For the user's source code (chunked by function/class).
   - `dependencies`: For the fetched library documentation.

4. **Retrieval Logic:** When the user types `@Codebase` or asks a question:

   - Generate embedding for the query.
   - Perform hybrid search (keyword + vector) across both collections.
   - Inject results into **Layer 3** of the Context Budget.

## Phase 3: Agentic Workflows (The Process)

### Feature 3.1: Spec-Driven Slash Commands

**Goal:** Enforce a structured "Waterfall" workflow via slash commands to prevent "Vibe Coding."

**Implementation Logic:**

1. **`/specify` Command:**

   - Input: User's high-level intent.
   - Action: Prompt LLM to generate a technology-agnostic `spec.md` file.
   - Output: Create/Open `spec.md` in the editor.

2. **`/plan` Command:**

   - Input: Context includes `spec.md`.
   - Action: Prompt LLM to generate `plan.md` (Architecture, Stack, Files to create).
   - Constraint: Must adhere to `CATALYST.md` rules.

3. **`/tasks` Command:**

   - Input: Context includes `plan.md`.
   - Action: Generate `tasks.md` (Checkbox list of atomic steps).

4. **`/implement` Command:**

   - Input: Cursor position in `tasks.md`.
   - Action: Read the next unchecked item, fetch relevant files, and attempt implementation.

### Feature 3.2: TDD Mode (Test-Driven Development)

**Goal:** Force the model to write tests _before_ implementation code.

**Implementation Logic:**

1. **Trigger:** Command `/tdd [feature description]`.
2. **Step 1 (Test Gen):** Prompt model to generate _only_ the test file (e.g., `feature.test.ts`).
3. **Step 2 (Pause):** Pause execution and wait for User Verification (User must click "Approve").
4. **Step 3 (Implement):**

   - Inject the generated test code into context.
   - Prompt: "Write the implementation to make these tests pass. Do not modify the tests."

5. **Step 4 (Verify):** Auto-run the test command (if configured) and report results.

## Phase 4: Cost & Intelligence (The Control)

### Feature 4.1: Cost Tracking & Routing Middleware

**Goal:** Monitor spending and route simple tasks to cheaper models to save budget.

**Implementation Logic:**

1. **Token Accountant:**

   - Intercept every HTTP response from the LLM provider.
   - Extract `usage.input_tokens` and `usage.output_tokens`.
   - Calculate cost based on active model rates (Hardcode rates for Sonnet/Opus).
   - Update a local persistence store `daily_spend.json`.

2. **Routing Middleware:**

   - Intercept outgoing requests.
   - **Heuristic 1 (Complexity):** If prompt length < 500 chars AND does not contain keywords
     $$"Refactor", "Plan", "Architecture"$$
     , switch model to `claude-3-5-sonnet` (or Haiku).
   - **Heuristic 2 (Budget):** If `daily_spend` > `catalyst.budget.dailyLimit` (from Settings), force downgrade to Haiku or Free Tier model.
   - **UI Indicator:** Update a status bar item showing "Today: $0.45".
