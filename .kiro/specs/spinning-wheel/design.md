# Design Document: Spinning Wheel

## Overview

A real-time self-registration prize wheel system built with plain HTML, CSS, and vanilla JavaScript on the front end, backed by AWS serverless infrastructure. Participants scan a QR code on the presenter's screen, open a mobile-friendly registration page, and enter their name. Names appear on the wheel in real time via WebSocket. The presenter spins the wheel; it decelerates to a stop, the winner is announced on screen, and a winner notification is broadcast to all connected participants.

The system consists of two HTML pages, two Lambda functions, two DynamoDB tables, a REST API, and a WebSocket API — all defined in a single AWS SAM template.

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser (Presenter)          Browser (Participant)             │
│  index.html                   register.html                     │
│  - Wheel canvas               - Name input form                 │
│  - QR code                    - Winner notification             │
│  - Spin / Clear buttons       - WebSocket listener              │
│  - WebSocket client           - REST API caller                 │
└────────┬──────────────────────────────┬────────────────────────┘
         │ WebSocket                    │ REST + WebSocket
         ▼                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  AWS (SAM-deployed)                                             │
│                                                                 │
│  API Gateway HTTP API          API Gateway WebSocket API        │
│  POST /register                $connect                         │
│  DELETE /register              $disconnect                      │
│         │                      message (winner route)           │
│         ▼                              │                        │
│  registrationHandler λ         websocketHandler λ              │
│         │                              │                        │
│         └──────────┬───────────────────┘                       │
│                    ▼                                            │
│  DynamoDB: Connections_Table + Registrations_Table              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Architecture

### Pages

**`index.html` — Presenter wheel page**
- Reads `sessionId` from the URL query parameter; generates a UUID v4 if absent.
- Renders the wheel on a `<canvas>` element.
- Displays a QR code (generated client-side via `qrcode.js` CDN) encoding the registration URL with the session ID.
- Establishes a WebSocket connection to the WebSocket API on load.
- Maintains a local `participants` array; redraws the wheel on every change.
- Queues `participantAdded`/`participantRemoved` events received during an active spin and applies them after the spin completes.
- On spin stop: sends a `winner` message over WebSocket.
- Provides a Clear button that calls `DELETE /register` with only the session ID.

**`register.html` — Participant registration page**
- Reads `sessionId` exclusively from the URL query parameter (never generates one).
- Displays a mobile-friendly name input form.
- On submit: calls `POST /register` with the name and session ID.
- After successful registration: establishes a WebSocket connection and listens for `winner` events.
- Displays a celebration message if the winner matches the participant's name, or the winner's name otherwise.

### Backend (SAM-deployed)

**REST API** — API Gateway HTTP API
- `POST /register` → `registrationHandler`
- `DELETE /register` → `registrationHandler`

**WebSocket API** — API Gateway WebSocket API
- `$connect` → `websocketHandler`
- `$disconnect` → `websocketHandler`
- `message` route (action: `winner`) → `websocketHandler`

**Lambda functions** — Node.js runtime, located in `lambdas/` directory
- `registrationHandler` — handles registration and removal; broadcasts participant events
- `websocketHandler` — manages connections; broadcasts winner events

**DynamoDB tables**
- `Connections` — tracks active WebSocket connections per session
- `Registrations` — stores participant names per session

### Session isolation

Every resource (DynamoDB records, WebSocket broadcasts) is scoped to a `sessionId`. The presenter's `index.html` generates the session ID; participants receive it via the QR code URL. No cross-session data leakage is possible because all queries and broadcasts filter by `sessionId`.

---

## Components and Interfaces

### Front-end components (index.html)

#### `generateSessionId()`
Generates a UUID v4 string using `crypto.randomUUID()` (or a polyfill for older browsers).

```js
generateSessionId() → string  // e.g. "a1b2c3d4-..."
```

#### `getSessionId()`
Reads `sessionId` from `window.location.search`; calls `generateSessionId()` if absent and updates the URL via `history.replaceState`.

```js
getSessionId() → string
```

#### `buildRegistrationUrl(sessionId)`
Returns the full URL for `register.html` including the session ID query parameter.

```js
buildRegistrationUrl(sessionId) → string
// e.g. "https://example.com/register.html?sessionId=a1b2c3d4-..."
```

