# Implementation Plan: Spinning Wheel

## Overview

Implement the full spinning-wheel system: a presenter wheel page (`index.html`) with real-time self-registration via QR code, a participant registration page (`register.html`), two Lambda functions, two DynamoDB tables, a REST API, and a WebSocket API — all defined in a single AWS SAM template. The basic wheel rendering and animation are already complete; this plan covers the backend infrastructure, real-time integration, and updated tests.

## Tasks

- [x] 1. Create the HTML skeleton and page structure
  - Created `index.html` with inline `<style>` and `<script>` blocks
  - Added `<canvas>` element with fallback text for unsupported browsers
  - Added Spin button (`id="spinBtn"`) and winner display element (`id="winnerDisplay"`)
  - Added basic CSS: centered layout, canvas sizing, button and winner text styles
  - _Requirements: 1.1, 1.2, 4.1_

- [x] 2. Implement data models and slot initialization
  - [x] 2.1 Define constants and application state variables
    - Hard-coded `SLOTS` array with participant names and colors
    - Defined `FRICTION`, `STOP_THRESHOLD`, and `MIN_VELOCITY` constants
    - Declared `rotationAngle`, `velocity`, and `spinning` module-level variables
    - _Requirements: 2.3, 2.4, 5.1, 5.3_

  - [x]* 2.2 Write property test for equal slot angles (Property 1)
    - **Property 1: Equal slot angles** — for any N ≥ 1, each slot's angular size equals exactly `2π / N`
    - **Validates: Requirements 2.2**

  - [x]* 2.3 Write property test for adjacent slot color distinctness (Property 2)
    - **Property 2: Adjacent slots have distinct colors** — for any N ≥ 2, no two adjacent slots share the same color
    - **Validates: Requirements 2.4**

- [x] 3. Implement `getWinnerIndex` pure function
  - [x] 3.1 Implement `getWinnerIndex(rotationAngle, slotCount)`
    - Normalizes `rotationAngle` to `[0, 2π)`
    - Divides the circle into `slotCount` equal wedges
    - Returns the integer index of the wedge under the arrow
    - _Requirements: 6.1_

  - [x]* 3.2 Write property test for winner index validity (Property 3)
    - **Property 3: Winner index is always a valid slot**
    - **Validates: Requirements 6.1**

  - [x]* 3.3 Write property test for full-rotation stability (Property 4)
    - **Property 4: Winner index is stable under full-rotation offsets**
    - **Validates: Requirements 6.1**

  - [x]* 3.4 Write property test for slot reachability (Property 5)
    - **Property 5: Every slot is reachable**
    - **Validates: Requirements 7.2**

  - [x]* 3.5 Write unit tests for `getWinnerIndex`
    - `getWinnerIndex(0, 8)` returns `0`; `getWinnerIndex(2π, 8)` returns `0`; `getWinnerIndex(π, 8)` returns `4`
    - _Requirements: 6.1_

- [x] 4. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement canvas rendering functions
  - [x] 5.1 Implement `drawWheel(ctx, cx, cy, radius, slots, rotationAngle)`
    - Iterates over slots, computes each wedge's start/end angle offset by `rotationAngle`
    - Fills each wedge with its assigned color; draws participant name as centered text
    - _Requirements: 2.1, 2.2, 2.4, 2.5_

  - [x] 5.2 Implement `drawArrow(ctx, cx, cy, radius)`
    - Draws a filled triangle at the right edge of the wheel pointing toward center
    - _Requirements: 3.1, 3.2, 3.3_

