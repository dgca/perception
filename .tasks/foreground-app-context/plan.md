# Implement app context for screen requests

## Accepted scope

The [intent](intent.md) and [spec](spec.md) are approved. Each request identifies the ordinary app window under the selected rectangle's center, or the topmost ordinary app window on the captured display when there is no selection. The lookup happens near screenshot capture, after Perception hides its windows. A missing identity never blocks the question.

## Verified repository facts

- `src/main/index.ts` selects one display, hides the canvas, toolbar, and composer, waits 160 ms, and captures that display with `desktopCapturer`. It restores the overlay in `finally`.
- `src/main/conversation.ts` receives a `Capture`, builds the prompt, calls `HarnessSession.ask`, and disposes the capture. `src/main/capture-files.ts` writes the screenshot to a private directory.
- `src/shared/types.ts` defines normalized rectangle coordinates. `src/main/annotate-image.ts` draws the rectangle on the screenshot.
- `package.json` builds with `electron-vite` and packages with `electron-builder`. Its `files` include `out/**/*`; its current `asarUnpack` setting unpacks the drawing MCP script. `.github/workflows/ci.yml` runs lint, tests, and `pnpm package:mac` on macOS.
- This machine has `clang` through Xcode Command Line Tools. The repository currently has no native app-window lookup, no app-context prompt field, and no app-context tests.

## Implementation sequence

1. Add a small Objective-C helper in `src/native/` that calls `CGWindowListCopyWindowInfo` for on-screen windows. Return a bounded JSON array in front-to-back order with owner PID, bounds, layer, alpha, localized app name, and bundle ID. Do not read window titles. Exit with a failure code on native errors.
2. Add a build script for the helper and wire it into `pnpm dev`, `pnpm build`, and macOS packaging. Place the binary under `out/bin/`, add it to `asarUnpack`, and resolve its development or packaged path in the main process. Verify its architecture and executable bit in the bundle.
3. Add a TypeScript window selector in `src/main/`. Validate helper JSON and app text. Exclude Perception, desktop and empty windows, transparent windows, and non-normal layers. With no rectangle, choose the first qualifying window that intersects the captured display. With a rectangle, convert its normalized center through the captured display bounds and choose the first qualifying window containing that point. Return `null` when no safe choice exists.
4. In `src/main/index.ts`, invoke the helper after hiding Perception and before taking the screenshot. Keep lookup failure or timeout nonfatal. Attach the selected app to that request's `Capture`; do not store it in global overlay state. Preserve abort handling and the existing restore path.
5. In `src/main/conversation.ts`, add the app observation to the prompt as data with scope-specific wording. Bound and escape the name and bundle ID so control characters or line breaks cannot add instructions. Leave the existing user question, rectangle description, screenshot, and harness interface intact.
6. Update `README.md` with the app-context behavior, browser-tab limit, and build prerequisite for the native helper.

## Checks and proof

| Spec criterion | Check | Proof expected |
| --- | --- | --- |
| AC1 | Selector tests with front-to-back windows on the same and different displays; conversation prompt test with no rectangle | The selected app is the topmost eligible window on the captured display, and the prompt includes its name, bundle ID, and capture-time wording. |
| AC2 | Selector tests with a rectangle whose center is under a lower-ranked window, plus a rectangle spanning two apps; conversation prompt test | The center determines the app, and prompt wording names only the selection's center. |
| AC3 | Two sequential conversation requests with different capture app values; selector test excluding Perception PID | The second prompt has only the new app; Perception cannot win selection. |
| AC4 | Selector tests for no eligible window and invalid helper output; conversation test with no app; native lookup failure or timeout exercise | The screenshot request proceeds without an app line. |
| AC5 | Selector tests for a nonzero or negative display origin and normalized center conversion; prompt test with control characters and long app text | Coordinates select the intended window; app text cannot create new prompt lines or instructions. |
| AC6 | `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm package:mac`, packaged-helper smoke run, and existing capture and conversation tests | The helper is executable in development and in `app.asar.unpacked`, and existing request behavior passes. |

Run a live macOS check with a known app window and a selection, if Screen Recording permission is available for this checkout. Compare native window bounds with Electron display bounds on the current machine before trusting the coordinate conversion. Check a packaged helper directly from the built app bundle. Record any unavailable manual check as unverified, with the reason; do not present a helper-only check as proof of the full request path. There is no new visible UI to inspect.

## Risks and decisions to verify while building

- Apple reports Core Graphics window bounds in screen space. Confirm that they match Electron `Display.bounds` on a Retina display and any available secondary display. Adjust the conversion if live evidence shows a mismatch.
- A normal-layer filter may omit unusual floating windows. This follows the approved spec's preference for no label over a wrong one.
- The native lookup and screenshot are close in time but cannot be atomic. Keep the wording tied to the observation and avoid cached identity.
- The native helper runs as a separate executable. Confirm that screen metadata is available to it in both development and the packaged app; the screenshot still uses Perception's existing Screen Recording permission.
- A helper process must not delay or hang the screenshot request. Use a timeout and terminate it on cancellation.

## Completion

Commit the accepted plan, implementation, tests, and affected documentation on `codex/foreground-app-context`. Report the exact checks and any manual gap. The Interlock review stage then checks every acceptance criterion independently before a PR is prepared for human review.
