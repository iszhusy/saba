import { useEffect, useRef } from 'react';
import type { AssessResponse } from '../../types/index';
import { sabaClient } from '../../client';
import { createBehaviorEventRequest } from '../../lib/assessment-observability';
import { RiskBadge } from '../ui/RiskBadge';

interface ChatResultMessageProps {
  result: AssessResponse;
}

const USER_ID = 'user-123';

export function ChatResultMessage({ result }: ChatResultMessageProps) {
  const hasTrackedView = useRef(false);

  useEffect(() => {
    if (hasTrackedView.current || !result.assessment_id) {
      return;
    }

    hasTrackedView.current = true;
    void sabaClient.trackBehaviorEvent(
      createBehaviorEventRequest({
        event: 'result_viewed',
        userId: USER_ID,
        assessmentId: result.assessment_id,
        sessionId: result.session_id,
        metadata: {
          source: 'conversation',
          risk_level: result.risk_level,
        },
      }),
    );
  }, [result.assessment_id, result.risk_level, result.session_id]);

  return (
    <div className="chat-result">
      <div className="chat-result__head">
        <RiskBadge level={result.risk_level} size="lg" />
        <span className="chat-result__score">{result.risk_score}</span>
      </div>
      <p className="chat-result__label">建议行动</p>
      <p className="chat-result__action">{result.immediate_action}</p>
      {result.triggered_rules.length > 0 && (
        <div>
          <p className="chat-result__label">命中规则</p>
          <ul className="chat-result__warnings">
            {result.triggered_rules.map((rule) => (
              <li key={rule.id}>{rule.id} · {rule.name}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="chat-result__meta">
        生成时间 {new Date(result.created_at ?? new Date().toISOString()).toLocaleString('zh-CN', {
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </p>
      <p className="chat-result__meta">规则版本 v{result.metadata.rules_version}</p>
      {result.warning_signs && result.warning_signs.length > 0 && (
        <ul className="chat-result__warnings">
          {result.warning_signs.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}
      {result.executive_summary?.summary && (
        <p className="chat-result__meta">{result.executive_summary.summary}</p>
      )}
      {result.metadata.processing_time_ms != null && (
        <p className="chat-result__meta">
          推理耗时 {result.metadata.processing_time_ms}ms
          {result.metadata.model_version ? ` · ${result.metadata.model_version}` : ''}
        </p>
      )}
    </div>
  );
}