- [x] 6. Implement the animation loop and spin logic
  - [x] 6.1 Implement `animationLoop(timestamp)`
    - Applies deceleration (`velocity *= FRICTION`) each frame
    - Accumulates `rotationAngle += velocity`; stops when `velocity < STOP_THRESHOLD`
    - On stop: calls `getWinnerIndex`, updates winner display, re-enables button
    - _Requirements: 5.2, 6.1, 6.2, 6.3_

  - [x] 6.2 Implement `startSpin()`
    - Generates random extra rotation; sets initial `velocity` using `MIN_VELOCITY`
    - Disables button, clears winner display, sets `spinning = true`, kicks off `animationLoop`
    - _Requirements: 4.2, 4.3, 4.4, 5.1, 5.3, 7.1_

  - [x]* 6.3 Write property test for spin minimum rotation and duration (Property 7)
    - **Property 7: Spin meets minimum rotation and duration requirements**
    - **Validates: Requirements 5.1, 5.3**

  - [x]* 6.4 Write unit tests for spin state transitions
    - After `startSpin()`, button is disabled and winner display is cleared
    - After spin completes, button is re-enabled and winner display shows `"Winner: [name]"`
    - _Requirements: 4.3, 4.4, 6.2, 6.3_

- [x] 7. Implement winner display and wire up DOM
  - [x] 7.1 Implement winner display update logic
    - When wheel stops, sets winner display text to `"Winner: " + name`
    - _Requirements: 6.2_

  - [x]* 7.2 Write property test for winner display text format (Property 6)
    - **Property 6: Winner display text format** — for any non-empty name, display equals `"Winner: " + name`
    - **Validates: Requirements 6.2**

  - [x] 7.3 Wire up DOM on `DOMContentLoaded`
    - Grabs canvas, button, and winner-display elements; renders initial state; attaches `startSpin` to button click
    - _Requirements: 1.1, 4.1, 4.2_

- [x] 8. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

---

- [x] 9. Create SAM template (`template.yaml`)
  - [x] 9.1 Define DynamoDB tables with TTL and GSI
    - Create `ConnectionsTable` with partition key `connectionId`, GSI `sessionId-index` on `sessionId`, TTL on `ttl` attribute
    - Create `RegistrationsTable` with partition key `sessionId`, sort key `name`, TTL on `ttl` attribute
    - Both tables use `BillingMode: PAY_PER_REQUEST`
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8, 17.5, 17.6, 18.3, 18.4_

  - [x] 9.2 Define Lambda functions and REST API
    - Define `RegistrationFunction` (handler: `registrationHandler.handler`, runtime: `nodejs20.x`, timeout: 10s)
    - Attach `POST /register` and `DELETE /register` routes via `HttpApi` event type
    - Define `RestApi` as `AWS::Serverless::HttpApi`
    - Grant `RegistrationFunction` `DynamoDBCrudPolicy` on both tables
    - _Requirements: 10.1, 10.5, 17.1, 17.3, 17.7_

  - [x] 9.3 Define WebSocket API and Lambda
    - Define `WebSocketApi` as `AWS::ApiGatewayV2::Api` with `ProtocolType: WEBSOCKET` and `RouteSelectionExpression: "$request.body.action"`
    - Define `WebSocketFunction` (handler: `websocketHandler.handler`)
    - Create `$connect`, `$disconnect`, and `message` routes with Lambda integrations
    - Create WebSocket stage (`prod`) and deployment; add Lambda invoke permissions for each route
    - Grant `WebSocketFunction` `DynamoDBCrudPolicy` on `ConnectionsTable`
    - _Requirements: 11.1, 17.2, 17.4, 17.8_

  - [x] 9.4 Add Globals, environment variables, and Outputs
    - Set `Globals.Function` with `Runtime`, `Timeout`, and environment variables: `CONNECTIONS_TABLE`, `REGISTRATIONS_TABLE`, `WEBSOCKET_ENDPOINT`
    - Add `Outputs` for `RestApiUrl` and `WebSocketUrl`
    - _Requirements: 17.9_

