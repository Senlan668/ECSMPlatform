# Prompt Category Apply Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make prompt-library cards apply poster prompts to custom poster generation and workflow prompts to the workflow topic input without automatically starting either process.

**Architecture:** A focused `promptApply.js` utility owns the one-time `sessionStorage` protocol. The prompt-library page validates category, saves the payload, navigates, and records usage; `PosterPage` and `WorkflowPage` consume only payloads for their own category and map them into existing local state.

**Tech Stack:** Vue 3, Vue Router 4, browser `sessionStorage`, Node.js built-in test runner, Vite.

---

## File Map

- Create `frontend/src/utils/promptApply.js`: store, consume, validate, expire, and clear one-time prompt application payloads.
- Create `frontend/tests/promptApply.test.mjs`: utility behavior plus source-contract tests for the three page integrations.
- Modify `frontend/src/components/prompt/PromptCard.vue`: category whitelist and apply loading/disabled state.
- Modify `frontend/src/PromptLibraryPage.vue`: handle apply events, route by category, and record use count without blocking navigation.
- Modify `frontend/src/PosterPage.vue`: consume poster payload and convert it to existing `PanelCustom` prefill.
- Modify `frontend/src/WorkflowPage.vue`: consume workflow payload into the first-step topic input without invoking the workflow.

### Task 1: One-Time Prompt Apply Storage

**Files:**
- Create: `frontend/src/utils/promptApply.js`
- Create: `frontend/tests/promptApply.test.mjs`

- [ ] **Step 1: Write failing utility tests**

Cover save/consume once, category mismatch, malformed JSON, blank content, unknown category, payloads older than five minutes, and a storage object whose `setItem()` throws. Use an in-memory storage object and inject `now` into consumption so expiry is deterministic.

```js
test('prompt apply payload is consumed once for the matching category', () => {
  const storage = createMemoryStorage()
  savePromptApplyPayload(storage, {
    prompt_id: 'prompt-1',
    category: 'poster',
    content: '生成春日海报',
    created_at: 1000,
  })

  assert.equal(consumePromptApplyPayload(storage, 'poster', 1000)?.content, '生成春日海报')
  assert.equal(consumePromptApplyPayload(storage, 'poster', 1000), null)
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `node --test frontend/tests/promptApply.test.mjs`

Expected: FAIL because `frontend/src/utils/promptApply.js` does not exist.

- [ ] **Step 3: Implement the storage utility**

Export:

```js
export const PROMPT_APPLY_STORAGE_KEY = 'prompt_apply_payload'
export const PROMPT_APPLY_TTL_MS = 5 * 60 * 1000
export const APPLICABLE_PROMPT_CATEGORIES = ['poster', 'workflow']

