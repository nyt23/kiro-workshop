# Requirements Document

## Introduction

A web application built with plain HTML, CSS, and vanilla JavaScript that displays a spinning prize wheel. Participants self-register by scanning a QR code and entering their name on a mobile-friendly registration page. Names appear on the wheel in real time via WebSocket. The presenter presses a button to spin the wheel; the wheel decelerates and stops at a random position, a fixed arrow indicator points to the winning slot, and the winner is announced both on screen and broadcast to all connected participants. Backend infrastructure (REST API, WebSocket API, DynamoDB) is defined in an AWS SAM template.

## Glossary

- **Wheel**: The circular canvas element divided into equal-sized colored slots, each labeled with a participant name.
- **Slot**: A single wedge-shaped section of the Wheel containing one participant name.
- **Arrow**: A fixed visual indicator (pointer) positioned outside the Wheel that points to the winning Slot when the Wheel stops.
- **Spin_Button**: The button the presenter clicks to initiate a spin.
- **Clear_Button**: The button the presenter clicks to remove all registered participants and reset the Wheel.
- **Winner_Display**: The on-screen text area that announces the name of the winning Slot after the Wheel stops.
- **Page**: The main HTML page (`index.html`) that contains the Wheel, Spin_Button, Clear_Button, QR_Code, and Winner_Display.
- **Registration_Page**: The mobile-friendly HTML page (`register.html`) where participants enter their name to join the Wheel.
- **QR_Code**: A scannable image displayed on the Page that encodes the Registration_URL.
- **Registration_URL**: The URL of the Registration_Page, including the Session_ID as a query parameter.
- **Session_ID**: A unique identifier that scopes all registrations, connections, and winner broadcasts to a single presenter's drawing.
- **REST_API**: The AWS API Gateway HTTP API that exposes `POST /register` and `DELETE /register` endpoints.
- **WebSocket_API**: The AWS API Gateway WebSocket API that delivers real-time participant and winner events to connected clients.
- **Registration_Lambda**: The AWS Lambda function that handles `POST /register` and `DELETE /register` requests.
- **WebSocket_Lambda**: The AWS Lambda function that handles WebSocket connect, disconnect, and message routing.
- **Connections_Table**: The DynamoDB table that tracks active WebSocket connection IDs per Session_ID.
- **Registrations_Table**: The DynamoDB table that stores participant names per Session_ID.
- **SAM_Template**: The AWS SAM `template.yaml` file that defines all backend infrastructure.
- **TTL**: A DynamoDB Time-to-Live attribute that causes a record to be automatically deleted after a specified Unix timestamp.
- **Presenter**: The person operating the Page who initiates spins and manages the session.
- **Participant**: A person who scans the QR_Code and registers their name via the Registration_Page.

## Requirements

### Requirement 1: Page Structure

**User Story:** As a presenter, I want a web page that connects to a backend session, so that I can run a live drawing with real-time participant registration.

#### Acceptance Criteria

1. THE Page SHALL be a single HTML file (`index.html`) that includes all CSS and JavaScript inline or in the same file.
2. THE Page SHALL render correctly in modern desktop browsers (Chrome, Firefox, Safari, Edge).
3. WHEN the Page loads, THE Page SHALL read the Session_ID from the URL query parameter `sessionId`, generating a new UUID if none is present.
4. WHEN the Page loads, THE Page SHALL establish a WebSocket connection to the WebSocket_API using the Session_ID.
5. IF the WebSocket connection cannot be established, THEN THE Page SHALL display an error message and continue to function in a degraded (offline) mode.

---

### Requirement 2: Wheel Rendering

**User Story:** As a presenter, I want to see a colorful wheel divided into named slots, so that I can visually identify the registered participants.

#### Acceptance Criteria

1. THE Wheel SHALL be rendered on an HTML canvas element.
2. THE Wheel SHALL be divided into equal-sized Slots, one per registered participant name.
3. WHEN no participants are registered, THE Wheel SHALL display a placeholder state (e.g., a single "No participants" slot) so the canvas is never empty.
4. EACH Slot SHALL be filled with a distinct background color to visually differentiate it from adjacent Slots.
5. EACH Slot SHALL display the participant name as readable text centered within the Slot wedge.

---

### Requirement 3: Arrow Indicator

**User Story:** As a presenter, I want a clear pointer on the wheel, so that I know which slot is selected when the wheel stops.

#### Acceptance Criteria

