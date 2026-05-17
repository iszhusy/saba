import { getTimeGreeting } from '../../lib/greeting';
import type { AssessmentDetail } from '../../types/index';
import type { ChatMessageItem } from './types';

function createId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 新对话开场白 */
export function buildInitialGreetingMessage(): ChatMessageItem {
  return {
    id: 'greeting',
    role: 'assistant',
    text: `${getTimeGreeting()} 我是 SABA 评估助手。请用您自己的话描述当前的不适（例如症状、开始时间、是否在加重）。我会根据您的描述继续追问或给出风险评估。`,
  };
}

/** 从历史评估详情还原聊天气泡（仅展示已持久化字段） */
export function buildMessagesFromAssessmentDetail(detail: AssessmentDetail): ChatMessageItem[] {
  const messages: ChatMessageItem[] = [
    {
      id: 'history-banner',
      role: 'assistant',
      text: '以下为该次历史评估记录（只读）。如需继续新对话，请直接输入新症状。',
    },
  ];

  const userText =
    detail.raw_input?.trim() ||
    detail.structured_input?.symptoms?.map((s) => s.standard_term ?? s.name).join('、') ||
    '';
  if (userText) {
    messages.push({ id: createId(), role: 'user', text: userText });
  }

  if (detail.immediate_action?.trim()) {
    messages.push({ id: createId(), role: 'assistant', text: detail.immediate_action });
  }

  return messages;
}
