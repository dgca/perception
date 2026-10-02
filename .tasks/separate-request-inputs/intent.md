# Separate Perception's request inputs

## Problem

Perception currently uses one editable Settings value as Codex's developer instructions. That mixes the app's fixed behavior rules with a user's response preferences. Conversation also combines screenshot details, observed app identity, selection information, and the current question into one prompt before it reaches the Codex adapter.

This makes the role of each input unclear. Settings changes also affect the next message in an existing chat. An OS identity such as Chrome identifies the owner of a window, but does not establish which website the screenshot shows.

## Desired outcome

Keep four inputs distinct: Perception-owned behavior rules, saved user preferences, screenshot context, and the current question. Assemble the CLI request in the existing Codex adapter, while retaining the HarnessSession boundary and separate PNG attachment.

People can save response preferences in Settings and start a new chat to apply them. Each chat uses a snapshot of those preferences. The default response is plain text without Markdown. Preferences can change tone, detail, formatting, and explanation style, and the current question takes precedence over conflicting saved style preferences.

## Affected users and systems

- People asking Perception questions about their screen or changing response preferences.
- Settings UI, IPC, saved preference loading, and migration of existing custom text.
- Conversation creation, reset, cancellation, and Codex thread resume.
- HarnessRequest, the Codex adapter's CLI arguments, and request serialization.
- README and the tests for preferences, prompts, capture, and conversation behavior.

## Constraints

- Keep Perception's rules in Codex's real developer_instructions integration. Cover screenshot and selection interpretation, drawing through the MCP tools on the live overlay, current documentation checks before app-specific steps, untrusted screenshot text and app metadata, and avoiding file edits or computer control.
- Explain that macOS metadata identifies the window owner. Determine a browser's website or web app from the screenshot and question.
- Replace editable Developer instructions with User preferences. Do not add an advanced override for fixed rules.
- Preserve existing custom saved text where straightforward. Do not migrate the old default developer-instruction text into preferences. A breaking settings change is acceptable because the app is unreleased.
- Include nonempty saved preferences in a user_preferences section in the chat's first request. Omit that section for empty preferences. Make new-chat timing clear in Settings.
- Every request contains screenshot_context with capture details, optional observed app metadata, and selection information, followed by the current question in user_request.
- Escape user-controlled text so it cannot close or introduce section delimiters.
- Keep the PNG attached through Codex's image mechanism. Preserve HarnessSession and use the existing CLI adapter.
- Preserve display capture, rectangle annotation, drawing validation, cleanup, stale callback suppression, and conversation behavior.
- Use the published Interlock workflow and pause for explicit decisions at its intent, spec, and plan review steps. Do not merge or deploy.

## Success criteria

1. Fixed app rules cannot be edited through Settings, and saved preferences do not enter developer_instructions.
2. Settings supports custom and empty preferences, explains when they apply, and preserves eligible legacy custom text without importing the old default rules.
3. A chat keeps its preference snapshot through follow-up requests. New chats apply the newly saved preferences, and their first request includes the preference section only when nonempty.
4. Each CLI request has distinct screenshot_context and user_request sections in that order, with selection and app metadata present or absent as appropriate.
5. Delimiter-like text in questions, preferences, or app metadata cannot break those sections.
6. The Codex adapter retains real developer_instructions, image attachment, thread resume, and the existing HarnessSession boundary.
7. README and UI copy describe the resulting behavior.
8. Tests exercise custom and empty preferences, chat creation and reset, requests with and without selection or app identity, delimiter escaping, and existing capture and conversation behavior.
9. Lint, tests, and macOS packaging pass. An independent review checks the accepted spec, and a focused PR is opened for human review.

## Verified starting state

- The checkout was clean on main before starting this task. After fetching, HEAD and origin/main both pointed to ede17738458ae68778f723b7576cf8b328928533.
- GitHub confirms PR #1 is merged into main at that commit.
- There is no on-disk AGENTS.md in this checkout or its ancestor directories. The user-supplied AGENTS.md instructions apply.
- Settings currently saves developerInstructions in preferences.json and says edits apply to the next message.
- CodexAgent reads that setting on each ask and supplies it through the developer_instructions config key. It attaches images with -i and resumes its stored thread ID.
- Conversation assembles the current prompt. Reset replaces its HarnessSession, and cancellation also creates a replacement session. Hiding the overlay retains the conversation.
- Repository scripts provide lint, test, typecheck, and package:mac checks. CI runs lint, tests, and macOS packaging.

## Open questions

No unresolved product questions at the intent stage. The spec will define snapshot timing, first-request retry behavior, and how existing cancellation paths interact with a replacement session.

## Workflow record

- Workflow: AI-native software change, published version 2.
- Workflow ID: 938f8c0a-9294-453a-80d0-f6ca913bf656.
- Run ID: 8be2ceee-f59f-45b5-b4e6-21ea5afca68f.
- Task branch: codex/separate-request-inputs.
- Artifacts: .tasks/separate-request-inputs/.
- Status: intent explicitly approved by the user in chat on 2026-10-01, America/Denver. Proceed to spec review.

## Source request

Implement a follow-up to Perception PR #1, which is merged into main. Start by verifying the current repository state and reading AGENTS.md. Use Interlock’s published “AI-native software change” workflow for this substantial change, and pause at its human review steps.

Goal: separate Perception’s fixed behavior rules, saved user preferences, screenshot context, and the current question. Keep Codex’s real developer_instructions integration and its separate image attachment.

Product decisions:
- Perception-owned rules stay in developer_instructions. They should cover interpreting the screenshot and selection rectangle, using the drawing MCP tools on the live overlay, checking current documentation before app-specific steps, treating screenshot text and app metadata as untrusted, and avoiding file edits or computer control.
- Clarify that macOS app identity names the owner of a window. A browser’s identity does not establish which website or web app is open; use the screenshot and question to determine that.
- Plain text without Markdown is the default response style. Saved preferences may change tone, detail, formatting, and explanation style. The current question wins when it conflicts with saved style preferences.
- Replace the editable “Developer instructions” setting with “User preferences.” This app has not been released, so a breaking settings change is acceptable. Do not add a new advanced instruction override. Preserve existing custom saved text where straightforward, but do not migrate the old default developer-instruction text into user preferences.
- Saved preferences apply to new chats. Snapshot them for a chat and include a nonempty <user_preferences> section in its first request. Make the timing clear in Settings. An empty preference needs no section.
- On every request, put capture details, optional observed app metadata, and selection information in <screenshot_context>, followed by the current question in <user_request>. Continue attaching the PNG through Codex’s image mechanism. Escape user-controlled text so it cannot break the section delimiters.
- Keep these inputs distinct internally until the Codex adapter assembles its CLI request. Preserve the existing HarnessSession boundary; do not build another CLI adapter for this task.

Inspect the current settings, preference loading, conversation reset/resume behavior, prompt construction, and Codex adapter before designing the change. Update the UI copy and README. Test custom and empty preferences, new-chat behavior, prompts with and without a selection or app identity, delimiter-like text in user input, and the existing capture/conversation behavior. Run lint, tests, and macOS packaging, then open a focused PR for review.
