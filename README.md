# Perception

Perception is a macOS menu bar prototype for asking an AI agent about the screen in front of you. Open the overlay, ask a question, and optionally draw a rectangle around the part you mean. The agent replies in the overlay and can draw rectangles, arrows, and labels on the screen.

The app uses Electron and TypeScript. It sends a capture of the active display to Codex CLI with GPT-6 Sol and exposes drawing tools to that agent through a local MCP server. The overlay works over other apps without an integration with each one.

## Run the prototype

You need macOS, Node.js 22 or newer, pnpm, and a signed-in Codex CLI. Perception looks for `codex` on your `PATH` and in common install locations. If it does not find Codex, choose the executable in the prompt window.

```sh
pnpm install
pnpm dev
```

Perception starts with its overlay open. Press **⌘⇧Space** to show or hide it. Use the menu bar icon to show or hide the overlay, open **Settings**, or quit the app. In **Settings**, click the shortcut and press a new combination. You can also edit the developer instructions sent to Codex, save them, or restore the default. Changes apply to the next message. Press **Escape** or click the close button to dismiss the overlay.

Click the rectangle button, then drag across the part of the screen you want to discuss. The orange rectangle appears on the live overlay and on the image sent with your next message. The pointer button lets you use the app beneath the overlay while keeping the conversation open. Send a prompt with **Return**; use **Shift-Return** for a new line. The agent's marks appear in teal. The toolbar's trash button clears annotations while keeping the conversation. Click **New chat** to start over.

Drag the six dots on the toolbar or the chat box header to move that window. Perception saves both positions and uses them when you reopen the overlay.

To build a macOS app bundle:

```sh
pnpm package:mac
```

The bundle is at `dist/mac-arm64/Perception.app` on Apple silicon. It is unsigned and unnotarized, so macOS may require a manual first-launch approval. Screen capture needs **Screen Recording** permission. If a request fails, click **Screen Recording settings** in the prompt window and enable Perception there. A development launch and a packaged app may need separate permissions.

## What the prototype does

- Captures the display under the pointer when you send a prompt. Perception hides its own windows during capture.
- Adds your selected rectangle to the image and tells the agent its coordinates.
- Shows the agent's text in the prompt window and its marks on the live canvas.
- Keeps a Codex conversation for follow-up prompts until you clear it or quit.

Perception writes captures to a private directory, removes them after each request, and clears any left by a previous run at startup. The current conversation and marks live in app memory; the Codex CLI handles its own session storage and model communication. The agent runs with a read-only file sandbox and has no computer-control tool. The prototype covers one display at a time, does not track UI elements as they move, and has no model picker or accessibility inspection yet.

## Harness interface

`Conversation` owns the request lifecycle, capture cleanup, conversation reset, and which status updates and marks may reach the overlay. It creates a `HarnessSession` for each conversation. The session's `ask` method receives a prompt, image path, cancellation signal, and callbacks for status and drawing. `CodexAgent` is the current adapter: it owns the Codex CLI process, Codex thread ID, and a drawing MCP socket for each request. A new harness implements `HarnessSession` and handles its own process, conversation ID, and tool transport. The request lifecycle and capture code do not depend on those details. The current settings UI remains Codex-specific.

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
