# Request input separation verification

## State

Implementation follows the accepted intent, spec, and plan on codex/separate-request-inputs, based on the PR #1 merge ede17738458ae68778f723b7576cf8b328928533.

The first independent review found one Settings draft-retention race. The revision below fixes it, with a regression test and a rendered delayed-save check. Fresh review and PR preparation remain pending.

## Automated checks

- pnpm lint: passed, 37 files checked, no errors.
- pnpm test: passed, 39 tests, zero failures, cancellations, or skipped tests.
- pnpm package:mac: passed, including tsc --noEmit, Electron main/preload/renderer builds, MCP build, macOS window-list compilation, and arm64 app packaging.
- git diff --check: passed.

The final production-code run of lint, tests, and packaging followed the stale-save revision, saved-value publishing change, and 600-pixel Settings layout. A formatting error on an earlier lint run was corrected before the final checks.

Packaging produced dist/mac-arm64/Perception.app. Confirmed app.asar exists, out/mcp/server.cjs is unpacked, and out/bin/window-list is unpacked and executable. The packager reports the existing default icon and absence of a Developer ID signing identity. This prototype bundle is unsigned and unnotarized as documented in README.

Adapter tests exercise CodexAgent.ask through a real local executable fixture. The executable records argv, emits JSONL events, and sends a drawing command through the real DrawingBridge. These checks do not contact a model or use the person's Codex history.

## Rendered Settings checks

The compiled app was launched through a temporary Electron bootstrap. It set app.userData to a private temporary directory before requiring out/main/index.js. All file writes, legacy fixtures, and relaunches used that directory. The person's normal Perception settings were not changed.

Native UI tooling opened the app menu and Settings, edited the textarea, clicked Save and Clear preferences, changed a shortcut, closed/reopened Settings, and quit/relaunched the app. Screenshots and accessibility trees were inspected during these interactions.

Observed results:

1. The final 500 by 600 window shows the User preferences label, full help text, textarea, Save, Clear preferences, and shortcut controls without clipping. Save and Clear confirmations fit beside the action buttons.
2. Saving "Keep answers short.\nUse Markdown when useful." wrote that exact multiline userPreferences value. The file retained shortcut and position fields and contained no developerInstructions field.
3. After quitting and relaunching, Settings displayed the same multiline value.
4. Clear preferences emptied the textarea, confirmed "Preferences cleared for new chats.", and wrote an empty userPreferences value. After another relaunch, the textarea remained empty.
5. An unsaved draft containing </user_preferences> survived loss of focus and the broadcast caused by saving Control+Alt+K through the shortcut recorder. The shortcut also survived relaunch.
6. A legacy fixture containing "Legacy custom: explain step by step." loaded that exact text into User preferences. Save rewrote the setting as userPreferences and removed the legacy field.
7. Fixtures generated from the actual default constants in Git commits 82048f9 and a101a4c each loaded empty preferences in the rendered Settings.
8. To force a write failure, the temporary preferences.json file was moved aside and replaced with a directory. Save showed "Could not save preferences." and retained the textarea draft. On the final build, closing and reopening Settings showed the last successfully saved legacy-custom value, proving the failed value had not entered the shared saved state. Restoring the temporary file and clicking Save succeeded, proving the queue recovered.

The verification bootstrap and fixtures are currently at /var/folders/c9/6p3b_52j3tjg1flszl2g97440000gn/T/perception-settings-verification-6gdhdxa1. This is temporary test state, not a required project path. To reproduce, create a private temporary userData directory and a bootstrap containing app.setPath('userData', temporaryPath) before loading the compiled main entry, then launch it with pnpm exec electron.

## Independent review and revision

Interlock's first fresh review found no material standards issues and verified AC1-AC10 and AC12-AC14. It independently ran lint, all 36 original tests, and macOS packaging. Rendered custom/empty persistence, layout, and an exact 10,000-character preference save passed. Its additional overlapping-save check found a P2 gap in AC11.

The failure sequence was Save A pending, Save B pending, then an unsaved edit back to A. The older A completion cleared the dirty flag by comparing text alone. B's broadcast then replaced the unsaved A draft.

The revision tracks each edit and save. Only the current save for the current edit can mark the draft clean or display its result. Clear counts as an edit. tests/settings.test.ts bundles the actual renderer and invokes its registered handlers with controllable IPC promises and state broadcasts. It verifies the reported sequence, stale success/failure confirmations, Clear followed by an edit, failed-save draft retention, retry, and synchronization after success. The two race regressions failed on the earlier implementation and passed after the fix. The complete suite now passes 39 tests.

