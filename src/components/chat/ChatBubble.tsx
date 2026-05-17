import type { ReactNode } from 'react';

interface ChatBubbleProps {
  role: 'assistant' | 'user';
  children: ReactNode;
}

export function ChatBubble({ role, children }: ChatBubbleProps) {
  const rowClass = `chat-row chat-row--${role}`;
  const bubbleClass = `chat-bubble chat-bubble--${role}`;
  return (
    <div className={rowClass}>
      <div className={bubbleClass}>{children}</div>
    </div>
  );
}
