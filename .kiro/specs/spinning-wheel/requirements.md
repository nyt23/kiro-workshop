# Requirements Document

## Introduction

A single-page web application built with plain HTML, CSS, and vanilla JavaScript that displays a spinning prize wheel. The wheel is pre-populated with dummy participant names divided into equal slots. The user presses a button to spin the wheel; the wheel decelerates and stops at a random position, and a fixed arrow indicator points to the winning slot, which is then announced on screen.

## Glossary

- **Wheel**: The circular canvas element divided into equal-sized colored slots, each labeled with a name.
- **Slot**: A single wedge-shaped section of the Wheel containing one participant name.
- **Arrow**: A fixed visual indicator (pointer) positioned outside the Wheel that points to the winning Slot when the Wheel stops.
- **Spin_Button**: The button the user clicks to initiate a spin.
- **Winner_Display**: The on-screen text area that announces the name of the winning Slot after the Wheel stops.
- **Page**: The single HTML page that contains all components of the application.

## Requirements

### Requirement 1: Page Structure

**User Story:** As a user, I want a self-contained web page, so that I can use the spinning wheel without installing anything or connecting to a server.

#### Acceptance Criteria

1. THE Page SHALL be a single HTML file that includes all CSS and JavaScript inline or in the same file, requiring no external dependencies or network requests.
2. THE Page SHALL render correctly in modern desktop browsers (Chrome, Firefox, Safari, Edge).

---

### Requirement 2: Wheel Rendering

**User Story:** As a user, I want to see a colorful wheel divided into named slots, so that I can visually identify the participants.

#### Acceptance Criteria

1. THE Wheel SHALL be rendered on an HTML canvas element.
2. THE Wheel SHALL be divided into equal-sized Slots, one per participant name.
3. THE Wheel SHALL display a minimum of 6 and a maximum of 12 dummy participant names pre-populated at page load.
4. EACH Slot SHALL be filled with a distinct background color to visually differentiate it from adjacent Slots.
5. EACH Slot SHALL display the participant name as readable text centered within the Slot wedge.

---

### Requirement 3: Arrow Indicator

**User Story:** As a user, I want a clear pointer on the wheel, so that I know which slot is selected when the wheel stops.

#### Acceptance Criteria

1. THE Arrow SHALL be rendered as a fixed visual element positioned at the right edge of the Wheel, pointing toward the center.
2. THE Arrow SHALL remain stationary while the Wheel spins.
3. THE Arrow SHALL visually overlap the outer edge of the Wheel so the winning Slot is unambiguous.

---

### Requirement 4: Spin Interaction

**User Story:** As a user, I want to press a button to spin the wheel, so that a winner is chosen at random.

#### Acceptance Criteria

1. THE Page SHALL display a Spin_Button labeled "Spin".
2. WHEN the user clicks the Spin_Button, THE Wheel SHALL begin rotating.
3. WHEN the Wheel is spinning, THE Spin_Button SHALL be disabled so the user cannot trigger a second spin.
4. WHEN the Wheel begins spinning, THE Winner_Display SHALL be cleared of any previously shown winner text.

---

### Requirement 5: Spin Animation

**User Story:** As a user, I want the wheel to spin smoothly and slow down naturally, so that the experience feels engaging.

#### Acceptance Criteria

1. WHEN a spin is triggered, THE Wheel SHALL rotate for a minimum of 3 seconds before stopping.
2. THE Wheel SHALL start at a high angular velocity and decelerate gradually until it stops, simulating natural friction.
3. THE Wheel SHALL complete at least 3 full rotations during each spin.

---

### Requirement 6: Winner Selection and Display

**User Story:** As a user, I want to see the winner announced after the wheel stops, so that the result is clear.

#### Acceptance Criteria

1. WHEN the Wheel stops spinning, THE Page SHALL determine the winning Slot as the Slot aligned with the Arrow.
2. WHEN the Wheel stops spinning, THE Winner_Display SHALL show the text "Winner: [name]" where [name] is the participant name of the winning Slot.
3. WHEN the Wheel stops spinning, THE Spin_Button SHALL be re-enabled so the user can spin again.

---

### Requirement 7: Randomness

**User Story:** As a user, I want each spin to produce an unpredictable result, so that the selection is fair.

#### Acceptance Criteria

1. WHEN a spin is triggered, THE Wheel SHALL rotate to a final angle determined by a pseudo-random value, ensuring the winning Slot is not predictable in advance.
2. THE Wheel SHALL be capable of landing on any Slot across repeated spins.
