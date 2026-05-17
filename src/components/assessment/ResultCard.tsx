import type { AssessResponse } from '../../types/index';
import { RiskBadge } from '../ui/RiskBadge';

interface ResultCardProps {
  result: AssessResponse;
  onContactTeam?: () => void;
}

export function ResultCard({ result, onContactTeam }: ResultCardProps) {
  const { risk_level, risk_score } = result;
  const createdAt = result.created_at;
  if (!createdAt) {
    throw new Error('Assessment result is missing created_at');
  }
  const rulesVersion = result.metadata.rules_version;
  if (!rulesVersion) {
    throw new Error('Assessment result is missing metadata.rules_version');
  }
  const statusHint =
    risk_level === 'high'
      ? '需要立即关注'
      : risk_level === 'medium'
        ? '建议尽快联系'
        : '可继续观察';

  return (
    <article className={`saba-result saba-result--${risk_level}`}>
      <header className="saba-result__head">
        <div>
          <p className="saba-result__meta">风险评分</p>
          <p className="saba-result__score">{risk_score}</p>
        </div>
        <div>
          <RiskBadge level={risk_level} size="lg" />
          <p className="saba-result__meta" style={{ marginTop: '0.5rem' }}>
            {statusHint}
          </p>
        </div>
      </header>

      <div className="saba-result__body">
        <div className="saba-result__action">
          <p className="saba-result__action-label">建议行动</p>
          <p className="saba-result__action-text">{result.immediate_action}</p>
        </div>

        {result.reasoning && (
          <p
            style={{
              fontSize: '0.85rem',
              lineHeight: 1.5,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            {result.reasoning}
          </p>
        )}

        {result.triggered_rules.length > 0 && (
          <div>
            <p className="saba-result__action-label">匹配规则</p>
            <div className="saba-tag-row">
              {result.triggered_rules.map(rule => (
                <span key={rule.id} className="saba-tag">
                  {rule.id} · {rule.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {result.warning_signs && result.warning_signs.length > 0 && (
          <div>
            <p className="saba-result__action-label">请注意</p>
            <ul
              style={{
                margin: 0,
                paddingLeft: '1.25rem',
                fontSize: '0.85rem',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              {result.warning_signs.map((signal, i) => (
                <li key={i}>{signal}</li>
              ))}
            </ul>
          </div>
        )}

        {result.team_contact_required && onContactTeam && (
          <div className="saba-btn-row">
            <button type="button" className="saba-btn" onClick={onContactTeam}>
              {risk_level === 'high' ? '立即联系团队' : '联系医疗团队'}
            </button>
          </div>
        )}
      </div>

      <footer className="saba-result__foot">
        <span>
          {new Date(createdAt).toLocaleString('zh-CN', {
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
        <span>v{rulesVersion}</span>
      </footer>
    </article>
  );
}
