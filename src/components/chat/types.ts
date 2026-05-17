export type ConversationPhase = 'chat';

export interface ChatMessageItem {
  id: string;
  role: 'assistant' | 'user';
  text: string;
}
