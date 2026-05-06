# Design Document: Spinning Wheel

## Overview

A single self-contained HTML file that renders an interactive prize wheel in the browser. The user opens the file locally (no server required), sees a colorful wheel pre-populated with dummy names, clicks "Spin", watches the wheel decelerate to a stop, and reads the winner's name on screen.

The entire implementation lives in one `.html` file with inline `<style>` and `<script>` blocks. No build tools, no frameworks, no external requests.

---

## Architecture

Everything is contained in a single HTML file with three logical layers:

```
index.html
├── <style>   — layout and visual styling (minimal, no fancy CSS)
├── <canvas>  — wheel rendering via 2D Canvas API
└── <script>  — application logic (state machine + animation loop)
```

### Rendering approach

The wheel is drawn on an HTML `<canvas>` element using the 2D Canvas API. Each animation frame redraws the entire canvas at the current rotation angle. `requestAnimationFrame` drives the loop; no `setInterval` or `setTimeout` is used for animation.

### State machine

The application has three states:

```
IDLE  ──[click Spin]──►  SPINNING  ──[velocity reaches 0]──►  STOPPED
 ▲                                                                │
 └──────────────────────[click Spin]──────────────────────────────┘
```

| State    | Spin button | Winner display        |
|----------|-------------|-----------------------|
| IDLE     | enabled     | empty or prior result |
| SPINNING | disabled    | cleared               |
| STOPPED  | enabled     | "Winner: [name]"      |

---

## Components and Interfaces

### 1. Wheel renderer (`drawWheel`)

Draws the wheel onto the canvas at a given rotation angle.

```
drawWheel(ctx, cx, cy, radius, slots, rotationAngle)
```

- Iterates over `slots`, computing each wedge's start/end angle offset by `rotationAngle`.
- Fills each wedge with its assigned color.
- Draws the participant name as centered text inside the wedge.
- Called once per animation frame while spinning, and once on page load.

### 2. Arrow renderer (`drawArrow`)

Draws the fixed pointer at the right edge of the wheel.

```
drawArrow(ctx, cx, cy, radius)
```

- Draws a filled triangle pointing left, positioned at `(cx + radius + gap, cy)`.
- Called every frame alongside `drawWheel` so the arrow always appears on top.

### 3. Animation loop (`animationLoop`)

Drives the spin animation using `requestAnimationFrame`.

```
animationLoop(timestamp)
```

- Applies deceleration: `velocity *= FRICTION` each frame.
- Accumulates `rotationAngle += velocity`.
- Stops when `velocity < STOP_THRESHOLD`.
- On stop: computes winner, updates `Winner_Display`, re-enables button.

### 4. Spin initiator (`startSpin`)

Called when the user clicks the Spin button.

```
startSpin()
```

- Generates a random target extra rotation (pseudo-random via `Math.random()`).
- Sets initial `velocity` high enough to guarantee ≥ 3 full rotations over ≥ 3 seconds.
- Transitions state to SPINNING.
- Clears winner display.
- Disables Spin button.
- Kicks off `animationLoop`.

### 5. Winner calculator (`getWinnerIndex`)

Pure function — determines which slot is under the arrow when the wheel stops.

```
getWinnerIndex(rotationAngle, slotCount) → index
```

