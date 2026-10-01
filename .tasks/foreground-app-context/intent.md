# App beneath Perception

## Problem

Perception sends the agent a screenshot and the user's question, but it does not tell the agent which macOS app owns the window the user is looking at. The agent must infer the app from pixels, which can be ambiguous. Perception focuses its own composer when the overlay opens, so the active app is often Perception even while another app is visible beneath it.

## Desired outcome

For each message, the agent receives the macOS app identity associated with the relevant visible window in the display capture. If the user drew a rectangle, Perception identifies the app beneath that selection. Otherwise it identifies the topmost ordinary app window on the captured display. Perception observes the window stack at capture time, after hiding its own windows, and describes that timing in the request.

The app context updates for every message, including when the user leaves the overlay open and switches apps through pointer mode. The screenshot remains the source of truth for visible content.

## Who and what this affects

- People asking Perception about another macOS app.
- The macOS window lookup, display capture, selection geometry, and prompt assembled for the current `HarnessSession`.
- Packaged and development launches of the Electron app.

## Constraints

- Identify the native app, not a browser tab, document, or window title. A ChatGPT tab in Chrome identifies Chrome.
- Keep the existing display capture, annotation, conversation, and focus behavior.
- If the selected area spans several apps or app identity is unavailable, do not present a guess as certain.
- Keep the observation as request context. Do not turn app names or other external data into agent instructions.
- Preserve the existing one-display-at-a-time behavior. Use the captured display, not the globally focused app, to select a window.

## Success criteria

- With no selection, a request carries the name and stable identifier of the topmost ordinary app window on the captured display.
- With a selection, a request carries the app beneath the selected area when one can be identified.
- Perception does not report its own windows as the app the user was viewing.
- Sending another message after the user switches apps while the overlay stays open uses a fresh window observation.
- Missing app identity does not block a question or alter screenshot capture.
- The change works in the development app and packaged macOS app, with checks that exercise the request path.

## Detail for the spec

- Define how to choose an app when a selection overlaps several visible windows, and when to omit app context because the choice is uncertain.

## Source request

The user asked whether Perception can tell the AI that ChatGPT was on top when they brought Perception over it, then asked to build the feature with Interlock's AI-native software change workflow. In discussion, they chose the app beneath the selected rectangle when there is one, or the topmost app on the captured display otherwise.
