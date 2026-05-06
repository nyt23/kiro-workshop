# Implementation Plan: Spinning Wheel

## Overview

Implement a single self-contained `index.html` file containing a prize wheel built with plain HTML, CSS, and vanilla JavaScript. The implementation follows the state machine and component design, with property-based tests (fast-check) covering the pure logic functions.

## Tasks

- [x] 1. Create the HTML skeleton and page structure
  - Create `index.html` with inline `<style>` and `<script>` blocks
  - Add `<canvas>` element with a fallback text message for unsupported browsers
  - Add the Spin button (`id="spinBtn"`, label "Spin") and winner display element (`id="winnerDisplay"`)
  - Add basic CSS: center the page content, size the canvas, style the button and winner text
  - _Requirements: 1.1, 1.2, 4.1_

- [x] 2. Implement data models and slot initialization
  - [x] 2.1 Define constants and application state variables
    - Hard-code `SLOTS` array with 8 participant names and 8 distinct colors
    - Define `FRICTION`, `STOP_THRESHOLD`, and `MIN_VELOCITY` constants
    - Declare `rotationAngle`, `velocity`, and `spinning` module-level variables
    - _Requirements: 2.3, 2.4, 5.1, 5.3_

  - [ ]* 2.2 Write property test for equal slot angles (Property 1)
    - **Property 1: Equal slot angles** — for any N in [6,12], each slot's angular size equals exactly `2π / N`
    - **Validates: Requirements 2.2**
    - Tag: `// Feature: spinning-wheel, Property 1: Equal slot angles`

  - [ ]* 2.3 Write property test for adjacent slot color distinctness (Property 2)
    - **Property 2: Adjacent slots have distinct colors** — for any N in [6,12], no two adjacent slots share the same color
    - **Validates: Requirements 2.4**
    - Tag: `// Feature: spinning-wheel, Property 2: Adjacent slots have distinct colors`

- [x] 3. Implement `getWinnerIndex` pure function
  - [x] 3.1 Implement `getWinnerIndex(rotationAngle, slotCount)`
    - Normalize `rotationAngle` to `[0, 2π)`
    - Divide the circle into `slotCount` equal wedges
    - Return the integer index of the wedge containing angle 0 (the arrow position)
    - _Requirements: 6.1_

  - [ ]* 3.2 Write property test for winner index validity (Property 3)
    - **Property 3: Winner index is always a valid slot** — for any finite float angle and N in [6,12], result is an integer in `[0, N-1]`
    - **Validates: Requirements 6.1**
    - Tag: `// Feature: spinning-wheel, Property 3: Winner index is always a valid slot`

  - [ ]* 3.3 Write property test for full-rotation stability (Property 4)
    - **Property 4: Winner index is stable under full-rotation offsets** — `getWinnerIndex(θ, N) === getWinnerIndex(θ + 2π*k, N)` for any θ, N, integer k
    - **Validates: Requirements 6.1**
    - Tag: `// Feature: spinning-wheel, Property 4: Winner index is stable under full-rotation offsets`

  - [ ]* 3.4 Write property test for slot reachability (Property 5)
    - **Property 5: Every slot is reachable** — for any N in [6,12] and index i in [0,N-1], there exists a θ such that `getWinnerIndex(θ, N) === i`
    - **Validates: Requirements 7.2**
    - Tag: `// Feature: spinning-wheel, Property 5: Every slot is reachable`

  - [ ]* 3.5 Write unit tests for `getWinnerIndex`
    - `getWinnerIndex(0, 8)` returns `0`
    - `getWinnerIndex(2π, 8)` returns `0`
    - `getWinnerIndex(π, 8)` returns `4`
    - _Requirements: 6.1_

- [x] 4. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement canvas rendering functions
  - [x] 5.1 Implement `drawWheel(ctx, cx, cy, radius, slots, rotationAngle)`
    - Iterate over slots, compute each wedge's start/end angle offset by `rotationAngle`
    - Fill each wedge with its assigned color
    - Draw participant name as centered text inside the wedge
    - _Requirements: 2.1, 2.2, 2.4, 2.5_

  - [x] 5.2 Implement `drawArrow(ctx, cx, cy, radius)`
    - Draw a filled triangle pointing left at `(cx + radius + gap, cy)`
    - Ensure the arrow visually overlaps the outer edge of the wheel
    - _Requirements: 3.1, 3.2, 3.3_

- [x] 6. Implement the animation loop and spin logic
  - [x] 6.1 Implement `animationLoop(timestamp)`
    - Apply deceleration: `velocity *= FRICTION` each frame
    - Accumulate `rotationAngle += velocity`
    - Stop when `velocity < STOP_THRESHOLD`
    - On stop: call `getWinnerIndex`, update winner display, re-enable button, set `spinning = false`
    - Redraw canvas each frame via `drawWheel` + `drawArrow`
    - _Requirements: 5.2, 6.1, 6.2, 6.3_

  - [x] 6.2 Implement `startSpin()`
    - Generate a random extra rotation using `Math.random()`
    - Set initial `velocity` using `MIN_VELOCITY` to guarantee ≥ 3 full rotations over ≥ 3 seconds
    - Transition to SPINNING state: disable button, clear winner display, set `spinning = true`
    - Kick off `animationLoop` via `requestAnimationFrame`
    - _Requirements: 4.2, 4.3, 4.4, 5.1, 5.3, 7.1_

  - [ ]* 6.3 Write property test for spin minimum rotation and duration (Property 7)
    - **Property 7: Spin meets minimum rotation and duration requirements** — simulate the animation loop at 60fps (16.67ms/frame); total accumulated rotation ≥ 6π AND elapsed time ≥ 3000ms
    - **Validates: Requirements 5.1, 5.3**
    - Tag: `// Feature: spinning-wheel, Property 7: Spin meets minimum rotation and duration requirements`

  - [ ]* 6.4 Write unit tests for spin state transitions
    - After `startSpin()`, button is disabled
    - After `startSpin()`, winner display is cleared
    - After spin completes, button is re-enabled
    - After spin completes, winner display shows `"Winner: [name]"`
    - _Requirements: 4.3, 4.4, 6.2, 6.3_

- [x] 7. Implement winner display and wire up DOM
  - [x] 7.1 Implement winner display update logic
    - When wheel stops, set winner display text to `"Winner: " + name`
    - _Requirements: 6.2_

  - [ ]* 7.2 Write property test for winner display text format (Property 6)
    - **Property 6: Winner display text format** — for any non-empty name string, winner display text equals `"Winner: " + name`
    - **Validates: Requirements 6.2**
    - Tag: `// Feature: spinning-wheel, Property 6: Winner display text format`

  - [x] 7.3 Wire up DOM on `DOMContentLoaded`
    - Grab canvas, button, and winner-display elements
    - Call `drawWheel` + `drawArrow` to render the initial state
    - Attach `startSpin` to the button's `click` event
    - _Requirements: 1.1, 4.1, 4.2_

- [x] 8. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- The test file should be a separate `tests.js` (or `tests.html`) that imports fast-check via a CDN script tag, keeping `index.html` free of test code
- Each property test is tagged with `// Feature: spinning-wheel, Property N: ...` for traceability
- `MIN_VELOCITY` must be computed so that the geometric series `v * FRICTION^n` sums to ≥ 6π before dropping below `STOP_THRESHOLD`, and the frame count × 16.67ms ≥ 3000ms
- The arrow is drawn every frame on top of the wheel so it always appears stationary
