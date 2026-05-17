import type { RiskLevel } from '../types/index';

export const RISK_LABELS: Record<RiskLevel, string> = {
  high: '高风险',
  medium: '中风险',
  low: '低风险',
};

export const RISK_HINTS: Record<RiskLevel, string> = {
  high: '需要立即关注',
  medium: '建议尽快联系医疗团队',
  low: '可继续观察，按建议自我监测',
};

export function getRiskColor(level: RiskLevel): string {
  return `var(--saba-risk-${level})`;
}

export function getRiskBgColor(level: RiskLevel): string {
  return `var(--saba-risk-${level}-bg)`;
}

export function getRiskBorderColor(level: RiskLevel): string {
  return `var(--saba-risk-${level}-border)`;
}