#### `renderQRCode(url)`
Calls the `qrcode.js` library to render a QR code into the designated `<div>` element.

```js
renderQRCode(url) → void
```

#### `drawWheel(ctx, cx, cy, radius, slots, rotationAngle)`
Draws the wheel onto the canvas at the given rotation angle. Handles the placeholder state when `slots` is empty.

```js
drawWheel(ctx, cx, cy, radius, slots, rotationAngle) → void
```

#### `drawArrow(ctx, cx, cy, radius)`
Draws the fixed pointer at the right edge of the wheel.

```js
drawArrow(ctx, cx, cy, radius) → void
```

#### `animationLoop(timestamp)`
Drives the spin animation via `requestAnimationFrame`. Applies deceleration, accumulates rotation, detects stop, computes winner, sends winner WebSocket message, applies queued participant events.

#### `startSpin()`
Validates ≥ 2 participants, generates random target rotation, sets initial velocity, transitions to SPINNING state.

#### `getWinnerIndex(rotationAngle, slotCount) → number`
Pure function. Normalizes angle to `[0, 2π)` and returns the index of the slot under the arrow.

#### `connectWebSocket(sessionId)`
Opens a WebSocket connection to the WebSocket API URL (injected at deploy time). Handles `participantAdded`, `participantRemoved`, and `winner` messages.

#### `applyParticipantEvent(event)`
Applies a single `participantAdded` or `participantRemoved` event to the `participants` array and redraws the wheel.

#### `clearParticipants()`
Calls `DELETE /register` with the session ID; on success, empties the `participants` array and redraws.

### Front-end components (register.html)

#### `getSessionIdFromUrl()`
Reads `sessionId` from the URL query parameter. Returns `null` if absent (page shows an error).

#### `submitRegistration(name, sessionId)`
Calls `POST /register`. On success, stores the participant's name in memory and connects the WebSocket.

#### `connectWebSocket(sessionId)`
Opens a WebSocket connection. Listens for `winner` events and calls `handleWinnerEvent`.

#### `handleWinnerEvent(winnerName, myName)`
Displays "🎉 You won!" if `winnerName === myName`, otherwise displays "The winner is: [winnerName]".

### Lambda: `registrationHandler`

Entry point: `lambdas/registrationHandler.js`, exported as `handler`.

| Route | Action |
|---|---|
| `POST /register` | Validate body; write to Registrations table; broadcast `participantAdded` to all session connections |
| `DELETE /register` (with name) | Delete single record; broadcast `participantRemoved` |
| `DELETE /register` (no name) | Query all records for session; delete each; broadcast `participantRemoved` for each |

Broadcast helper: `broadcastToSession(sessionId, message)` — queries the Connections GSI for all connections with the given `sessionId`, calls `ApiGatewayManagementApi.postToConnection` for each, removes stale connections on `GoneException`.

### Lambda: `websocketHandler`

Entry point: `lambdas/websocketHandler.js`, exported as `handler`.

| Route | Action |
|---|---|
| `$connect` | Write `{ connectionId, sessionId, ttl }` to Connections table |
| `$disconnect` | Delete connection record from Connections table |
| `message` (action: `winner`) | Call `broadcastToSession(sessionId, { type: "winner", name })` |

---

## Data Models

### DynamoDB: Connections table

| Attribute | Type | Role |
|---|---|---|
| `connectionId` | String | Partition key |
| `sessionId` | String | GSI partition key (`sessionId-index`) |
| `ttl` | Number | TTL attribute (Unix timestamp, now + 86400s) |

GSI: `sessionId-index` — partition key `sessionId`, no sort key. Used by `broadcastToSession` to find all connections for a session.

### DynamoDB: Registrations table

| Attribute | Type | Role |
|---|---|---|
| `sessionId` | String | Partition key |
| `name` | String | Sort key |
| `ttl` | Number | TTL attribute (Unix timestamp, now + 86400s) |

### WebSocket message protocol

**Client → Server** (sent by `index.html` after spin stops):
```json
{ "action": "winner", "sessionId": "...", "name": "Alice" }
```

**Server → Client** (broadcast by Lambda to all connections in session):
```json
{ "type": "participantAdded",   "name": "Alice" }
{ "type": "participantRemoved", "name": "Alice" }
{ "type": "winner",             "name": "Alice" }
```

