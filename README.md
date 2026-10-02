# Perception

Perception is a macOS menu bar prototype for asking an AI agent about the screen in front of you. Open the overlay, ask a question, and optionally draw a rectangle around the part you mean. The agent replies in the overlay and can draw rectangles, arrows, and labels on the screen.

The app uses Electron and TypeScript. It sends a capture of the active display to Codex CLI with GPT-6 Sol and exposes drawing tools to that agent through a local MCP server. The overlay works over other apps without an integration with each one.

## Run the prototype

You need macOS, Xcode Command Line Tools, Node.js 22 or newer, pnpm, and a signed-in Codex CLI. Perception uses the macOS compiler to build its window lookup helper. Perception looks for `codex` on your `PATH` and in common install locations. If it does not find Codex, choose the executable in the prompt window.

```sh
pnpm install
pnpm dev
```

Perception starts with its overlay open. Press **⌘⇧Space** to show or hide it. Use the menu bar icon to show or hide the overlay, open **Settings**, or quit the app. In **Settings**, click the shortcut and press a new combination. Press **Escape** or click the close button to dismiss the overlay.

Use **User preferences** in Settings to customize tone, detail, formatting, and explanations, then click **Save**. Preferences are saved for new chats and snapshotted when you send the first message. Click **New chat** to apply edits to an existing conversation. **Clear preferences** saves an empty value for new chats. Responses default to plain text without Markdown; your preferences can change that style, and the current question takes priority over conflicting saved style preferences. Perception's fixed behavior rules stay in its developer instructions and cannot be edited in Settings.

Click the rectangle button, then drag across the part of the screen you want to discuss. The orange rectangle appears on the live overlay and on the image sent with your next message. The pointer button lets you use the app beneath the overlay while keeping the conversation open. Send a prompt with **Return**; use **Shift-Return** for a new line. The agent's marks appear in teal. The toolbar's trash button clears annotations while keeping the conversation. Click **New chat** to start over.

With a rectangle, Perception tells the agent which app window was under its center when the screenshot was taken. Without one, it reports the topmost ordinary app window on the captured display. It checks again for every message. macOS identity names the window's owner, so a ChatGPT tab in Chrome is identified as Chrome. Browser identity does not establish which website or web app is open; the agent uses the screenshot and question to determine that. If macOS cannot identify the window, Perception sends the screenshot without an app label.

Drag the six dots on the toolbar or the chat box header to move that window. Perception saves both positions and uses them when you reopen the overlay.

To build a macOS app bundle:

```sh
pnpm package:mac
```

The bundle is at `dist/mac-arm64/Perception.app` on Apple silicon. It is unsigned and unnotarized, so macOS may require a manual first-launch approval. Screen capture needs **Screen Recording** permission. If a request fails, click **Screen Recording settings** in the prompt window and enable Perception there. A development launch and a packaged app may need separate permissions.

## What the prototype does

- Captures the display under the pointer when you send a prompt. Perception hides its own windows during capture.
- Reads the visible app window near capture time and sends its name and bundle ID as context for that request. It does not read window titles.
- Adds your selected rectangle to the image and tells the agent its coordinates.
- Shows the agent's text in the prompt window and its marks on the live canvas.
- Keeps a Codex conversation for follow-up prompts until you clear it or quit.

Perception writes captures to a private directory, removes them after each request, and clears any left by a previous run at startup. The current conversation and marks live in app memory; the Codex CLI handles its own session storage and model communication. The agent runs with a read-only file sandbox and has no computer-control tool. The prototype covers one display at a time, does not track UI elements as they move, and has no model picker or accessibility inspection yet.

## Harness interface

`Conversation` owns the request lifecycle, capture cleanup, conversation reset, and which status updates and marks may reach the overlay. It creates a `HarnessSession` and snapshots preferences on the first nonempty message. The session's `ask` method receives the current question, saved preference snapshot, screenshot context, image path, cancellation signal, and callbacks for status and drawing as separate inputs.

`CodexAgent` is the current adapter. It owns the CLI process, thread ID, drawing MCP socket, and prompt assembly. Perception's fixed rules use Codex's real `developer_instructions` config. A nonempty `<user_preferences>` section initializes the chat, followed by `<screenshot_context>` and `<user_request>` on every request. Variable text is escaped to preserve those sections, and the PNG is attached separately through Codex's image option. Successful follow-ups resume the CLI thread without repeating preferences. Failed initialization retries with the same snapshot. Display-change cancellation retains the snapshot when it replaces the session; **New chat** clears it.

A new harness implements `HarnessSession` and handles its own process, conversation ID, and tool transport. The request lifecycle and capture code do not depend on those details. Existing custom developer-instruction settings load as user preferences; the two historical built-in defaults load as empty preferences.

## Check the build

```sh
pnpm typecheck
pnpm test
pnpm lint
pnpm build
```

The local MCP server source is in `src/mcp/server.ts`. The app validates every drawing command before it adds a mark to the canvas.

## License

MIT. See [LICENSE](LICENSE).