1. THE Arrow SHALL be rendered as a fixed visual element positioned at the right edge of the Wheel, pointing toward the center.
2. THE Arrow SHALL remain stationary while the Wheel spins.
3. THE Arrow SHALL visually overlap the outer edge of the Wheel so the winning Slot is unambiguous.

---

### Requirement 4: Spin Interaction

**User Story:** As a presenter, I want to press a button to spin the wheel, so that a winner is chosen at random.

#### Acceptance Criteria

1. THE Page SHALL display a Spin_Button labeled "Spin".
2. WHEN the presenter clicks the Spin_Button, THE Wheel SHALL begin rotating.
3. WHEN the Wheel is spinning, THE Spin_Button SHALL be disabled so the presenter cannot trigger a second spin.
4. WHEN the Wheel begins spinning, THE Winner_Display SHALL be cleared of any previously shown winner text.
5. WHEN fewer than 2 participants are registered, THE Spin_Button SHALL be disabled.

---

### Requirement 5: Spin Animation

**User Story:** As a presenter, I want the wheel to spin smoothly and slow down naturally, so that the experience feels engaging.

#### Acceptance Criteria

1. WHEN a spin is triggered, THE Wheel SHALL rotate for a minimum of 3 seconds before stopping.
2. THE Wheel SHALL start at a high angular velocity and decelerate gradually until it stops, simulating natural friction.
3. THE Wheel SHALL complete at least 3 full rotations during each spin.

---

### Requirement 6: Winner Selection and Display

**User Story:** As a presenter, I want to see the winner announced after the wheel stops, so that the result is clear.

#### Acceptance Criteria

1. WHEN the Wheel stops spinning, THE Page SHALL determine the winning Slot as the Slot aligned with the Arrow.
2. WHEN the Wheel stops spinning, THE Winner_Display SHALL show the text "Winner: [name]" where [name] is the participant name of the winning Slot.
3. WHEN the Wheel stops spinning, THE Spin_Button SHALL be re-enabled so the presenter can spin again.

---

### Requirement 7: Randomness

**User Story:** As a presenter, I want each spin to produce an unpredictable result, so that the selection is fair.

#### Acceptance Criteria

1. WHEN a spin is triggered, THE Wheel SHALL rotate to a final angle determined by a pseudo-random value, ensuring the winning Slot is not predictable in advance.
2. THE Wheel SHALL be capable of landing on any Slot across repeated spins.

---

### Requirement 8: QR Code Display

**User Story:** As a presenter, I want a QR code displayed next to the wheel, so that participants can scan it with their phones to register without me having to share a URL manually.

#### Acceptance Criteria

1. THE Page SHALL display a QR_Code image adjacent to the Wheel canvas.
2. THE QR_Code SHALL encode the Registration_URL, including the current Session_ID as a query parameter.
3. WHEN the Session_ID changes, THE QR_Code SHALL update to reflect the new Registration_URL.
4. THE QR_Code SHALL be generated client-side without requiring an external image service.

---

### Requirement 9: Registration Page

**User Story:** As a participant, I want a simple mobile-friendly page to enter my name, so that I can join the wheel from my phone.

#### Acceptance Criteria

1. THE Registration_Page SHALL be a single HTML file (`register.html`) that includes all CSS and JavaScript inline or in the same file.
2. THE Registration_Page SHALL render correctly on mobile browsers (iOS Safari, Android Chrome) with a viewport-responsive layout.
3. THE Registration_Page SHALL display a text input field for the participant's name and a submit button.
4. WHEN the participant submits a non-empty name, THE Registration_Page SHALL call `POST /register` with the participant's name and the Session_ID read from the URL query parameter `sessionId`.
5. IF the name field is empty when the participant clicks submit, THEN THE Registration_Page SHALL display a validation error and SHALL NOT submit the request.
6. WHEN the registration request succeeds, THE Registration_Page SHALL display a confirmation message (e.g., "You're on the wheel!") and disable the submit button to prevent duplicate registration.
7. IF the registration request fails, THEN THE Registration_Page SHALL display an error message and allow the participant to retry.

---

### Requirement 10: REST API — Participant Registration

**User Story:** As a system, I want a REST API to add and remove participant names, so that the wheel page can be kept in sync with registrations.

#### Acceptance Criteria

