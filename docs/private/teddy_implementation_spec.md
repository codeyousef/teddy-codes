# Teddy.Codes: Implementation Specification

Project Identity: "Teddy.Codes" (formerly Catalyst)

Core Philosophy: Hard-to-fail, local-first reasoning engine with automated context intelligence.

## Phase 1: Brand & Core UI (The Interface)

### Feature 1.1: Extension Identity & Mode Configuration

**Goal:** Establish the new brand and configure the existing UI mode selector with Teddy's specific workflows.

**Implementation Logic:**

1. **Manifest Update:** Rename extension to `teddy.codes` in `package.json`. Update icon and description.
2. **Configure Existing Mode Selector:**
   - **Target Component:** Locate the existing `ModeSelector` component (likely in the Chat Panel or Status Bar).
   - **Inject Options:** Add the following modes to the existing dropdown list:
     - `Autonomous (Spec-Driven)`
     - `TDD (Test-First)`
     - _(Keep existing `Chat` or `Assistant` mode)_
   - **State Management:** Wire up the selection events to trigger the corresponding `system_prompt` and middleware pipeline (see Phase 3).
   - **Visual Cues (Apply to existing container):**
     - _Chat:_ Blue Border.
     - _Autonomous:_ Purple Border (Agentic).
     - _TDD:_ Green Border (Validation).

### Feature 1.2: Context Onboarding & Indexing (Clickable UI)

**Goal:** Proactively prompt the user to index their code for the Repo Map/Vector DB when opening an existing project.

**Implementation Logic:**

1. **Project Detection:** On workspace load, check:
   - Is there a `.git` folder?
   - Are there > 5 source files?
   - **Decision:** If yes AND `~/.teddy/indices/{hash}` is missing -> Trigger "Empty State" UI.

2. **Empty State / Welcome UI:**
   - **Design:** Render a clean HTML card in the Chat Window (Webview).
   - **Content:**
     - "🐻 **Teddy found an existing codebase.**"
     - "To enable deep reasoning and autonomous planning, I need to map your project."
     - **Action Element:** A prominent, clickable link/button: `[ 🚀 Index Codebase & Generate TEDDY.md ]`.

3. **Action Handler:**
   - **Step A (Indexing):** Trigger Feature 2.1 (Repo Map) and Feature 2.2 (Vectorization).
   - **Step B (Constitution):** Check for `TEDDY.md` (formerly `CATALYST.md`).
     - If missing: Analyze `package.json` / `Cargo.toml` -> Detect Stack -> Generate `TEDDY.md` template with best practices (Architecture, Styling, Testing).
     - Write file to project root.
   - **Completion:** Replace card with: "✅ **Project Mapped. Ready for Autonomous Mode.**"

## Phase 2: The "Brain" (Context Intelligence)

### Feature 2.1: Compressed Repo Map (The "Far-Sight" Engine)

**Goal:** Allow the local 8k-context model to "see" the entire project structure during planning.

**Implementation Logic:**

1. **Tree Generator:** Walk file tree (ignore `.gitignore`).
2. **Signature Extraction (Tree-sitter):**
   - Parse every source file.
   - Extract: Class names, Public Function signatures, Docstrings (first line only).
   - **Format:** `src/auth.ts: class Auth { login(user, pass), logout() }`

3. **Compression & Ranking:**
   - If total token count > 2000:
   - Run **PageRank** based on import graph (files imported often = higher rank).
   - Keep top 2000 tokens of high-rank files.

4. **Injection:** Inject this map into **Layer 3** of the Context Budget when in "Autonomous" or "Chat" mode.

### Feature 2.2: Auto-RAG (Middleware)

**Goal:** Automatically fetch relevant code/docs without user intervention.

**Implementation Logic:**