- [x] 10. Implement `registrationHandler` Lambda (`lambdas/registrationHandler.js`)
  - [x] 10.1 Implement `POST /register` route
    - Parse and validate request body; return HTTP 400 if `sessionId` or `name` is missing or empty (trim whitespace)
    - Write `{ sessionId, name, ttl }` to `RegistrationsTable` using `PutItem`; set `ttl = floor(Date.now()/1000) + 86400`
    - Return HTTP 200 `{ message: "Registered" }` on success; HTTP 500 on DynamoDB error
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.8, 18.2_

  - [x] 10.2 Implement `DELETE /register` route (single and all)
    - If `name` is present: delete single record `{ sessionId, name }` from `RegistrationsTable`; broadcast `participantRemoved`
    - If `name` is absent: query all records for `sessionId`; delete each; broadcast `participantRemoved` for each
    - Return HTTP 200 `{ message: "Removed" }` on success; HTTP 500 on error
    - _Requirements: 10.5, 10.6, 10.7, 10.8_

  - [x] 10.3 Implement `broadcastToSession(sessionId, message)` helper
    - Query `ConnectionsTable` GSI `sessionId-index` for all connections with the given `sessionId`
    - Call `ApiGatewayManagementApi.postToConnection` for each connection ID
    - On `GoneException` (HTTP 410): delete the stale record from `ConnectionsTable` and continue
    - _Requirements: 11.4, 11.5, 11.7, 11.8, 13.3_

  - [ ]* 10.4 Write property tests for registrationHandler (Properties 10–13)
    - **Property 10: Empty and whitespace names are rejected** — handler returns 400; no DynamoDB write
    - **Property 11: Valid registration writes record and returns 200**
    - **Property 12: Single-participant delete removes record and returns 200**
    - **Property 13: Clear-all delete removes all session records and returns 200**
    - Use in-memory DynamoDB mock; no AWS dependencies
    - **Validates: Requirements 10.2, 10.3, 10.6, 10.7**

  - [ ]* 10.5 Write unit tests for registrationHandler
    - Returns 400 for missing `sessionId`; returns 400 for missing `name`; returns 500 on DynamoDB error
    - Broadcast is called with correct message shape after successful write
    - _Requirements: 10.3, 10.4, 10.8, 11.4, 11.5_

- [x] 11. Implement `websocketHandler` Lambda (`lambdas/websocketHandler.js`)
  - [x] 11.1 Implement `$connect` route
    - Extract `connectionId` from `event.requestContext.connectionId` and `sessionId` from query string
    - Write `{ connectionId, sessionId, ttl }` to `ConnectionsTable`; set `ttl = floor(Date.now()/1000) + 86400`
    - Return HTTP 200
    - _Requirements: 11.2, 12.1, 12.2, 18.1_

  - [x] 11.2 Implement `$disconnect` route
    - Delete the record with `connectionId` from `ConnectionsTable`
    - Return HTTP 200
    - _Requirements: 11.3_

  - [x] 11.3 Implement `message` route (action: `winner`)
    - Parse `sessionId` and `name` from the message body
    - Call `broadcastToSession(sessionId, { type: "winner", name })` (reuse or import the same helper pattern as `registrationHandler`)
    - Return HTTP 200
    - _Requirements: 11.6, 11.7_

  - [ ]* 11.4 Write property tests for websocketHandler (Properties 14–15)
    - **Property 14: WebSocket connect stores connection record** — connect handler writes `{ connectionId, sessionId, ttl }` to mock
    - **Property 15: WebSocket disconnect removes connection record** — connect then disconnect leaves no record in mock
    - **Validates: Requirements 11.2, 11.3, 12.1, 12.2_**

  - [ ]* 11.5 Write property tests for broadcast behavior (Properties 16–17, 19)
    - **Property 16: Broadcast completeness** — all session connections receive the event; stale connections removed without aborting
    - **Property 17: Session isolation** — broadcast for session A reaches only session A's connections
    - **Property 19: TTL is set correctly on all DynamoDB writes** — `ttl` equals `floor(Date.now()/1000) + 86400` (±2s)
    - **Validates: Requirements 11.4, 11.5, 11.7, 11.8, 13.2, 13.3, 18.1, 18.2**

- [x] 12. Checkpoint — Ensure all Lambda tests pass
  - Ensure all Lambda unit and property tests pass, ask the user if questions arise.