1. THE REST_API SHALL expose a `POST /register` endpoint that accepts a JSON body containing `sessionId` (string) and `name` (string).
2. WHEN `POST /register` is called with a valid `sessionId` and non-empty `name`, THE Registration_Lambda SHALL write the participant record to the Registrations_Table and return HTTP 200.
3. WHEN `POST /register` is called with a missing or empty `name`, THE Registration_Lambda SHALL return HTTP 400 with a descriptive error message.
4. WHEN `POST /register` is called with a missing `sessionId`, THE Registration_Lambda SHALL return HTTP 400 with a descriptive error message.
5. THE REST_API SHALL expose a `DELETE /register` endpoint that accepts a JSON body containing `sessionId` (string) and optionally `name` (string).
6. WHEN `DELETE /register` is called with a `sessionId` and a specific `name`, THE Registration_Lambda SHALL remove that participant record from the Registrations_Table and return HTTP 200.
7. WHEN `DELETE /register` is called with a `sessionId` and no `name`, THE Registration_Lambda SHALL remove all participant records for that Session_ID from the Registrations_Table and return HTTP 200.
8. IF a database error occurs during any REST_API operation, THEN THE Registration_Lambda SHALL return HTTP 500 with a descriptive error message.

---

### Requirement 11: WebSocket API — Real-Time Updates

**User Story:** As a system, I want a WebSocket API so that participant registrations and winner announcements are delivered to the wheel page in real time.

#### Acceptance Criteria

1. THE WebSocket_API SHALL support `$connect`, `$disconnect`, and a `message` route.
2. WHEN a client connects to the WebSocket_API, THE WebSocket_Lambda SHALL store the connection ID and Session_ID in the Connections_Table.
3. WHEN a client disconnects from the WebSocket_API, THE WebSocket_Lambda SHALL remove the connection record from the Connections_Table.
4. WHEN a new participant is registered via `POST /register`, THE Registration_Lambda SHALL broadcast a `participantAdded` event containing the participant's name to all WebSocket connections sharing the same Session_ID.
5. WHEN a participant is removed via `DELETE /register`, THE Registration_Lambda SHALL broadcast a `participantRemoved` event containing the participant's name to all WebSocket connections sharing the same Session_ID.
6. WHEN a winner is determined on the Page, THE Page SHALL send a `winner` message over the WebSocket connection containing the winner's name and Session_ID.
7. WHEN the WebSocket_Lambda receives a `winner` message, THE WebSocket_Lambda SHALL broadcast the winner's name to all WebSocket connections sharing the same Session_ID.
8. IF a stale connection ID is encountered during a broadcast, THEN THE WebSocket_Lambda SHALL remove that connection record from the Connections_Table and continue broadcasting to remaining connections.

---

### Requirement 12: DynamoDB Tables

**User Story:** As a system, I want DynamoDB tables to persist connection and registration data, so that the backend can route messages and track participants reliably.

#### Acceptance Criteria

1. THE Connections_Table SHALL use `connectionId` as the partition key.
2. THE Connections_Table SHALL store the `sessionId` attribute on each record so connections can be queried by Session_ID.
3. THE Registrations_Table SHALL use `sessionId` as the partition key and `name` as the sort key.
4. THE Registrations_Table SHALL support querying all participant names for a given Session_ID.
5. EACH record in the Connections_Table SHALL include a `ttl` attribute set to a Unix timestamp 24 hours after record creation.
6. EACH record in the Registrations_Table SHALL include a `ttl` attribute set to a Unix timestamp 24 hours after record creation.
7. THE Connections_Table SHALL have DynamoDB TTL enabled on the `ttl` attribute.
8. THE Registrations_Table SHALL have DynamoDB TTL enabled on the `ttl` attribute.

---

### Requirement 13: Session Isolation

**User Story:** As a presenter, I want my session to be isolated from other presenters' sessions, so that participants only appear on my wheel and not on someone else's.

#### Acceptance Criteria

1. THE Page SHALL generate a unique Session_ID (UUID v4) when no `sessionId` query parameter is present in the URL.
2. THE REST_API SHALL scope all participant records to the provided Session_ID so that registrations for one session do not appear in another session.
3. THE WebSocket_API SHALL scope all broadcasts to connections sharing the same Session_ID so that events from one session are not delivered to another session's clients.
4. THE Registration_Page SHALL read the Session_ID exclusively from the `sessionId` URL query parameter and SHALL NOT generate or modify the Session_ID.

---

### Requirement 14: Real-Time Wheel Updates

**User Story:** As a presenter, I want participant names to appear on the wheel automatically as people register, so that I don't have to refresh the page.

#### Acceptance Criteria