1. **Interception:** Before sending ANY user prompt to the LLM.
2. **Query Analysis:**
   - Extract keywords (e.g., "React", "Auth", "Table component").
   - Check **Qdrant** (Vector DB) for:
     - `type: codebase` (User's code chunks).
     - `type: dependency` (Library docs from `llm.txt`).

3. **Relevance Threshold:**
   - Only inject chunks with Cosine Similarity > 0.82.
   - **Limit:** Max 3 chunks (approx 1000 tokens) to save budget.

4. **Silent Injection:** Append these chunks to the prompt as `<context>` blocks hidden from the user.

### Feature 2.3: Real-Time LSP Bridge (Diagnostics)

**Goal:** Enable the Agent to see compile errors and lint warnings instantly via the VS Code LSP, avoiding the need for slow compilation/run cycles.

**Implementation Logic:**

1. **Diagnostic Observer:**
   - Hook into `vscode.languages.getDiagnostics(uri)`.
   - Monitor the `activeTextEditor` and any files modified by the Agent in the current session.

2. **Context Injection Strategy:**
   - **Pre-Commit Check:** Before the Agent marks a task as "Done" or runs a test, it must query the Diagnostic collection for the specific file range it modified.
   - **Auto-Fix Trigger:** If `Severity.Error` or `Severity.Warning` is detected:
     - **Pause Execution:** Do not proceed to the next task.
     - **Feedback Loop:** Feed the error context back to the LLM: _"LSP reports an error on line 15: 'Property does not exist on type...'. Fix this before proceeding."_

3. **UI Feedback:**
   - Show "🚨 LSP Error Detected" -> "🛠️ Auto-Fixing..." in the status indicator to let the user know Teddy caught a bug.

## Phase 3: The Modes (Workflow Engines)

### Feature 3.1: Autonomous Mode (Implicit Spec-Driven)

**Goal:** Automate the "Waterfall" workflow without explicit slash commands.

**Implementation Logic:**

1. **Trigger:** User selects "Autonomous" dropdown -> types a high-level request (e.g., "Build a login page").
2. **Step 1: Specification (Internal):**
   - **Agent Action:** "I need to write a spec for this first."
   - **LLM Task:** Generate `spec.md` (Requirements).
   - **UI:** Show "📝 Writing Spec..." -> Display diff -> User Approves.

3. **Step 2: Planning (Internal):**
   - **Context:** `spec.md` + `Repo Map` (Feature 2.1).
   - **LLM Task:** Generate `plan.md` (Files to create/edit).
   - **UI:** Show "🧠 Planning Architecture..." -> Display plan -> User Approves.

4. **Step 3: Execution (Internal Loop):**
   - **Loop:** Parse `plan.md` tasks -> For each task:
     - Fetch relevant files.
     - Generate Code.
     - **LSP Check (Feature 2.3):** Check for errors. If Red, fix immediately.
     - Verify (Compile/Lint check as fallback).
     - Mark task complete.

### Feature 3.2: TDD Mode (Test-First Enforcer)

**Goal:** Force the model to validate logic before implementation.

**Implementation Logic:**

1. **Trigger:** User selects "TDD" dropdown -> types request.
2. **Constraint:** System Prompt appended: "You are in TDD Mode. YOU MUST WRITE A FAILING TEST FIRST. DO NOT IMPLEMENT LOGIC YET."
3. **Step 1: Test Gen:**
   - LLM generates `*.test.ts`.
   - **LSP Check (Feature 2.3):** Ensure test file has no syntax errors.
   - System runs test -> Confirms Failure (Red 🔴).

4. **Step 2: Implementation:**
   - System Prompt updates: "Test failed as expected. Now write the MINIMAL code to pass the test."
   - LLM generates implementation.
   - **LSP Check (Feature 2.3):** Ensure implementation has no syntax/type errors.
   - System runs test -> Confirms Success (Green 🟢).

5. **Step 3: Refactor:**
   - Optional prompt: "Refactor the code while keeping tests green."

## Phase 4: Hardware Safety (The Guardrails)

### Feature 4.1: The 4090 Safety Profile

**Goal:** Ensure the extension never crashes the local machine.

**Implementation Logic:**

1. **VRAM Monitor:** Check available VRAM on startup.
2. **Strict Context Cap:**
   - If model == `deepseek-r1:32b` (Local): Hard cap context to **8,192 tokens**.
   - **Budgeting:**
     - Active File: 40% (3.2k)
     - Repo Map: 25% (2k)
     - Auto-RAG: 15% (1.2k)
     - Chat History: 15% (1.2k) - _Aggressive Truncation_.
   - **Warning:** If context exceeds limit, UI shows "⚠️ Memory Full - Pruning History" toast.