- The arrow points at angle 0 (rightmost point, 3 o'clock position).
- Normalizes `rotationAngle` to `[0, 2π)`.
- Divides the circle into `slotCount` equal wedges.
- Returns the index of the wedge that contains angle 0.

### 6. DOM wiring

On `DOMContentLoaded`:
- Grabs canvas, button, and winner-display elements.
- Calls `drawWheel` + `drawArrow` to render the initial state.
- Attaches `startSpin` to the button's `click` event.

---

## Data Models

### Slot

```js
{
  name:  string,   // participant name
  color: string    // CSS color string, e.g. "#e74c3c"
}
```

### Application state (module-level variables)

```js
const SLOTS = [/* array of Slot objects, fixed at page load */];

let rotationAngle = 0;   // current rotation in radians
let velocity      = 0;   // radians per frame
let spinning      = false;
```

### Constants

```js
const FRICTION       = 0.985;   // velocity multiplier per frame (< 1)
const STOP_THRESHOLD = 0.001;   // radians/frame below which we consider stopped
const MIN_VELOCITY   = /* computed so wheel spins ≥ 3 full rotations in ≥ 3 s */;
```

### Dummy participant names (pre-populated)

Eight names are hard-coded at page load (satisfies the 6–12 requirement):

```js
["Alice", "Bob", "Carol", "Dave", "Eve", "Frank", "Grace", "Hank"]
```

### Color palette

Eight distinct colors assigned round-robin to slots:

```js
["#e74c3c","#e67e22","#f1c40f","#2ecc71","#1abc9c","#3498db","#9b59b6","#e91e63"]
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Equal slot angles

*For any* slot count `N` between 6 and 12, each slot's angular size SHALL equal exactly `2π / N` radians, so that all slots are equal-sized.

**Validates: Requirements 2.2**

### Property 2: Adjacent slots have distinct colors

*For any* slot count `N` between 6 and 12, no two adjacent slots in the generated slot array SHALL share the same color value.

**Validates: Requirements 2.4**

### Property 3: Winner index is always a valid slot

*For any* rotation angle (any finite float) and any slot count `N` between 6 and 12, `getWinnerIndex(angle, N)` SHALL return an integer in the range `[0, N - 1]`.

**Validates: Requirements 6.1**

### Property 4: Winner index is stable under full-rotation offsets

*For any* rotation angle `θ`, slot count `N`, and integer `k`, `getWinnerIndex(θ, N)` SHALL equal `getWinnerIndex(θ + 2π * k, N)`. Adding any number of full rotations does not change which slot is selected.

**Validates: Requirements 6.1**

### Property 5: Every slot is reachable

*For any* slot count `N` between 6 and 12 and any index `i` in `[0, N - 1]`, there EXISTS a rotation angle `θ` such that `getWinnerIndex(θ, N) === i`. No slot is permanently unreachable.

**Validates: Requirements 7.2**

### Property 6: Winner display text format

*For any* participant name string `name`, when the wheel stops on that participant's slot, the winner display text SHALL equal `"Winner: " + name`.

**Validates: Requirements 6.2**

### Property 7: Spin meets minimum rotation and duration requirements

*For any* spin initiated via `startSpin`, simulating the animation loop to completion SHALL produce a total accumulated rotation of at least `6π` radians (3 full rotations) AND an elapsed time of at least 3000 milliseconds.

**Validates: Requirements 5.1, 5.3**

---

## Error Handling

This is a client-side, zero-dependency application with no network calls or user-supplied data. Error surface is minimal:

| Scenario | Handling |
|---|---|
| Canvas not supported | The `<canvas>` element falls back to a text message: "Your browser does not support canvas." |
| `Math.random()` returns 0 | The minimum velocity constant ensures ≥ 3 rotations regardless; a zero random offset still produces a valid spin. |
| Spin button double-click | Button is disabled immediately on first click; subsequent clicks are ignored until the wheel stops. |

No try/catch blocks are needed for normal operation. The application has no async I/O, no JSON parsing, and no external APIs.

---

## Testing Strategy

### Unit tests (example-based)

Focus on the pure logic functions that can be tested without a browser:

| Test | What it verifies |
|---|---|
| `getWinnerIndex(0, 8)` returns `0` | Arrow at 0 rad points to first slot |
| `getWinnerIndex(2π, 8)` returns `0` | Full rotation wraps correctly |
| `getWinnerIndex(π, 8)` returns `4` | Opposite side maps to correct slot |
| After `startSpin()`, button is disabled | Requirement 4.3 |
| After spin completes, button is re-enabled | Requirement 6.3 |
| After `startSpin()`, winner display is empty | Requirement 4.4 |
| Winner display shows `"Winner: Alice"` when slot 0 wins | Requirement 6.2 |

### Property-based tests

The pure functions (`getWinnerIndex`, slot angle computation, color assignment) and the animation loop constants are well-suited for property-based testing. Use **fast-check** (JavaScript PBT library) with a minimum of 100 iterations per property.

Each test is tagged with the corresponding design property using the format:
`// Feature: spinning-wheel, Property {N}: {property_text}`

| Property | Generator inputs | What is verified |
|---|---|---|
| **Property 1** | `N` in [6,12] | Each slot angle === `2π / N` |
| **Property 2** | `N` in [6,12] | No two adjacent slots share the same color |
| **Property 3** | `angle` (any float), `N` in [6,12] | Result is integer in `[0, N-1]` |
| **Property 4** | `θ` (float), `N` in [6,12], `k` (integer) | `getWinnerIndex(θ, N) === getWinnerIndex(θ + 2π*k, N)` |
| **Property 5** | `N` in [6,12], `i` in [0,N-1] | There exists `θ` such that `getWinnerIndex(θ, N) === i` |
| **Property 6** | `name` (any non-empty string) | Winner display text === `"Winner: " + name` |
| **Property 7** | (fixed constants) | Simulated loop: total rotation ≥ 6π AND elapsed ≥ 3000ms |

Property 7 simulates the `animationLoop` with a fixed 60fps frame budget (16.67ms/frame) rather than relying on `requestAnimationFrame`, making it deterministic and fast.

### Manual smoke test checklist

- [ ] Page loads with wheel visible and button enabled
- [ ] Clicking Spin disables the button and clears any prior winner
- [ ] Wheel visibly decelerates and stops
- [ ] Winner name appears after stop
- [ ] Button re-enables after stop
- [ ] Multiple consecutive spins work correctly
- [ ] Arrow remains stationary throughout spin
- [ ] No external network requests (check browser DevTools Network tab)
