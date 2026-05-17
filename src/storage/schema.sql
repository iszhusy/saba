-- SABA 数据库 Schema
-- Cloudflare D1 Migration

-- 评估记录表
CREATE TABLE IF NOT EXISTS assessments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  raw_input TEXT NOT NULL,
  structured_input TEXT,
  risk_level TEXT NOT NULL,
  risk_score REAL,
  immediate_action TEXT,
  reasoning TEXT,
  evidence TEXT,
  triggered_rules TEXT,
  team_contact_required INTEGER DEFAULT 0,
  follow_up TEXT,
  warning_signs TEXT,
  metadata TEXT,
  trace_json TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 评估记录索引
CREATE INDEX IF NOT EXISTS idx_assessments_user_id ON assessments(user_id);
CREATE INDEX IF NOT EXISTS idx_assessments_created_at ON assessments(created_at);
CREATE INDEX IF NOT EXISTS idx_assessments_risk_level ON assessments(risk_level);

-- 反馈表
CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL,
  feedback_type TEXT,
  is_helpful INTEGER,
  rating INTEGER,
  user_acted INTEGER,
  user_sought_medical_help INTEGER,
  team_verdict TEXT,
  team_comment TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (assessment_id) REFERENCES assessments(id)
);

-- 反馈索引
CREATE INDEX IF NOT EXISTS idx_feedback_assessment_id ON feedback(assessment_id);

-- 行为事件表
CREATE TABLE IF NOT EXISTS assessment_events (
  id TEXT PRIMARY KEY,
  event_name TEXT NOT NULL,
  user_id TEXT NOT NULL,
  assessment_id TEXT,
  session_id TEXT,
  metadata TEXT,
  trace_json TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (assessment_id) REFERENCES assessments(id)
);

CREATE INDEX IF NOT EXISTS idx_assessment_events_user_id ON assessment_events(user_id);
CREATE INDEX IF NOT EXISTS idx_assessment_events_assessment_id ON assessment_events(assessment_id);
CREATE INDEX IF NOT EXISTS idx_assessment_events_event_name ON assessment_events(event_name);
CREATE INDEX IF NOT EXISTS idx_assessment_events_trace_json ON assessment_events(trace_json);

-- 通知出站表（Outbox）
CREATE TABLE IF NOT EXISTS team_notifications (
  id TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  notification_type TEXT NOT NULL,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  recipients TEXT,
  trace_json TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  sent_at TEXT,
  last_error TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (assessment_id) REFERENCES assessments(id)
);

CREATE INDEX IF NOT EXISTS idx_team_notifications_assessment_id ON team_notifications(assessment_id);
CREATE INDEX IF NOT EXISTS idx_team_notifications_status ON team_notifications(status);

-- Session / Episode 状态
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL,
  active_episode_id TEXT,
  episodes_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS episodes (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL,
  symptoms_reported_json TEXT NOT NULL,
  symptoms_extracted_json TEXT NOT NULL,
  assessments_json TEXT NOT NULL,
  clarification_state_json TEXT,
  context_summary TEXT NOT NULL,
  started_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE INDEX IF NOT EXISTS idx_episodes_session_id ON episodes(session_id);
CREATE INDEX IF NOT EXISTS idx_episodes_user_id ON episodes(user_id);
CREATE INDEX IF NOT EXISTS idx_episodes_status ON episodes(status);

-- Patient Baseline（跨 Session 治疗基线）
-- 行为规格: docs/specs-ai-native/behavior/12-patient-baseline.md
CREATE TABLE IF NOT EXISTS patient_baselines (
  user_id TEXT PRIMARY KEY,
  treatment_category TEXT,
  treatment_anchor TEXT,
  primary_regimen TEXT,
  treatment_type TEXT,
  treatment_phase TEXT,
  treatment_day INTEGER,
  known_side_effects_json TEXT NOT NULL DEFAULT '[]',
  trace_json TEXT,
  updated_at TEXT NOT NULL
);

-- 规则版本表
CREATE TABLE IF NOT EXISTS rule_versions (
  id TEXT PRIMARY KEY,
  version TEXT NOT NULL UNIQUE,
  rules TEXT NOT NULL,
  change_summary TEXT,
  change_reason TEXT,
  status TEXT DEFAULT 'active',
  deployed_at TEXT,
  deployed_by TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
