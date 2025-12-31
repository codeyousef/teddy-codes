# Teddy.Codes: Master Implementation Specification

Project Identity: "Teddy.Codes"

Core Philosophy: A hard-to-fail, local-first reasoning engine with automated context intelligence and implicit workflows.

## Phase 1: Brand, UI, and Onboarding

### Feature 1.0: Cloud Decoupling & Privacy (The "Great Debloat")

**Goal:** Remove all dependency on "Continue" cloud services (SaaS, Telemetry, Sync) to ensure a strictly local or user-controlled environment.

**Implementation Logic:**

1. **Telemetry Stripping:**

   - **Target:** Locate `core/util/posthog.ts` (or similar analytics modules).
   - **Action:** Completely remove all calls to PostHog or external logging services. Replace with no-op functions if necessary to prevent build errors.
   - **Manifest:** Remove `telemetry.enableTelemetry` settings as they are no longer relevant.

2. **SaaS Removal:**

   - **UI Cleanup:** Remove "Sign In", "Continue Hub", and "Sync Settings" buttons from the GUI.
   - **Code Cleanup:** Remove logic related to `control plane`, `GitHub Auth` for settings sync, and any "Free Trial" proxy routing that relies on the upstream provider's backend.

3. **Preserve Custom Cloud Providers:**

   - **Constraint:** Ensure the `LLM` class and `config_handler` still support standard API providers (`anthropic`, `openai`, `gemini`, `deepseek`) via **User-Supplied API Keys** only.
   - **Verification:** The extension must function 100% correctly with zero internet access (aside from the user's explicit calls to their chosen API provider).

### Feature 1.1: Identity Transformation & Mode Configuration

**Goal:** Establish the "Teddy.Codes" brand and configure the existing UI to support the new autonomous workflows.

**Implementation Logic:**

1. **Manifest Update:** Rename the extension identifier and display name to `teddy.codes` in `package.json`. Update the extension icon to the Teddy logo.
2. **Mode Selector Configuration:**

   - **Target:** Locate the existing `ModeSelector` component in the Chat Panel UI.
   - **Configuration:** Inject two new distinct options into the existing dropdown:
     - `Autonomous` (Description: "Spec-Driven Planning & Execution")
     - `TDD` (Description: "Test-Driven Development")
   - **State Binding:** Ensure selection updates the global `session.mode` state, which dictates the middleware pipeline used in Phase 3.
   - **Visual Feedback:** Update the active chat border color based on mode: Blue (Chat), Purple (Autonomous), Green (TDD).

### Feature 1.2: Intelligent Onboarding & "Click-to-Index" UI

**Goal:** Proactively identify existing projects and provide a one-click path to hydrate the context engine using low-storage indexing.

**Implementation Logic:**

1. **Workspace Detection:** On extension activation, perform a lightweight scan of the root directory.

   - **Criteria:** Check for version control folders (e.g., `.git`) and source code file density.
   - **Condition:** If the project looks established BUT no local LEANN index exists in `.leann/`:

2. **The "Welcome Card" (Webview):**

   - **Action:** Render a specialized HTML card at the top of the chat history.
   - **Content:** A friendly message stating Teddy found an existing codebase.
   - **Highlight:** "Zero-Bloat Indexing Ready (97% storage savings)."
   - **Interactive Element:** A prominent, clickable button labeled **"🚀 Initialize LEANN Index"**.

3. **Initialization Handler (Click Event):**

   - **Step A (Constitution):** Check for `TEDDY.md`. If missing, analyze the project stack and generate a tailored `TEDDY.md` file.
   - **Step B (Indexing):** Trigger the `leann build` process via the MCP bridge (Feature 2.2). This builds the graph structure without storing heavy vectors.
   - **Step C (UI Update):** Once complete, replace the card with a "Ready" status indicator.

## Phase 2: The "Brain" (Context & Perception)

### Feature 2.1: Compressed Repo Map (The "Far-Sight" Engine)

**Goal:** Allow the local 8k-context model to "see" the entire project structure and API surface area.

**Implementation Logic:**

1. **Tree Walker:** Recursively walk the file tree, respecting `.gitignore`.
2. **Semantic Compression (Tree-sitter):**

   - For every supported source file, parse the AST.
   - **Extraction:** Strip implementation details. Retain class names, method signatures, exported functions, and docstrings.
   - **Output Format:** concise skeleton representation.

3. **Relevance Ranking:**

   - Build a lightweight dependency graph based on import statements.
   - **Truncation:** If the map exceeds the token budget (e.g., 2k tokens), prune the lowest-ranked files.

4. **Context Injection:** Automatically inject this compressed map into a reserved "System Layer" of the context window.

### Feature 2.2: Auto-RAG via LEANN (The "Low-Storage" Memory)

**Goal:** Automatically fetch relevant code/docs with minimal storage footprint using LEANN's on-the-fly recomputation.

**Implementation Logic:**

1. **Infrastructure (MCP Bridge):**

   - Bundle or connect to the **LEANN MCP Server**.
   - **Advantages:** Eliminates the need for a heavy Qdrant instance; allows indexing 60M+ tokens with <5% storage overhead.

2. **Prompt Interception:** Intercept the user's message before it reaches the LLM.
3. **Vector Retrieval:**

   - Send the query to the LEANN MCP tool.
   - **Collections:**
     - `codebase`: The user's source code.
     - `dependencies`: `llm.txt` files fetched for project dependencies.
   - **Mechanism:** LEANN recomputes embeddings on-the-fly during search, ensuring 100% privacy and negligible disk usage.

4. **Silent Injection:** Append the top matching chunks (up to a fixed token limit) into a `<context>` block in the prompt.

### Feature 2.3: Real-Time LSP Bridge (The "Eyes")

**Goal:** Give the agent access to real-time errors and warnings without running a build.

**Implementation Logic:**

1. **Diagnostic Observer:** Hook into `vscode.languages.getDiagnostics`.
2. **Active Monitoring:** Monitor files the Agent is editing.
3. **Feedback Loop:**

   - **Pre-Commit Check:** Before marking a task done, query diagnostics.
   - **Auto-Correction:** If LSP reports errors (Red Squiggles), feed the error back to the LLM immediately.
   - **Blocking:** Prevent proceeding if critical errors exist.

## Phase 3: The Modes (Implicit Workflows)

### Feature 3.1: Autonomous Mode (The Waterfall Engine)

**Goal:** Execute a structured Plan-Execute loop automatically.

**Implementation Logic:**

1. **Trigger:** User selects "Autonomous" mode and provides a goal.
2. **Implicit Step 1: Specification:**

   - Agent generates/updates `spec.md`, obeying `TEDDY.md`.
   - User validates Spec.

3. **Implicit Step 2: Planning:**

   - Agent reads Spec + Repo Map.
   - Agent generates `plan.md` (checklist).
   - User validates Plan.

4. **Implicit Step 3: Execution Loop:**

   - Agent iterates `plan.md`.
   - Fetch file -> Generate Code -> **LSP Check** -> Mark Done.

### Feature 3.2: TDD Mode (The Validation Engine)

**Goal:** Enforce Test-Driven Development logic automatically.

**Implementation Logic:**

1. **Trigger:** User selects "TDD" mode.
2. **System Prompt:** "You are in TDD Mode. Write failing test first."
3. **Phase A: Red:** Agent writes `*.test.ts`. System runs test -> MUST Fail.
4. **Phase B: Green:** Agent writes implementation. **LSP Check**. System runs test -> MUST Pass.
5. **Phase C: Refactor:** Optional cleanup while keeping tests Green.

## Phase 4: Hardware & Reliability

### Feature 4.1: The 4090 Safety Profile

**Goal:** Prevent local hardware crashes by enforcing strict resource budgets.

**Implementation Logic:**

1. **Hardware Detection:** Detect local GPU stats.
2. **Token Budget Enforcer (DeepSeek-R1-32B):**

   - **Hard Limit:** **8,192 tokens**.
   - **Allocation:**
     - Layer 1 (Active File): 40%
     - Layer 2 (Repo Map): 25%
     - Layer 3 (LEANN RAG): 20%
     - Layer 4 (History): 15%

3. **Storage Safety:** Since LEANN is used, disk usage warnings are disabled (negligible footprint). Focus remains strictly on VRAM management.
