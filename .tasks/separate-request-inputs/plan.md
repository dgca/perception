# Implement request input separation

## Status

The user explicitly approved intent.md, accepted spec.md, and approved this plan in chat. The spec is committed at 6ce7244. Proceed with implementation on codex/separate-request-inputs.

Interlock run: 8be2ceee-f59f-45b5-b4e6-21ea5afca68f, AI-native software change, published version 2.

## Verified repository facts

- The task branch starts from ede1773, the PR #1 merge on main. Only accepted task artifacts have been committed so far.
- There is no repository or ancestor AGENTS.md on disk. The user-supplied instructions require Hindsight checks and the published Interlock workflow with human review steps.
- HarnessSession has one method, ask. Conversation owns capture cleanup, cancellation, reset, and callback suppression. CodexAgent owns spawn, thread ID, and drawing transport.
- Saved settings live in preferences.json. readPreferences constructs the saved object, and savePreferences serializes it through a promise queue.
- Both historical developer-instruction defaults are available from Git, in 82048f9 and a101a4c. Earlier f527916 had no such setting.
- Settings is a 500 by 560 fixed-size Electron window. Its current textarea has a 176-pixel height, and state broadcasts can replace its value when it loses focus.
- Tests use node:test and esbuild bundles in out/tests. There is no existing CodexAgent test or rendered Settings test.
- pnpm test bundles tests/*.test.ts, then runs node --test. pnpm lint runs Biome. pnpm package:mac runs typecheck, Electron builds, the MCP build, the native macOS helper build, and electron-builder.
- CI runs lint, tests, and macOS packaging on macOS. The current machine is macOS with Node 24.13.0 and pnpm 10.21.0.
- The installed CLI supports config overrides and image attachments for new and resumed requests. The accepted spec links the official developer_instructions reference.

## Implementation sequence

### 1. Commit the accepted plan

After explicit plan approval, update this artifact's status and commit it before implementation. Keep the current branch and Interlock run. Preserve unrelated work if any appears.

### 2. Separate fixed rules from saved preferences

Create src/main/perception-instructions.ts for the fixed rule constant described in the spec. Keep it independent of Preferences and renderer imports.

In src/main/preferences.ts, replace developerInstructions with userPreferences and rename its validator and length limit. Default to empty. Implement the accepted new-field precedence and legacy migration inside readPreferences. Keep exact historical defaults as private migration literals, with outer-whitespace and line-ending normalization only for comparison. Preserve custom text verbatim.

Update tests/preferences.test.ts to cover new custom, empty, whitespace-only, missing, wrong-type, and oversized values. Verify 10,000 and 10,001 characters, authoritative new values with a legacy value present, both old defaults, normalized old defaults, legacy custom text, and shortcut and position preservation. Verify serialization of the returned Preferences object excludes the legacy field.

### 3. Pass distinct request inputs and snapshot preferences

Update src/main/harness.ts to replace prompt with userRequest, userPreferences, and screenshotContext. Define screenshotContext with a capture-description string, optional AppContext, and Rectangle or null. Keep imagePath, signal, and callbacks intact.

Update src/main/conversation.ts to snapshot state.userPreferences at its first accepted nonempty send before capture. Keep that snapshot through successful follow-ups, failures, clearMarks, and cancellation. Clear it only on reset for New chat. Copy the selected rectangle at send time, pass the current capture's app metadata, and remove prompt formatting from Conversation.

Extend tests/conversation.test.ts and update state fixtures in any affected tests. Assert that inputs reach FakeSession unescaped and separate. Cover edits before the first message, ignored empty and concurrent sends, mid-chat edits, reset, custom-to-empty and empty-to-custom transitions, capture failure, harness failure, display-change cancellation, idle display change, and rectangle mutation while capture is pending. Retain the existing stale status, mark, answer, and image disposal assertions.

Use the current session creation and cancellation behavior. Do not add a second session interface or change visible conversation history.

### 4. Assemble CLI requests in CodexAgent

Update src/main/codex-agent.ts to import the fixed rules and remove the editable developer-instruction callback. Serialize the separate request inputs inside this adapter, with a small internal serializer if useful.

Escape ampersands, less-than characters, and greater-than characters in every variable section value. Retain appContextPrompt's existing metadata limits and control-character handling, and escape its rendered text before adding it to screenshot_context. Keep this helper out of Conversation's request construction.

Track successful preference initialization separately from threadId. Include nonempty user_preferences until initialization succeeds, then omit it on normal follow-ups. A failed first request retains the need for initialization even if thread.started supplied a thread ID. A replacement adapter starts with initialization pending.

Keep the real developer_instructions config, image -i argument, exec and exec resume routes, model, web search, sandbox, and drawing bridge. Mark initialization complete only when ask has produced a successful answer for that request. Aborted and failed requests must not mark it complete.

### 5. Verify the actual adapter process path

Add tests/codex-agent.test.ts and a small test-only Electron app fixture under tests/support/. Make the test bundler alias electron to this fixture, without changing production imports or builds. The fixture supplies only the app paths and packaged state the adapter uses.

Each adapter test creates private temporary app paths and an executable fixture. The fixture records process.argv and emits Codex JSONL events, including thread.started, agent_message, and requested failure states. Call the real CodexAgent.ask, so the existing spawn and DrawingBridge paths run. The fixture does not contact a model or execute the attached image.

Inspect recorded CLI arguments for:

- New request with custom preferences, fixed config, MCP config, image path, section order, and sandbox.
- Successful resumed request with a fresh image and question, retained thread ID, fixed config, and no repeated preference section.
- Empty and whitespace-only preferences, which omit the section.
- Both selection states and both app scopes, plus missing app metadata.
- Delimiter-like text in preferences, question, capture description, app name, and bundle ID. Check exact escaped values and section counts, including ampersands and pre-escaped entities.
- Failure before thread.started, failure after thread.started, and an aborted first request. Retry initialization with the same preference value and verify resume when a thread ID exists.
- A missing binary or MCP script error, preserving the normal request error behavior.

Clean up temporary executables, arguments, files, and sockets. Assert the fixed rule constant's required content and its exact use in both CLI routes. Keep tests independent of the user's Codex credentials, saved chats, and preference file.

The test-only alias is a loader fixture, not another CLI adapter. Serializer-only tests may supplement these process tests but cannot replace them.

### 6. Replace the Settings setting and update documentation

Update src/shared/types.ts, src/preload/index.ts, and src/main/index.ts to use userPreferences and setUserPreferences consistently. Validate IPC values with the new validator, save only the new setting, and construct CodexAgent without a preference callback.

Update src/renderer/index.ts and src/renderer/style.css for the User preferences label, accessible name, accepted help text, Save, Clear preferences, confirmations, and errors. Remove the import of the developer-rule default. Track an unsaved draft so a background state broadcast or failed save does not overwrite it, including after focus moves to a button. Only synchronize saved state when no draft needs preservation.

Use the existing layout and adjust spacing or window height only if rendered checks show clipping. Keep the shortcut recorder and reset action.

Update README.md with new-chat preference timing, default plain-text style, current-question precedence, browser identity limits, and the distinct HarnessRequest inputs assembled by CodexAgent.

### 7. Check the rendered Settings and saved-value path

Launch the built Electron app with a temporary verification bootstrap that sets userData to a private temporary directory before loading the compiled main entry. Use a separate instance-lock path. The bootstrap is verification-only and does not add a production debug setting or change the user's saved preferences.

Inspect and operate the real Settings window through the available native UI tools. Verify:

1. Label, help text, textarea, Save, Clear preferences, confirmations, and shortcut controls are visible without clipping.
2. Saving a custom multiline value writes userPreferences to the temporary preferences.json and preserves shortcut and position fields.
3. Quit and relaunch with the same temporary directory. The custom value loads in Settings.
4. Clear preferences, then relaunch again. The saved value and textarea are empty, and developerInstructions is absent from the file.
5. Type an unsaved draft, move focus, and trigger a state update through another Settings control. The draft remains intact.
6. A legacy custom fixture loads as preferences, and each recognized old default loads empty.

Inspect the rendered UI after these interactions, not just source strings. Record screenshots and exact observations in the verification notes. If a native interaction or launch cannot run, record the specific gap and fix the blocker before reporting AC11 verified.

No model request is needed for Settings verification. Automated Conversation and adapter tests verify new-chat timing, failed initialization, and outgoing request contents.

### 8. Run required checks and record evidence

Run pnpm lint and pnpm test. Resolve failures without weakening the accepted criteria. Run pnpm package:mac after source changes settle. This includes typecheck and both builds; a separate repeated build is unnecessary if packaging succeeds.

Inspect the macOS bundle for the app's main and renderer output and the unpacked MCP script and window-list helper. Record the exact commands, results, and relevant packaging warnings. Do not install or deploy the app.

Write .tasks/separate-request-inputs/verification.md with one entry per acceptance criterion, its observable evidence, command or UI procedure, and any remaining gap. Tests establish request structure and lifecycle, not guaranteed model obedience. Keep that distinction explicit.

Commit code, tests, README, and verification notes with focused descriptions. Update plan.md if implementation materially departs from this sequence.

### 9. Complete Interlock's independent review and open the PR

Submit actual implementation and check results to the existing build assignment. Follow the published workflow to its fresh-context review.

Execute review in an isolated subagent without inherited implementation history, as required by the review assignment. Supply the repository path, branch, task artifact paths, base commit, and Interlock work identity. The reviewer inspects the diff and each criterion independently, performs a separate standards pass, and exercises an additional boundary state. Never claim fresh context in this implementation conversation.

Address every revise finding through Interlock's existing loop and rerun affected checks. After a pass, verify the accepted artifacts and intended changes are committed, push codex/separate-request-inputs, and open a focused PR against main through the preparePr assignment. Link intent.md, spec.md, plan.md, and the verification evidence in the PR.

Attach the created PR to this chat. Do not merge or deploy.

## Acceptance criterion evidence map

| Criteria | Planned evidence |
| --- | --- |
| AC1, AC2 | Actual adapter argument tests for fixed developer_instructions on exec and resume, rule-content assertions, and reviewer inspection of the rule constant. |
| AC3, AC4 | Preference load and serialization tests for valid, empty, invalid, boundary, new-field precedence, and legacy cases. Rendered Save, Clear, and reload checks against temporary preferences.json. |
| AC5 | Conversation tests for before-first-send edits, mid-chat edits, ignored sends, New chat, and both custom/empty transitions. |
| AC6 | Conversation failure and cancellation tests plus actual adapter initialization failure, abort, and retry tests, including a failure after thread.started. |
| AC7, AC8 | Raw HarnessRequest assertions and recorded CLI prompts across selection and app-context combinations, with the current image path and question. Existing app-context and image-annotation tests confirm geometry. |
| AC9 | Actual adapter argument assertions for delimiter-like text in every variable input, exact entity escaping, section counts, and raw-input separation before assembly. |
| AC10 | Adapter exec and resume argument tests, real bridge execution in those tests, existing drawing tests, and diff inspection for unchanged sandbox and tool configuration. |
| AC11 | Real rendered Settings interactions, layout inspection, unsaved-draft check, and custom/empty/legacy relaunch checks with temporary app data. |
| AC12 | Full existing test suite plus extended Conversation tests for concurrent sends, failure disposal, cancellation, reset, and stale callbacks. |
| AC13 | README review against the accepted behavior and changed types, with obsolete next-message copy removed. |
| AC14 | Successful pnpm lint, pnpm test, and pnpm package:mac output plus bundle inspection and rendered UI evidence. |
| AC15 | Fresh-context Interlock review, revision resolution if needed, focused PR URL, and attachment to this chat. PR creation occurs after review, so the reviewer records that step as pending preparation rather than inventing a URL. |

## Assumptions and risks

- The test-only Electron alias can support adapter process tests without adding a dependency. If bundling needs a small test-script adjustment, keep it limited to tests and record it.
- The native UI tooling can select and operate the verification instance. This is available capability, but the actual Settings interaction is unverified until implementation. Temporary app data prevents overwriting real preferences.
- A preference-initialization success must belong to the current ask. Cancellation or late process events must not flip that state.
- Known historical defaults need stable literals. Future fixed-rule edits must not alter migration matching.
- The longer Settings help text and confirmations may need a small layout adjustment after rendered inspection.
- Existing capture mechanics do not need a redesign. Full regression tests cover them, while a CLI fixture verifies the outgoing image path and structured request.
- Automated string and process checks do not establish how every model response follows the rules. The PR will report this limit without claiming a model behavior guarantee.

## Open questions

None. The implementation plan stays within the accepted spec. Human plan approval is recorded in the existing Interlock run.

## Implementation notes

- Rendered Settings checks showed crowded bottom controls at 560 pixels. The window height is now 600 pixels, with confirmations allowed to wrap beside the action buttons.
- Preference saves publish the new value only after the queued file write succeeds. General queued saves serialize the current settings when they run, so a later shortcut or position write cannot reintroduce an older preference value. Failed preference writes retain the last saved snapshot source.
- The test-only Electron alias uses tests/support/electron-app.ts. Adapter tests use real child processes and the real DrawingBridge, with no extra dependency or second CLI adapter.
- Screenshots were inspected through native UI tooling and returned inline during verification. The observations below are recorded in verification.md; screenshots were not added to the repository.
- Independent review found an overlapping-save race in draft retention. The renderer now tracks edit/save generations and ignores stale completions. A test bundles the actual renderer with CSS omitted, uses minimal DOM fixtures, and drives delayed IPC responses and broadcasts. No dependency or production interface was added. Rendered delayed writes verify the reported sequence.
