import type { RiskLevel } from '../../types/index';

interface RiskBadgeProps {
  level: RiskLevel;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
}

const LABELS: Record<RiskLevel, string> = {
  high: '高风险',
  medium: '中风险',
  low: '低风险',
};

export function RiskBadge({ level, label, size = 'md' }: RiskBadgeProps) {
  const sizeClass =
    size === 'lg' ? 'saba-badge--lg' : size === 'sm' ? 'saba-badge--sm' : '';
  return (
    <span className={`saba-badge saba-badge--${level} ${sizeClass}`.trim()}>
      {label ?? LABELS[level]}
    </span>
  );
}

export function getRiskColor(level: RiskLevel): string {
  return level === 'high' ? '#000' : level === 'medium' ? '#666' : '#999';
}

export function getRiskBgColor(): string {
  return '#fff';
}

export function getRiskBorderColor(level: RiskLevel): string {
  return level === 'high' ? '#000' : 'rgba(0,0,0,0.15)';
}