### REST API request/response

**POST /register**
```json
// Request body
{ "sessionId": "...", "name": "Alice" }

// Success: HTTP 200
{ "message": "Registered" }

// Error: HTTP 400
{ "error": "name is required" }
```

**DELETE /register**
```json
// Request body (remove one)
{ "sessionId": "...", "name": "Alice" }

// Request body (remove all)
{ "sessionId": "..." }

// Success: HTTP 200
{ "message": "Removed" }
```

### Front-end application state (index.html)

```js
let participants = [];       // string[] — current participant names
let rotationAngle = 0;       // radians
let velocity      = 0;       // radians per frame
let spinning      = false;
let eventQueue    = [];      // queued participant events during spin
let ws            = null;    // WebSocket instance
const sessionId   = getSessionId();
```

### Constants

```js
const FRICTION       = 0.985;
const STOP_THRESHOLD = 0.001;   // rad/frame
const MIN_VELOCITY   = /* computed: sum of geometric series ≥ 6π, frame count × 16.67ms ≥ 3000ms */;
const TTL_SECONDS    = 86400;
```

### Slot (wheel rendering)

```js
{ name: string, color: string }  // color from round-robin palette
```

### Color palette (8 colors, round-robin)

```js
["#e74c3c","#e67e22","#f1c40f","#2ecc71","#1abc9c","#3498db","#9b59b6","#e91e63"]
```

---

## SAM Template Structure

File: `template.yaml`

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31

Globals:
  Function:
    Runtime: nodejs20.x
    Timeout: 10
    Environment:
      Variables:
        CONNECTIONS_TABLE: !Ref ConnectionsTable
        REGISTRATIONS_TABLE: !Ref RegistrationsTable
        WEBSOCKET_ENDPOINT: !Sub "https://${WebSocketApi}.execute-api.${AWS::Region}.amazonaws.com/prod"

Resources:

  # --- DynamoDB ---
  ConnectionsTable:
    Type: AWS::DynamoDB::Table
    Properties:
      BillingMode: PAY_PER_REQUEST
      AttributeDefinitions:
        - { AttributeName: connectionId, AttributeType: S }
        - { AttributeName: sessionId,    AttributeType: S }
      KeySchema:
        - { AttributeName: connectionId, KeyType: HASH }
      GlobalSecondaryIndexes:
        - IndexName: sessionId-index
          KeySchema:
            - { AttributeName: sessionId, KeyType: HASH }
          Projection: { ProjectionType: ALL }
      TimeToLiveSpecification:
        AttributeName: ttl
        Enabled: true

  RegistrationsTable:
    Type: AWS::DynamoDB::Table
    Properties:
      BillingMode: PAY_PER_REQUEST
      AttributeDefinitions:
        - { AttributeName: sessionId, AttributeType: S }
        - { AttributeName: name,      AttributeType: S }
      KeySchema:
        - { AttributeName: sessionId, KeyType: HASH }
        - { AttributeName: name,      KeyType: RANGE }
      TimeToLiveSpecification:
        AttributeName: ttl
        Enabled: true

  # --- Lambda ---
  RegistrationFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: lambdas/
      Handler: registrationHandler.handler
      Policies:
        - DynamoDBCrudPolicy: { TableName: !Ref ConnectionsTable }
        - DynamoDBCrudPolicy: { TableName: !Ref RegistrationsTable }
      Events:
        PostRegister:
          Type: HttpApi
          Properties: { Path: /register, Method: POST, ApiId: !Ref RestApi }
        DeleteRegister:
          Type: HttpApi
          Properties: { Path: /register, Method: DELETE, ApiId: !Ref RestApi }

  WebSocketFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: lambdas/
      Handler: websocketHandler.handler
      Policies:
        - DynamoDBCrudPolicy: { TableName: !Ref ConnectionsTable }

  # --- REST API ---
  RestApi:
    Type: AWS::Serverless::HttpApi

  # --- WebSocket API ---
  WebSocketApi:
    Type: AWS::ApiGatewayV2::Api
    Properties:
      Name: SpinningWheelWebSocket
      ProtocolType: WEBSOCKET
      RouteSelectionExpression: "$request.body.action"

  # (Connect, Disconnect, Message routes, Stage, Deployment, Lambda permissions omitted for brevity)

