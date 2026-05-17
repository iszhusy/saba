import type { RiskLevel } from '../../types/index';
import { RISK_HINTS, RISK_LABELS, getRiskBgColor, getRiskBorderColor, getRiskColor } from '../../lib/risk-display';

interface RiskBadgeProps {
  level: RiskLevel;
  label?: string;
  hint?: string;
  showHint?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function RiskBadge({
  level,
  label,
  hint,
  showHint = false,
  size = 'md',
}: RiskBadgeProps) {
  const sizeClass =
    size === 'lg' ? 'saba-badge--lg' : size === 'sm' ? 'saba-badge--sm' : '';
  const displayLabel = label ?? RISK_LABELS[level];
  const displayHint = hint ?? RISK_HINTS[level];

  return (
    <span className={`saba-badge-wrap saba-badge-wrap--${level}`}>
      <span
        className={`saba-badge saba-badge--${level} ${sizeClass}`.trim()}
        role="status"
        aria-label={`${displayLabel}：${displayHint}`}
      >
        <span className="saba-badge__dot" aria-hidden />
        {displayLabel}
      </span>
      {showHint && <span className="saba-badge__hint">{displayHint}</span>}
    </span>
  );
}

export { getRiskColor, getRiskBgColor, getRiskBorderColor };