- [x] 13. Update `index.html` for real-time self-registration
  - [x] 13.1 Add `config.js` reference and session ID logic
    - Add `<script src="config.js"></script>` (or inline constants) for `REST_API_URL` and `WEBSOCKET_URL`
    - Implement `generateSessionId()` using `crypto.randomUUID()` with UUID v4 polyfill fallback
    - Implement `getSessionId()`: reads `sessionId` from `window.location.search`; calls `generateSessionId()` if absent; updates URL via `history.replaceState`
    - Implement `buildRegistrationUrl(sessionId)`: returns full URL for `register.html?sessionId=...`
    - _Requirements: 1.3, 8.2, 8.3, 13.1_

  - [x] 13.2 Replace hardcoded SLOTS with dynamic `participants` array
    - Remove hardcoded `SLOTS` array; introduce `let participants = []` (string array)
    - Update `drawWheel` to accept `slots` derived from `participants` (map names to `{ name, color }` using round-robin palette)
    - Add placeholder slot `[{ name: "No participants", color: "#cccccc" }]` when `participants` is empty
    - Update `startSpin()` to disable the Spin button when `participants.length < 2`
    - _Requirements: 2.3, 4.5, 14.1, 14.2, 14.3_

  - [x] 13.3 Add QR code rendering
    - Add `<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>`
    - Add a `<div id="qrcode"></div>` element adjacent to the canvas
    - Implement `renderQRCode(url)`: calls `new QRCode(...)` to render into `#qrcode`
    - Call `renderQRCode(buildRegistrationUrl(sessionId))` on `DOMContentLoaded`
    - _Requirements: 8.1, 8.2, 8.4_

  - [x] 13.4 Implement WebSocket connection and participant event handling
    - Implement `connectWebSocket(sessionId)`: opens WebSocket to `WEBSOCKET_URL?sessionId=...`; handles `participantAdded`, `participantRemoved`, and `winner` message types
    - Implement `applyParticipantEvent(event)`: adds or removes name from `participants` array and redraws wheel
    - Implement event queue: while `spinning === true`, push incoming participant events to `eventQueue`; drain queue after spin stops in `animationLoop`
    - Display error banner if WebSocket connection fails; continue in offline mode
    - _Requirements: 1.4, 1.5, 11.1, 14.1, 14.2, 14.3, 14.4_

  - [x] 13.5 Add winner broadcast and Clear button
    - After spin stops and winner is determined, send `{ action: "winner", sessionId, name }` over WebSocket
    - Add `<button id="clearBtn">Clear</button>` to the page
    - Implement `clearParticipants()`: calls `DELETE /register` with `{ sessionId }`; on success, empties `participants` and redraws; on failure, displays error message
    - Disable Clear button while wheel is spinning; re-enable when stopped
    - _Requirements: 11.6, 15.1, 16.1, 16.2, 16.3, 16.4, 16.5_

  - [x] 13.6 Load existing participants from REST API on page load
    - On `DOMContentLoaded`, call `GET /register?sessionId=...` (or `POST` equivalent per API design) to fetch existing participants for the session and populate `participants` array before first render
    - _Requirements: 14.1_

- [x] 14. Build `register.html` — participant registration page
  - [x] 14.1 Create page structure and form
    - Create `register.html` with inline CSS and JS; viewport-responsive layout for mobile
    - Add name text input, submit button, and placeholder elements for confirmation, error, and winner notification messages
    - Read `sessionId` from URL query parameter; if absent, display error: "Invalid registration link. Please scan the QR code again."
    - _Requirements: 9.1, 9.2, 9.3, 13.4_

  - [x] 14.2 Implement registration form submission
    - On submit: validate name is non-empty (trim whitespace); display validation error and abort if empty
    - Call `POST /register` with `{ sessionId, name }`
    - On HTTP 200: display confirmation ("You're on the wheel!"); disable submit button; store `myName` in memory; connect WebSocket
    - On HTTP 400: display validation error; keep form enabled for retry
    - On HTTP 500 or network error: display generic error; keep form enabled for retry
    - _Requirements: 9.4, 9.5, 9.6, 9.7_

  - [x] 14.3 Implement WebSocket connection and winner notification
    - Implement `connectWebSocket(sessionId)`: opens WebSocket to `WEBSOCKET_URL?sessionId=...`; listens for `winner` events
    - Implement `handleWinnerEvent(winnerName, myName)`: displays "🎉 You won!" if `winnerName === myName`; otherwise displays "The winner is: [winnerName]"
    - If WebSocket connection fails, display error; registration confirmation remains visible
    - _Requirements: 15.2, 15.3, 15.4_