Outputs:
  RestApiUrl:
    Value: !Sub "https://${RestApi}.execute-api.${AWS::Region}.amazonaws.com"
  WebSocketUrl:
    Value: !Sub "wss://${WebSocketApi}.execute-api.${AWS::Region}.amazonaws.com/prod"
```

The front-end pages read `RestApiUrl` and `WebSocketUrl` from a small `config.js` file generated during deployment (or injected as inline constants).

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Equal slot angles

*For any* slot count `N` ≥ 1, each slot's angular size SHALL equal exactly `2π / N` radians, so that all slots are equal-sized.

**Validates: Requirements 2.2**

### Property 2: Adjacent slots have distinct colors

*For any* slot count `N` ≥ 2, no two adjacent slots in the generated slot array SHALL share the same color value.

**Validates: Requirements 2.4**

### Property 3: Winner index is always a valid slot

*For any* rotation angle (any finite float) and any slot count `N` ≥ 1, `getWinnerIndex(angle, N)` SHALL return an integer in the range `[0, N - 1]`.

**Validates: Requirements 6.1**

### Property 4: Winner index is stable under full-rotation offsets

*For any* rotation angle `θ`, slot count `N` ≥ 1, and integer `k`, `getWinnerIndex(θ, N)` SHALL equal `getWinnerIndex(θ + 2π * k, N)`. Adding any number of full rotations does not change which slot is selected.

**Validates: Requirements 6.1**

### Property 5: Every slot is reachable

*For any* slot count `N` ≥ 1 and any index `i` in `[0, N - 1]`, there EXISTS a rotation angle `θ` such that `getWinnerIndex(θ, N) === i`. No slot is permanently unreachable.

**Validates: Requirements 7.2**

### Property 6: Winner display text format

*For any* participant name string `name`, when the wheel stops on that participant's slot, the winner display text SHALL equal `"Winner: " + name`.

**Validates: Requirements 6.2**

### Property 7: Spin meets minimum rotation and duration requirements

*For any* spin initiated via `startSpin`, simulating the animation loop to completion SHALL produce a total accumulated rotation of at least `6π` radians (3 full rotations) AND an elapsed time of at least 3000 milliseconds.

**Validates: Requirements 5.1, 5.3**

### Property 8: Session ID URL parsing round-trip

*For any* valid UUID v4 string `id`, constructing a URL with `?sessionId=id` and then calling `getSessionId()` against that URL SHALL return `id` unchanged. When no `sessionId` param is present, `getSessionId()` SHALL return a string that matches the UUID v4 format.

**Validates: Requirements 1.3, 13.1**

### Property 9: Registration URL contains session ID

*For any* valid session ID string `id`, `buildRegistrationUrl(id)` SHALL return a URL string whose `sessionId` query parameter equals `id`.

**Validates: Requirements 8.2**

### Property 10: Empty and whitespace names are rejected

*For any* string composed entirely of whitespace characters (including the empty string), the registration handler SHALL return HTTP 400 and SHALL NOT write any record to the Registrations table.

**Validates: Requirements 9.5, 10.3**

### Property 11: Valid registration writes record and returns 200

*For any* non-empty name string and valid session ID, the `registrationHandler` (with mocked DynamoDB) SHALL write a record with `{ sessionId, name, ttl }` to the Registrations table and return HTTP 200.

**Validates: Requirements 10.2**

### Property 12: Single-participant delete removes record and returns 200

*For any* valid session ID and name, calling `DELETE /register` with both SHALL cause the `registrationHandler` to delete exactly that record from the Registrations table and return HTTP 200.

**Validates: Requirements 10.6**

### Property 13: Clear-all delete removes all session records and returns 200

*For any* valid session ID and any non-empty set of registered names under that session, calling `DELETE /register` with only the session ID SHALL cause the `registrationHandler` to delete all records for that session and return HTTP 200.

**Validates: Requirements 10.7**

### Property 14: WebSocket connect stores connection record

*For any* connection ID and session ID, the `$connect` handler SHALL write a record with `{ connectionId, sessionId, ttl }` to the Connections table.

**Validates: Requirements 11.2, 12.1, 12.2**

### Property 15: WebSocket disconnect removes connection record (round-trip)

*For any* connection ID, after the `$connect` handler writes the record and the `$disconnect` handler runs, the Connections table SHALL contain no record with that connection ID.

**Validates: Requirements 11.3**

### Property 16: Broadcast completeness — all session connections receive the event

*For any* session ID and any non-empty set of active connection IDs sharing that session ID, when a broadcast is triggered (by `participantAdded`, `participantRemoved`, or `winner`), every connection in the set SHALL receive the message. Stale connections (returning `GoneException`) SHALL be removed and SHALL NOT cause the broadcast to abort for remaining connections.

**Validates: Requirements 11.4, 11.5, 11.7, 11.8**

### Property 17: Session isolation — events never cross session boundaries

*For any* two distinct session IDs `A` and `B`, a broadcast triggered by an event in session `A` (registration, deletion, or winner) SHALL deliver messages only to connections whose `sessionId` equals `A`. No connection with `sessionId` equal to `B` SHALL receive any message from session `A`.

**Validates: Requirements 13.2, 13.3**

### Property 18: Event queue preserves all events during spin

*For any* sequence of `participantAdded` and `participantRemoved` events received while the wheel is spinning, after the spin completes, the `participants` array SHALL reflect every event in the sequence applied in order, with no events dropped or duplicated.

**Validates: Requirements 14.4**

### Property 19: TTL is set correctly on all DynamoDB writes

*For any* DynamoDB write performed by either Lambda function, the `ttl` attribute SHALL equal `Math.floor(Date.now() / 1000) + 86400` (within a tolerance of ±2 seconds to account for execution time).

**Validates: Requirements 18.1, 18.2**

### Property 20: Registration idempotency — duplicate names do not create duplicate records

*For any* session ID and name, calling `POST /register` twice with the same session ID and name SHALL result in exactly one record in the Registrations table (DynamoDB `PutItem` with no condition, or a conditional put — the composite key `(sessionId, name)` enforces uniqueness at the table level).

**Validates: Requirements 10.2, 13.2**

---

## Error Handling

| Scenario | Component | Handling |
|---|---|---|
| WebSocket connection fails on page load | `index.html` | Display error banner; continue in offline mode (wheel still spins, no real-time updates) |
| WebSocket connection fails on `register.html` | `register.html` | Display error; participant won't receive winner notification but registration still works |
| `POST /register` returns 400 | `register.html` | Display validation error message; keep form enabled for retry |
| `POST /register` returns 500 | `register.html` | Display generic error message; keep form enabled for retry |
| `DELETE /register` fails | `index.html` | Display error message; leave wheel unchanged |
| DynamoDB error in Lambda | `registrationHandler` / `websocketHandler` | Return HTTP 500 with descriptive message |
| Stale WebSocket connection during broadcast | `registrationHandler` / `websocketHandler` | Catch `GoneException`; delete stale record from Connections table; continue broadcast |
| Canvas not supported | `index.html` | `<canvas>` fallback text: "Your browser does not support canvas." |
| `sessionId` absent from `register.html` URL | `register.html` | Display error: "Invalid registration link. Please scan the QR code again." |
| Spin button double-click | `index.html` | Button disabled immediately on first click; subsequent clicks ignored until wheel stops |
| `Math.random()` returns 0 | `index.html` | `MIN_VELOCITY` constant ensures ≥ 3 rotations regardless |

---

## Testing Strategy

### Unit tests (example-based)

Focus on pure logic functions testable without a browser or AWS:

| Test | Requirement |
|---|---|
| `getWinnerIndex(0, 8)` returns `0` | 6.1 |
| `getWinnerIndex(2π, 8)` returns `0` | 6.1 |
| `getWinnerIndex(π, 8)` returns `4` | 6.1 |
| `buildRegistrationUrl("abc")` contains `sessionId=abc` | 8.2 |
| `getSessionId()` with no param returns UUID v4 format | 1.3 |
| `handleWinnerEvent("Alice", "Alice")` shows celebration | 15.2 |
| `handleWinnerEvent("Alice", "Bob")` shows winner name | 15.3 |
| Registration handler returns 400 for missing `sessionId` | 10.4 |
| Registration handler returns 500 on DynamoDB error | 10.8 |
| After `startSpin()`, button is disabled | 4.3 |
| After spin completes, button is re-enabled | 6.3 |
| After `startSpin()`, winner display is empty | 4.4 |
| Winner display shows `"Winner: Alice"` when slot 0 wins | 6.2 |

### Property-based tests

Use **fast-check** (JavaScript PBT library) with a minimum of 100 iterations per property. Each test is tagged:
`// Feature: spinning-wheel, Property {N}: {property_text}`

