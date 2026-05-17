import type { HistoryResponse, AssessmentSummary } from '../../types/index';
import { RiskBadge } from '../ui/RiskBadge';

interface HistoryListProps {
  history: HistoryResponse;
  onSelect: (assessmentId: string) => void;
  isLoading?: boolean;
}

export function HistoryList({ history, onSelect, isLoading }: HistoryListProps) {
  if (isLoading) {
    return (
      <div className="saba-stack">
        {[1, 2, 3].map(i => (
          <div key={i} className="saba-skeleton" />
        ))}
      </div>
    );
  }

  if (history.assessments.length === 0) {
    return (
      <div className="saba-empty">
        <p>暂无评估记录</p>
        <p style={{ marginTop: '0.5rem', fontSize: '0.75rem' }}>
          完成首次评估后将显示于此
        </p>
      </div>
    );
  }

  return (
    <div className="saba-stack">
      {history.assessments.map(item => (
        <HistoryItem
          key={item.assessment_id}
          item={item}
          onClick={() => onSelect(item.assessment_id)}
        />
      ))}
    </div>
  );
}

function HistoryItem({
  item,
  onClick,
}: {
  item: AssessmentSummary;
  onClick: () => void;
}) {
  const timeAgo = getTimeAgo(new Date(item.created_at));

  return (
    <button
      type="button"
      onClick={onClick}
      className={`saba-history-item saba-history-item--${item.risk_level}`}
    >
      <div className="saba-history-item__body">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <RiskBadge level={item.risk_level} size="sm" />
          <span className="saba-history-item__sub">{timeAgo}</span>
        </div>
        <p className="saba-history-item__title">
          {item.symptom_summary || '症状评估'}
        </p>
        <p className="saba-history-item__sub">{item.immediate_action}</p>
        <p className="saba-history-item__sub">
          命中规则：{item.triggered_rules.length > 0
            ? item.triggered_rules.map((rule) => `${rule.id}·${rule.name}`).join('，')
            : '无'}
        </p>
      </div>
      <div className="saba-history-item__foot">
        <span>
          {new Date(item.created_at).toLocaleDateString('zh-CN', {
            month: 'short',
            day: 'numeric',
          })}
        </span>
        <span>{item.result_label} · v{item.rules_version}</span>
      </div>
    </button>
  );
}

function getTimeAgo(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  if (days < 7) return `${days} 天前`;
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}
