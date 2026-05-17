import type { ReactNode } from 'react';

export type FeedbackVariant = 'error' | 'success' | 'info' | 'empty';

interface FeedbackStateProps {
  variant: FeedbackVariant;
  title?: string;
  message: string;
  detail?: string;
  action?: ReactNode;
  className?: string;
}

const DEFAULT_TITLES: Record<FeedbackVariant, string> = {
  error: '出现问题',
  success: '已完成',
  info: '提示',
  empty: '暂无内容',
};

export function FeedbackState({
  variant,
  title,
  message,
  detail,
  action,
  className = '',
}: FeedbackStateProps) {
  const heading = title ?? DEFAULT_TITLES[variant];

  return (
    <div
      className={`saba-feedback saba-feedback--${variant} ${className}`.trim()}
      role={variant === 'error' ? 'alert' : variant === 'empty' ? 'status' : 'status'}
    >
      <p className="saba-feedback__title">{heading}</p>
      <p className="saba-feedback__message">{message}</p>
      {detail ? <p className="saba-feedback__detail">{detail}</p> : null}
      {action ? <div className="saba-feedback__action">{action}</div> : null}
    </div>
  );
}