Lambda handler tests use a lightweight DynamoDB mock (in-memory object) to keep tests fast and free of AWS dependencies.

| Property | Generator inputs | What is verified |
|---|---|---|
| **P1** | `N` ≥ 1 | Each slot angle === `2π / N` |
| **P2** | `N` ≥ 2 | No two adjacent slots share the same color |
| **P3** | `angle` (any finite float), `N` ≥ 1 | Result is integer in `[0, N-1]` |
| **P4** | `θ` (float), `N` ≥ 1, `k` (integer) | `getWinnerIndex(θ, N) === getWinnerIndex(θ + 2π*k, N)` |
| **P5** | `N` ≥ 1, `i` in `[0,N-1]` | There exists `θ` such that `getWinnerIndex(θ, N) === i` |
| **P6** | `name` (any non-empty string) | Winner display text === `"Winner: " + name` |
| **P7** | (fixed constants) | Simulated loop at 60fps: total rotation ≥ 6π AND elapsed ≥ 3000ms |
| **P8** | `id` (UUID v4 string) | `getSessionId()` round-trips the ID; absent param yields UUID v4 |
| **P9** | `id` (any non-empty string) | `buildRegistrationUrl(id)` URL contains `sessionId=id` |
| **P10** | whitespace strings | Handler returns 400; no DynamoDB write |
| **P11** | `sessionId`, `name` (non-empty) | Handler returns 200; mock DynamoDB receives correct put |
| **P12** | `sessionId`, `name` | Handler returns 200; mock DynamoDB receives correct delete |
| **P13** | `sessionId`, array of names | Handler returns 200; all records deleted from mock DynamoDB |
| **P14** | `connectionId`, `sessionId` | Connect handler writes `{ connectionId, sessionId, ttl }` to mock |
| **P15** | `connectionId`, `sessionId` | Connect then disconnect: no record remains in mock |
| **P16** | `sessionId`, set of `connectionId`s | All connections receive broadcast; stale ones are removed |
| **P17** | two distinct `sessionId`s A and B, connections for each | Broadcast for A reaches only A's connections |
| **P18** | sequence of add/remove events | All events applied in order after spin; no drops or duplicates |
| **P19** | any Lambda write operation | `ttl` attribute === `floor(Date.now()/1000) + 86400` (±2s) |
| **P20** | `sessionId`, `name` | Two identical POST /register calls → exactly one record in mock |

