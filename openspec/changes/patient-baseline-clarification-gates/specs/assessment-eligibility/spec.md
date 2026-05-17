## ADDED Requirements

### Requirement: Incomplete baseline blocks graded assessment

When `baseline_complete` is false, the system MUST NOT return `conclusive_assessment` or user-visible output that assigns a specific `risk_level` or numeric risk score as a final judgment.

#### Scenario: Nausea without baseline

- **WHEN** user message is「今天开始恶心」and baseline is incomplete
- **THEN** `executive_summary.status` SHALL be `clarification_required`
- **THEN** `executive_summary.final_mode` SHALL be `structured_intake` or `clarify`
- **THEN** `executive_summary.decision_mode` SHALL be `insufficient`

#### Scenario: No risk level in clarification response

- **WHEN** baseline is incomplete and user reports a non-emergency symptom
- **THEN** the user-visible response MUST NOT state a definitive risk tier such as medium or high risk as the primary conclusion

### Requirement: Emergency path bypasses baseline collection

When P0 red-flag signals are present, the system SHALL use `escalation` regardless of baseline completeness.

#### Scenario: Dyspnea without baseline

- **WHEN** user reports difficulty breathing and baseline is incomplete
- **THEN** the system SHALL escalate and SHALL NOT block on baseline intake

### Requirement: Medication boundary blocks clinical risk grading

When the user intent is medication stop, dose change, or add/remove drug, the system SHALL use `route_out` and SHALL NOT provide side-effect risk grading.

#### Scenario: Stop medication question

- **WHEN** user asks whether they can stop medication for a day
- **THEN** the system SHALL route out to care team guidance without risk_level grading

### Requirement: Provisional assessment requires baseline and partial episode picture

The system MAY use `provisional_assessment` only when `baseline_complete` is true, episode P1 is sufficiently known for a clinical tendency, and Risk Deliberation indicates provisional (not insufficient) with explicit residual unknowns stated to the user.

#### Scenario: Provisional after partial episode info

- **WHEN** baseline is complete, user reports nausea for two days with poor intake, and one P2 detail remains unknown
- **THEN** the system MAY return provisional assessment with stated uncertainties

### Requirement: Conclusive assessment requires closed critical unknowns

The system SHALL use `conclusive_assessment` only when baseline is complete, episode P1 is satisfied, and deliberation indicates no critical unknown blocks conclusive eligibility.

#### Scenario: Mild nausea with full context

- **WHEN** baseline is complete and user reports mild nausea without red flags and with stable intake
- **THEN** the system MAY return conclusive assessment with low risk tendency if deliberation supports it

### Requirement: Executive is sole authority for user-visible eligibility

Reasoning surfaces MUST NOT produce user-final messages; eligibility guards SHALL be applied in Executive synthesis before the user sees the response.

#### Scenario: Triage suggests medium risk but baseline incomplete

- **WHEN** triage surface indicates medium tendency while baseline is incomplete
- **THEN** the user-visible response SHALL remain clarification or insufficient, not conclusive medium-risk advice

### Requirement: Eligibility is regression-testable

The project SHALL include automated tests for at least: incomplete baseline + symptom message → clarification_required; complete baseline + insufficient vague message → clarification; red flag → escalation without baseline.

#### Scenario: Harness case for baseline gate

- **WHEN** evaluation harness runs case「恶心首发-缺治疗背景应澄清」
- **THEN** the case SHALL fail if executive_status is not clarification_required or if risk_level is asserted as a passed graded outcome