The compiled app was also checked with a private userData directory and a temporary bootstrap that delays only its preferences.json writes. Native UI actions entered A and saved, entered B and saved, then left A unsaved and focused. After releasing writes A and B in order, Settings still showed the unsaved A, with no stale success confirmation. The file contained B, proving both writes completed. The isolated app was quit afterward. This temporary bootstrap is at /var/folders/c9/6p3b_52j3tjg1flszl2g97440000gn/T/perception-race-fix-q8tn9cdq/controlled.cjs.

## Acceptance evidence

| Criterion | Evidence |
| --- | --- |
| AC1 | tests/codex-agent.test.ts, "new and resumed CLI requests separate fixed rules, preferences, current context, and PNGs", compares the exact developer_instructions config to PERCEPTION_INSTRUCTIONS on both routes and excludes fixed rules from the prompt. The constructor no longer accepts editable instructions. |
| AC2 | src/main/perception-instructions.ts contains all required behaviors. "fixed instructions cover interpretation, tools, documentation, trust, and style authority" asserts their content. Model compliance is not guaranteed by this check. |
| AC3 | tests/preferences.test.ts covers custom, empty, whitespace, absent, invalid, 10,000 and 10,001 characters, and authoritative new fields. Rendered Save/Clear/relaunch checks exercise saving through IPC and preferences.json. |
| AC4 | Preference tests independently construct both historical defaults, test line endings and outer whitespace, preserve custom appended text, and verify serialization removes developerInstructions. Rendered legacy-custom and both default-fixture checks passed using actual Git defaults. |
| AC5 | "preferences snapshot on first nonempty send and only New chat refreshes them" verifies before-first-send edits, ignored empty send, follow-ups, reset, custom-to-empty, and empty-to-custom behavior. The pending-capture test covers concurrent ignored sends. |
| AC6 | Conversation tests cover capture/CLI failure, image disposal, retained snapshots through display cancellation, and stale callbacks. Adapter tests cover failure before and after thread.started, empty response, and abort before and after a thread ID, followed by preference initialization retry and successful resume omission. |
| AC7 | Adapter tests inspect actual argv and the exact first prompt. Follow-ups receive new question/image data. Conversation tests assert separate raw fields and absence of prompt before adapter assembly. |
| AC8 | Adapter tests cover both observation scopes, selection/no selection, metadata/no metadata, and selection without metadata. Existing app-context and annotate-image tests verify window choice and pixels. The pending-capture test verifies copied selection geometry. |
| AC9 | "delimiter-like text and supplied entities cannot break any prompt section" injects tags, ampersands, and pre-escaped entities into preferences, question, capture description, app name, and bundle ID, then checks exact escaped values and all six delimiter tokens. Conversation tests preserve raw text. |
| AC10 | Adapter tests verify image -i, new and resume arguments, sandbox, model, config isolation, web search, and MCP config, and receive real marks through the bridge. They confirm request sockets are removed. Production continues using the one existing adapter. |
| AC11 | All rendered checks above passed, including final-layout screenshots, multiline save/relaunch, Clear/relaunch, unsaved draft after shortcut broadcast, migration, failed-save draft retention, saved-state isolation, and write recovery. The stale-save revision additionally passes actual-renderer delayed-response regressions and the native delayed-save check described above. |
| AC12 | Full suite passes existing capture privacy/stale removal, annotation pixels/geometry, drawing validation, reset-during-capture cleanup, stale callbacks, clearing, and display cancellation. Added tests cover failure disposal and ignored concurrent sends. |
| AC13 | README documents Save/Clear, first-message snapshot timing, New chat, style precedence, browser identity limits, raw HarnessRequest inputs, adapter assembly, image attachment, failed initialization, and cancellation. Obsolete next-message timing and editable developer-rule copy are removed. |
| AC14 | Final lint, all 39 tests, typecheck/build/macOS packaging passed. The app bundle and unpacked executable/helper artifacts were inspected. |
| AC15 | The first fresh review requested the AC11 revision. Its fix and observable evidence are recorded above. A second fresh review and focused PR follow; no PR URL is claimed yet. |

## Plan deviations and limits

The Settings window height adjustment and queued saved-value publishing are recorded in plan.md. Both stay within the accepted layout and saved-preference behavior.

No model-response compliance claim is made. Automated tests establish developer-rule content, CLI inputs, image attachment, lifecycle, and drawing transport. Native UI checks establish Settings interaction and persistence. The existing display-capture mechanics were retained and regression-tested; verification did not send a live screen to a model.