- [x] 15. Create `config.js` with API endpoint constants
  - Create `config.js` (or document inline injection pattern) that exports `REST_API_URL` and `WEBSOCKET_URL`
  - These values are populated from SAM `Outputs` after deployment (e.g., via `sam deploy` output or a post-deploy script)
  - Both `index.html` and `register.html` load this file via `<script src="config.js"></script>`
  - _Requirements: 17.9_

- [x] 16. Checkpoint — Ensure all front-end tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 17. Update `tests.html` with new property and unit tests
  - [x] 17.1 Add unit tests for new pure functions
    - `buildRegistrationUrl("abc")` URL contains `sessionId=abc`
    - `getSessionId()` with no param returns a UUID v4 format string
    - `handleWinnerEvent("Alice", "Alice")` returns/shows celebration message
    - `handleWinnerEvent("Alice", "Bob")` returns/shows winner name announcement
    - _Requirements: 8.2, 1.3, 15.2, 15.3_

  - [ ]* 17.2 Write property tests for session ID and registration URL (Properties 8–9)
    - **Property 8: Session ID URL parsing round-trip** — `getSessionId()` round-trips a UUID v4; absent param yields UUID v4 format
    - **Property 9: Registration URL contains session ID** — `buildRegistrationUrl(id)` URL's `sessionId` param equals `id`
    - **Validates: Requirements 1.3, 8.2, 13.1**

  - [ ]* 17.3 Write property tests for registrationHandler (Properties 10–13)
    - **Property 10: Empty and whitespace names are rejected**
    - **Property 11: Valid registration writes record and returns 200**
    - **Property 12: Single-participant delete removes record and returns 200**
    - **Property 13: Clear-all delete removes all session records and returns 200**
    - Use in-memory DynamoDB mock
    - **Validates: Requirements 10.2, 10.3, 10.6, 10.7**

  - [ ]* 17.4 Write property tests for websocketHandler (Properties 14–17, 19)
    - **Property 14: WebSocket connect stores connection record**
    - **Property 15: WebSocket disconnect removes connection record**
    - **Property 16: Broadcast completeness — all session connections receive the event**
    - **Property 17: Session isolation — events never cross session boundaries**
    - **Property 19: TTL is set correctly on all DynamoDB writes**
    - Use in-memory DynamoDB mock
    - **Validates: Requirements 11.2, 11.3, 11.4, 11.5, 11.7, 11.8, 13.2, 13.3, 18.1, 18.2**

  - [ ]* 17.5 Write property test for event queue (Property 18)
    - **Property 18: Event queue preserves all events during spin** — any sequence of add/remove events received while spinning is applied in order after spin completes; no drops or duplicates
    - **Validates: Requirements 14.4**

  - [ ]* 17.6 Write property test for registration idempotency (Property 20)
    - **Property 20: Registration idempotency** — two identical `POST /register` calls result in exactly one record in mock DynamoDB
    - **Validates: Requirements 10.2, 13.2**

- [x] 18. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Tasks 1–8 are already complete (basic wheel rendering and animation in `index.html`, property tests 3–5 in `tests.html`)
- Lambda handlers live in `lambdas/registrationHandler.js` and `lambdas/websocketHandler.js`
- `config.js` is generated post-deploy from SAM `Outputs`; during local development, create it manually with placeholder URLs
- Property tests use **fast-check** loaded via CDN script tag; Lambda tests use an in-memory DynamoDB mock to avoid AWS dependencies
- Each property test is tagged `// Feature: spinning-wheel, Property N: ...` for traceability
- The `MIN_VELOCITY` constant must ensure the geometric series sums to ≥ 6π before dropping below `STOP_THRESHOLD`, and frame count × 16.67ms ≥ 3000ms
- The arrow is drawn every frame on top of the wheel so it always appears stationary
- To begin executing tasks, open this file and click "Start task" next to any unchecked item
