## ADDED Requirements

### Requirement: Patient baseline is persisted per user

The system SHALL maintain a `PatientBaseline` record keyed by `user_id`, distinct from Session and Episode, containing treatment context needed for side-effect risk assessment.

#### Scenario: New user has no baseline

- **WHEN** a user with no stored baseline sends their first assess request
- **THEN** the system SHALL treat `baseline_complete` as false

#### Scenario: Baseline is loaded for assess pipeline

- **WHEN** an assess request is prepared for a user with a stored baseline
- **THEN** the merged treatment context SHALL include baseline fields available to Intent Framing and Clinical Triage

### Requirement: Baseline MVP fields define completeness

The system SHALL consider baseline complete only when all of the following are present and non-empty: `treatment_category`, `treatment_anchor`. The field `primary_regimen` MAY be present but MUST NOT block completeness in MVP.

#### Scenario: Missing treatment anchor

- **WHEN** baseline exists with `treatment_category` but no `treatment_anchor`
- **THEN** `baseline_complete` SHALL be false

#### Scenario: Complete baseline

- **WHEN** baseline has valid `treatment_category` and `treatment_anchor`
- **THEN** `baseline_complete` SHALL be true

### Requirement: Baseline can be updated from clarification or intake

The system SHALL allow writing baseline fields from structured intake answers or explicit user corrections, updating the persisted record for subsequent requests.

#### Scenario: User completes baseline intake in chat

- **WHEN** user provides treatment category and anchor in response to baseline intake
- **THEN** the system SHALL persist baseline and set `baseline_complete` true for following turns in the same or new session

### Requirement: Request context may override baseline for a single turn

The system SHALL merge `AssessRequest.context` over stored baseline for the current request without deleting stored baseline unless an explicit update is performed.

#### Scenario: One-off context override

- **WHEN** request includes `treatment_day` in context and baseline does not
- **THEN** the merged context for that assess SHALL include `treatment_day` for reasoning only
