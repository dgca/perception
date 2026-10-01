# App context in screen requests

## Goal

Give the agent an OS-derived app identity for the part of the captured display the user means. The identity is a point-in-time observation alongside the screenshot, not a claim about keyboard focus or every visible window.

The [accepted intent](intent.md) governs the scope. The user's later choice supersedes the original idea of remembering the previously focused app.

## Requirements

1. For every message, inspect the on-screen window stack after Perception hides its own windows and near the time it captures the display.
2. With no selected rectangle, use the frontmost ordinary app window that overlaps the captured display. With a rectangle, use the frontmost ordinary app window at the rectangle's center. Say "at the selection's center" in the latter case so a selection that spans apps does not imply that one app owns the whole area.
3. Identify the app by its display name and bundle ID. Do not send window titles, process arguments, a browser tab, or a page URL.
4. Refresh the observation for every request. Never reuse an app identity from an earlier capture.
5. Omit app context if the window list fails, the target window or app cannot be identified, or the selected center lies outside an identifiable app window. Continue the existing screenshot and request flow.
6. Preserve overlay focus, active-display selection, screenshot annotation, capture cleanup, cancellation, and conversation behavior.

## Proposed design

Use a small macOS helper to read `CGWindowListCopyWindowInfo` with on-screen windows ordered front to back. It returns only the fields needed for selection: owner process ID, bounds, layer, alpha, app display name, and bundle ID. Resolve the bundle ID with `NSRunningApplication` from the owner process ID. Do not collect window titles. Run the helper when a prompt is sent, after the existing window-hide step. Bundle it with the development and packaged app. A helper failure is nonfatal.

Keep the window-selection rule in TypeScript so it can be tested without a desktop session. Exclude Perception's process, desktop elements, transparent or empty windows, and windows outside the captured display. Treat normal-layer app windows as ordinary windows; this excludes menus, notifications, and most transient system surfaces. The first qualifying window in front-to-back order wins when there is no selection. For a selection, convert its normalized center to the captured display's screen coordinates and choose the first qualifying window containing that point. If no window qualifies, omit app context. A selection crossing two apps uses the app at its center, with that exact scope stated in the prompt.

Return the selected app with the capture result so the prompt uses identity from the same request. Put it in a clearly labeled data section, for example: `App window at the selection's center when this screenshot was captured: ChatGPT (<bundle ID from macOS>).` Use the no-selection wording `Topmost app window on the captured display when this screenshot was captured: ...`. Bound and escape name and bundle ID text before adding them to the prompt. The screenshot remains available for the agent to check whether the app label matches the visible content.

Apple documents that [on-screen windows are listed front to back](https://developer.apple.com/documentation/coregraphics/cgwindowlistoption/optiononscreenonly), and that the [window owner process ID](https://developer.apple.com/documentation/coregraphics/kcgwindowownerpid) is available in the window dictionary. The existing capture path and display bounds are in `src/main/index.ts`; prompt construction is in `src/main/conversation.ts`.

## Acceptance criteria

- **AC1.** With no rectangle, the prompt names the topmost qualifying app window on the captured display and includes its bundle ID. It describes the app as observed at capture time.
- **AC2.** With a rectangle, the prompt names the app under the rectangle's center, even when another app window is higher elsewhere on the display. Its wording is limited to the center of the selection.
- **AC3.** If the overlay remains visible and the user switches the underlying app, the next message uses a fresh app observation. Perception's own windows never supply the app identity.
- **AC4.** If no app qualifies or lookup fails, the prompt omits the app claim and still sends the screenshot and user request.
- **AC5.** Display bounds and normalized rectangle coordinates select the correct window on the captured display, including a display with a nonzero origin. App data is bounded and cannot add new prompt instructions through line breaks or control characters.
- **AC6.** Development and packaged macOS builds include an executable lookup helper. Existing capture, annotation, cancellation, and cleanup checks still pass.

## Alternatives considered

- `NSWorkspace.frontmostApplication` reports the app receiving keyboard input. Once Perception focuses its composer, that is Perception, and it can differ from the app visible on the captured display.
- Remembering the last non-Perception app can become stale while the overlay remains open or when the visible window stack differs from keyboard focus.
- Inferring app identity from the screenshot alone does not provide the reliable OS context requested here.

## Risks and limits

- Window bounds and order are sampled near the screenshot, not atomically with it. A rapid window switch can make the two disagree. Keep the wording tied to capture time and omit context when lookup fails.
- A normal-layer filter can miss unusual floating windows or dialogs. The initial version favors a missing label over a confident but wrong one.
- A rectangle can cover multiple apps. Its center is the deterministic target; the prompt must never describe that app as owning the whole rectangle.
- Window screen coordinates and Electron display bounds must be checked on Retina and multi-display setups before shipping.
- The helper needs a macOS compiler at build time and must be unpacked from Electron's ASAR archive so the packaged app can execute it.

## Open questions

None for product behavior. The plan will verify the helper's coordinate system and packaging on the available macOS machine.