1. WHEN the Page receives a `participantAdded` WebSocket event, THE Page SHALL add the participant's name to the Wheel without requiring a page reload.
2. WHEN the Page receives a `participantRemoved` WebSocket event, THE Page SHALL remove the participant's name from the Wheel without requiring a page reload.
3. WHEN the Wheel is updated with a new participant, THE Wheel SHALL redraw immediately to reflect the new slot count and layout.
4. WHILE the Wheel is spinning, THE Page SHALL queue incoming `participantAdded` and `participantRemoved` events and apply them only after the spin completes.

---

### Requirement 15: Winner Notification to Participants

**User Story:** As a participant, I want to know when the winner is announced, so that I can see whether I won without watching the presenter's screen.

#### Acceptance Criteria

1. WHEN the Wheel stops spinning, THE Page SHALL send a `winner` message over the WebSocket connection containing the winner's name.
2. WHEN a participant's Registration_Page receives a `winner` WebSocket event and the winner's name matches the participant's registered name, THE Registration_Page SHALL display a celebration message (e.g., "🎉 You won!").
3. WHEN a participant's Registration_Page receives a `winner` WebSocket event and the winner's name does not match the participant's registered name, THE Registration_Page SHALL display the winner's name (e.g., "The winner is: [name]").
4. WHEN the Registration_Page is waiting for the result after registration, THE Registration_Page SHALL establish a WebSocket connection to the WebSocket_API using the same Session_ID.

---

### Requirement 16: Clear Button

**User Story:** As a presenter, I want a Clear button to reset all participants, so that I can start a fresh drawing without reloading the page.

#### Acceptance Criteria

1. THE Page SHALL display a Clear_Button labeled "Clear".
2. WHEN the presenter clicks the Clear_Button, THE Page SHALL call `DELETE /register` with the current Session_ID and no specific name, removing all participants for the session.
3. WHEN the `DELETE /register` call succeeds, THE Page SHALL clear all participant names from the Wheel and redraw it in the placeholder state.
4. WHEN the Wheel is spinning, THE Clear_Button SHALL be disabled.
5. WHEN the `DELETE /register` call fails, THE Page SHALL display an error message and leave the Wheel unchanged.

---

### Requirement 17: SAM Infrastructure

**User Story:** As a developer, I want all backend infrastructure defined in a SAM template, so that I can deploy and tear down the entire backend with a single command.

#### Acceptance Criteria

1. THE SAM_Template SHALL define the REST_API as an AWS API Gateway HTTP API resource.
2. THE SAM_Template SHALL define the WebSocket_API as an AWS API Gateway WebSocket API resource.
3. THE SAM_Template SHALL define the Registration_Lambda as an AWS Lambda function resource with the `POST /register` and `DELETE /register` routes attached.
4. THE SAM_Template SHALL define the WebSocket_Lambda as an AWS Lambda function resource with the `$connect`, `$disconnect`, and `message` routes attached.
5. THE SAM_Template SHALL define the Connections_Table as an AWS DynamoDB table resource with TTL enabled.
6. THE SAM_Template SHALL define the Registrations_Table as an AWS DynamoDB table resource with TTL enabled.
7. THE SAM_Template SHALL grant the Registration_Lambda IAM permissions to read and write to both the Connections_Table and the Registrations_Table.
8. THE SAM_Template SHALL grant the WebSocket_Lambda IAM permissions to read and write to the Connections_Table.
9. THE SAM_Template SHALL output the REST_API endpoint URL and the WebSocket_API endpoint URL so they can be configured in the front-end pages.

---

### Requirement 18: DynamoDB TTL for Automatic Cleanup

**User Story:** As an operator, I want session data to expire automatically, so that stale connection and registration records do not accumulate indefinitely.

#### Acceptance Criteria

1. WHEN a record is written to the Connections_Table, THE Registration_Lambda or WebSocket_Lambda SHALL set the `ttl` attribute to the current Unix timestamp plus 86400 seconds (24 hours).
2. WHEN a record is written to the Registrations_Table, THE Registration_Lambda SHALL set the `ttl` attribute to the current Unix timestamp plus 86400 seconds (24 hours).
3. THE Connections_Table SHALL have DynamoDB TTL configured on the `ttl` attribute so that expired records are deleted automatically by DynamoDB.
4. THE Registrations_Table SHALL have DynamoDB TTL configured on the `ttl` attribute so that expired records are deleted automatically by DynamoDB.
