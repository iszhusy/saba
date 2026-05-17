## ADDED Requirements

### Requirement: Clarification is limited to two questions per turn

The system SHALL ask at most two clarification questions in a single user-visible turn.

#### Scenario: Multiple missing baseline and episode fields

- **WHEN** both baseline and episode P1 fields are missing
- **THEN** the system SHALL prioritize baseline questions first and SHALL NOT exceed two questions in that turn

### Requirement: Clarification priority order

The system SHALL apply clarification in this order: P0 emergency escalation (no further collection), medication boundary route-out, baseline P1 gaps, episode P1 gaps, optional P2 refinements only if assess path already allowed.

#### Scenario: Emergency overrides baseline collection

- **WHEN** user message contains P0 red-flag signals
- **THEN** the system SHALL escalate immediately and SHALL NOT ask baseline questions first

#### Scenario: Baseline before episode detail

- **WHEN** user reports a symptom but baseline is incomplete
- **THEN** the system SHALL clarify baseline before asking episode severity refinements

### Requirement: Episode P1 fields for a new symptom event

For symptom assessment, the system SHALL treat the following as episode P1 unless already known in the active Episode: primary symptom identification, symptom onset or duration, functional impact (eating, drinking, activity), and trend (worsening, stable, improving).

#### Scenario: Vague symptom with complete baseline

- **WHEN** baseline is complete and user says only a symptom keyword without duration
- **THEN** the system SHALL request episode P1 clarification rather than conclusive assessment

### Requirement: Clarification questions must declare information gain

Each clarification question SHALL map to resolving an open uncertainty that can change escalation decision, risk boundary, or conclusive eligibility.

#### Scenario: Low-value question blocked

- **WHEN** a question would not change risk level, escalation, or conclusive eligibility
- **THEN** the system SHALL NOT ask that question in P1 clarification paths

### Requirement: Clarification history prevents repetition

The system SHALL NOT repeat questions already recorded in `clarification_history` for the active Episode unless the user contradicts prior answers.

#### Scenario: Repeated ask after answer

- **WHEN** duration was answered in the current Episode clarification history
- **THEN** the system SHALL NOT ask for duration again in the same Episode

### Requirement: Structured intake for broad missing surface

When conversation goal is unclear or baseline is broadly missing, the system SHALL use `structured_intake` mode with a single structured prompt rather than fragmented multi-topic questions.

#### Scenario: First vague complaint without baseline

- **WHEN** user says they feel unwell without symptom specificity and has no baseline
- **THEN** the system SHALL use `structured_intake` or baseline-focused clarify with at most two items