Property 7 simulates the `animationLoop` with a fixed 60fps frame budget (16.67ms/frame) rather than relying on `requestAnimationFrame`, making it deterministic and fast.

### Integration tests

Run against a deployed (or locally SAM-invoked) stack:

| Test | What it verifies |
|---|---|
| `POST /register` → DynamoDB record exists | End-to-end registration |
| `DELETE /register` (all) → DynamoDB records gone | End-to-end clear |
| WebSocket connect → record in Connections table | Connection tracking |
| WebSocket disconnect → record removed | Disconnect cleanup |
| Register participant → `index.html` WebSocket receives `participantAdded` | Real-time update |
| Spin winner → `register.html` WebSocket receives `winner` | Winner notification |

### Manual smoke test checklist

- [ ] `index.html` loads; wheel visible; Spin and Clear buttons present
- [ ] QR code visible and encodes correct registration URL with session ID
- [ ] Scanning QR code opens `register.html` with correct session ID in URL
- [ ] Entering a name on `register.html` and submitting adds name to wheel in real time
- [ ] Clicking Spin disables button, clears prior winner, wheel spins and decelerates
- [ ] Winner name appears after stop; button re-enables
- [ ] `register.html` shows "🎉 You won!" for the winner and winner's name for others
- [ ] Clicking Clear removes all names from wheel and redraws placeholder
- [ ] Two browser tabs with different session IDs do not share participants or events
- [ ] Arrow remains stationary throughout spin
- [ ] No external network requests beyond configured API endpoints (check DevTools Network)
