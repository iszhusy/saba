import { useState } from 'react';
import type { AssessResponse, TeamNotifyResponse } from '../../types/index';
import { FeedbackState } from '../ui/FeedbackState';
import { ResultCard } from './ResultCard';

interface AuditDisclosureProps {
  result: AssessResponse;
  teamRequestResult: TeamNotifyResponse | null;
  onContactTeam?: () => void;
}

export function AuditDisclosure({
  result,
  teamRequestResult,
  onContactTeam,
}: AuditDisclosureProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="saba-audit-disclosure">
      <button
        type="button"
        className="saba-audit-disclosure__toggle"
        onClick={() => setOpen(prev => !prev)}
        aria-expanded={open}
      >
        <span className="saba-audit-disclosure__toggle-label">
          {open ? '收起审计详情' : '查看完整审计与规则详情'}
        </span>
        <span className="saba-audit-disclosure__toggle-hint" aria-hidden>
          {open ? '▴' : '▾'}
        </span>
      </button>

      {open && (
        <div className="saba-audit-disclosure__body" id="saba-audit-detail">
          <p className="saba-audit-disclosure__intro">
            以下为系统审计留痕，对话气泡中已展示面向您的结论摘要。
          </p>
          <ResultCard result={result} onContactTeam={onContactTeam} />
          {teamRequestResult && (
            <FeedbackState
              className="saba-feedback--inline"
              variant="success"
              title="协同请求已创建"
              message={`请求 ${teamRequestResult.notification_id} · 评估 ${teamRequestResult.assessment_id}`}
              detail={new Date(teamRequestResult.created_at).toLocaleString('zh-CN', {
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            />
          )}
        </div>
      )}
    </div>
  );
}