export function savePromptApplyPayload(storage, payload) { /* validate and stringify */ }
export function consumePromptApplyPayload(storage, expectedCategory, now = Date.now()) { /* remove, parse, validate */ }
export function clearPromptApplyPayload(storage) { /* remove fixed key */ }
```

Saving must reject blank content and unknown categories. Consumption must remove the key before parsing so every result is one-time, including invalid data.

- [ ] **Step 4: Run focused tests**

Run: `node --test frontend/tests/promptApply.test.mjs`

Expected: PASS for all utility cases.

- [ ] **Step 5: Commit the utility**

```bash
git add frontend/src/utils/promptApply.js frontend/tests/promptApply.test.mjs
git commit -m "feat(prompt): add one-time apply payload storage"
```

### Task 2: Prompt Library Apply Interaction

**Files:**
- Modify: `frontend/src/components/prompt/PromptCard.vue`
- Modify: `frontend/src/PromptLibraryPage.vue`
- Test: `frontend/tests/promptApply.test.mjs`

- [ ] **Step 1: Add failing source-contract tests**

Assert that:

- `PromptCard` uses the poster/workflow whitelist rather than `category !== 'other'`.
- `PromptCard` accepts `applying` and `applyDisabled`, hides the button for unknown categories, and displays “应用中”.
- `PromptLibraryPage` binds `@use="handleApply"`, imports `useRouter`, `usePrompt`, and the prompt-apply utility.
- `PromptLibraryPage` passes `:applying="applyingPromptId === prompt.id"` and `:apply-disabled="Boolean(applyingPromptId)"` to every card.
- `handleApply` writes the payload, maps poster to the named `poster` route with `tab=custom`, maps workflow to the named `workflow` route, and prevents a second flow while `applyingPromptId` is set.
- blank content stops before storage/navigation and displays the exact “提示词内容为空” error toast.
- thrown and resolved Vue Router navigation failures both clear the payload and display an error.
- `sessionStorage.setItem()` failure restores state and displays an error without attempting navigation.
- usage recording is not awaited as a prerequisite for navigation.

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `node --test frontend/tests/promptApply.test.mjs`

Expected: FAIL because the page does not handle the `use` event and card props do not exist.

- [ ] **Step 3: Implement PromptCard state**

Use a computed whitelist check and render the button only for supported categories. Current card shows “应用中” when `applying`; all supported cards are disabled while `applyDisabled` is true.

- [ ] **Step 4: Implement PromptLibraryPage routing**

Add `applyingPromptId`, `useRouter()`, `isNavigationFailure`, and `handleApply(prompt)`:

1. reject an already-running flow or unsupported category; for blank content, show “提示词内容为空” and stop before storage/navigation;
2. save `{ prompt_id, category, content, created_at }`;
3. catch storage write errors before attempting navigation;
4. await the correct `router.push()` and pass the resolved value to `isNavigationFailure()`;
5. after successful navigation, launch `usePrompt(prompt.id).catch(console.warn)` without awaiting it;
6. on thrown or resolved navigation failure, clear the payload, reset state, and show an error toast.

Bind both card state props in the list so the active card displays “应用中” and all cards reject a second click while navigation is pending.

- [ ] **Step 5: Run the focused tests**

Run: `node --test frontend/tests/promptApply.test.mjs`

Expected: PASS for utility and prompt-library integration contracts.

- [ ] **Step 6: Commit the prompt-library integration**

```bash
git add frontend/src/components/prompt/PromptCard.vue frontend/src/PromptLibraryPage.vue frontend/tests/promptApply.test.mjs
git commit -m "feat(prompt): route prompt applications by category"
```

### Task 3: Poster Custom-Panel Prefill

**Files:**
- Modify: `frontend/src/PosterPage.vue`
- Test: `frontend/tests/promptApply.test.mjs`

- [ ] **Step 1: Add a failing poster integration test**

Assert that `PosterPage` consumes the `poster` payload during initialization, switches to `custom`, clears any prior result, and builds a `mode: 'custom'` prefill containing only the prompt plus a unique key. Extract the new consumer helper from source before asserting that this helper contains no generation call, so existing page generation functions do not create a false failure.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `node --test frontend/tests/promptApply.test.mjs`

Expected: FAIL because `PosterPage` does not consume prompt apply payloads.

- [ ] **Step 3: Implement poster consumption**

Import `consumePromptApplyPayload`, call it after existing initialization, and map a valid result to:

```js
activeTab.value = 'custom'
generatedResult.value = null
panelPrefill.value = {
  mode: 'custom',
  remix_key: `prompt:${payload.prompt_id}:${payload.created_at}`,
  prompt: payload.content,
}
```

Do not set aspect ratio, styles, color tone, or reference images in the payload; `PanelCustom` retains its existing defaults.

- [ ] **Step 4: Run the focused test**

Run: `node --test frontend/tests/promptApply.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit poster prefill**

```bash
git add frontend/src/PosterPage.vue frontend/tests/promptApply.test.mjs
git commit -m "feat(prompt): prefill custom poster from library"
```

### Task 4: Workflow Topic Prefill

**Files:**
- Modify: `frontend/src/WorkflowPage.vue`
- Test: `frontend/tests/promptApply.test.mjs`

- [ ] **Step 1: Add a failing workflow integration test**

Assert that `WorkflowPage` consumes only the `workflow` payload on mount, resets to step zero, and assigns `topicDirection`. Extract the new consumer helper from source before asserting that this helper does not call `startWithParams()` or `handleStart()`, so existing workflow functions do not create a false failure.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `node --test frontend/tests/promptApply.test.mjs`

Expected: FAIL because `WorkflowPage` does not consume prompt apply payloads.

- [ ] **Step 3: Implement workflow consumption**

Import `consumePromptApplyPayload` and add a small `consumePromptApplication()` helper invoked by `onMounted()`. It resets local workflow state, keeps `currentStep` at zero, and writes `payload.content` to `topicDirection` without starting network work.

- [ ] **Step 4: Run the focused test**

Run: `node --test frontend/tests/promptApply.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit workflow prefill**

```bash
git add frontend/src/WorkflowPage.vue frontend/tests/promptApply.test.mjs
git commit -m "feat(prompt): prefill workflow topic from library"
```

### Task 5: Full Verification

**Files:**
- Verify all modified frontend files.

- [ ] **Step 1: Run all frontend tests**

Run: `node --test frontend/tests/*.test.mjs`

Expected: all tests pass.

- [ ] **Step 2: Run the production build outside the repository**

Run from `frontend`: `npm run build -- --outDir /private/tmp/graph-xiaohongshu-frontend-dist --emptyOutDir`

Expected: Vite build succeeds without writing tracked build artifacts.

- [ ] **Step 3: Check formatting and worktree scope**

Run: `git diff --check`

Expected: no whitespace errors. Review `git status --short` and confirm only intended prompt-apply files changed.

- [ ] **Step 4: Perform final behavior review**

Confirm from the built source that:

- poster prompts land in custom poster generation with text filled and no automatic generation;
- workflow prompts land on step one with text filled and no automatic start;
- other/unknown categories have no apply button;
- a second apply click cannot overwrite the pending payload;
- use-count failure does not block successful navigation.
