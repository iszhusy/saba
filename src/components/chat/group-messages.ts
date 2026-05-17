import type { ChatMessageItem } from './types';

export interface MessageGroup {
  role: ChatMessageItem['role'];
  items: ChatMessageItem[];
}

/** 合并连续同角色消息，减少气泡碎片化 */
export function groupConsecutiveMessages(messages: ChatMessageItem[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  for (const msg of messages) {
    const last = groups[groups.length - 1];
    if (last && last.role === msg.role) {
      last.items.push(msg);
    } else {
      groups.push({ role: msg.role, items: [msg] });
    }
  }
  return groups;
}
