import { useMemo, useState } from 'react';
import type { AssessPipelineStepId, AssessStreamStepEvent, RiskLevel } from '../../types/index';
import { PIPELINE_STEP_LABELS, type StreamingStepState } from '../../lib/assess-stream';
import { RiskBadge } from '../ui/RiskBadge';

export type { StreamingStepState };

const STEP_ORDER: AssessPipelineStepId[] = [
  'intent_framing',
  'clinical_triage',
  'evidence_retrieval',
  'risk_deliberation',
  'safety_check',
  'executive_synthesis',
];

export interface StreamingAssessmentViewProps {
  steps: Partial<Record<AssessPipelineStepId, StreamingStepState>>;
  thinking: string;
  message: string;
  riskLevel?: RiskLevel;
  riskScore?: number;
}

export function applyStreamStep(
  prev: Partial<Record<AssessPipelineStepId, StreamingStepState>>,
  event: AssessStreamStepEvent,
): Partial<Record<AssessPipelineStepId, StreamingStepState>> {
  const next = { ...prev };
  if (event.status === 'start') {
    next[event.step] = { status: 'active' };
    return next;
  }
  next[event.step] = { status: 'done', detail: event.detail };
  return next;
}

export function StreamingAssessmentView({
  steps,
  thinking,
  message,
  riskLevel,
  riskScore,
}: StreamingAssessmentViewProps) {
  const [thinkingOpen, setThinkingOpen] = useState(false);

  const orderedSteps = useMemo(
    () =>
      STEP_ORDER.map((id) => ({
        id,
        label: PIPELINE_STEP_LABELS[id],
        state: steps[id],
      })).filter((item) => item.state != null),
    [steps],
  );

  return (
    <div
      className="stream-assess"
      aria-live="polite"
      aria-busy={orderedSteps.some(s => s.state?.status === 'active')}
    >
      {orderedSteps.length > 0 && (
        <ol className="stream-assess__steps">
          {orderedSteps.map((item) => (
            <li
              key={item.id}
              className={`stream-assess__step stream-assess__step--${item.state?.status ?? 'pending'}`}
            >
              <span className="stream-assess__step-label">{item.label}</span>
              {item.state?.detail && (
                <span className="stream-assess__step-detail">{item.state.detail}</span>
              )}
            </li>
          ))}
        </ol>
      )}

      {thinking.length > 0 && (
        <div className="stream-assess__thinking">
          <button
            type="button"
            className="stream-assess__thinking-toggle"
            onClick={() => setThinkingOpen((open) => !open)}
            aria-expanded={thinkingOpen}
          >
            思考过程 {thinkingOpen ? '▾' : '▸'}
          </button>
          {thinkingOpen && (
            <pre className="stream-assess__thinking-body">{thinking}</pre>
          )}
        </div>
      )}

      {message.length > 0 && (
        <div className="stream-assess__answer">
          {riskLevel && (
            <div className="stream-assess__risk">
              <RiskBadge level={riskLevel} size="lg" />
              {riskScore != null && (
                <span className="stream-assess__score">{riskScore}</span>
              )}
            </div>
          )}
          <p className="stream-assess__message">{message}</p>
        </div>
      )}
    </div>
  );
}
