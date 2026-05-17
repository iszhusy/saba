interface ChatComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  disabledReason?: string;
  placeholder?: string;
  quickTags?: string[];
}

export function ChatComposer({
  value,
  onChange,
  onSend,
  disabled,
  disabledReason,
  placeholder = '输入您的描述…',
  quickTags = [],
}: ChatComposerProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter') return;
    // Shift / ⌘ / Ctrl + Enter 插入换行；仅单独 Enter 发送
    if (e.shiftKey || e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    if (!disabled && value.trim()) onSend();
  };

  const hintId = 'chat-composer-hint';

  return (
    <div className="chat-composer" data-testid="chat-composer">
      {quickTags.length > 0 && (
        <div className="chat-composer__quick">
          <p className="chat-composer__quick-label">常见症状</p>
          <div className="chat-composer__tags" role="group" aria-label="常见症状快捷输入">
            {quickTags.map(tag => (
              <button
                key={tag}
                type="button"
                className="chat-composer__tag"
                disabled={disabled}
                onClick={() => {
                  const next = value.trim() ? `${value}，${tag}` : tag;
                  onChange(next);
                }}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="chat-composer__row">
        <textarea
          className="chat-composer__input"
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={2}
          disabled={disabled}
          maxLength={500}
          aria-describedby={hintId}
          aria-label="症状描述"
        />
        <button
          type="button"
          className="chat-composer__send"
          onClick={onSend}
          disabled={disabled || !value.trim()}
          aria-label={disabled ? disabledReason ?? '正在分析，请稍候' : '发送消息'}
        >
          →
        </button>
      </div>
      <p id={hintId} className="chat-composer__hint">
        {disabled && disabledReason
          ? disabledReason
          : 'Enter 发送 · Shift+Enter 或 ⌘+Enter 换行'}
      </p>
    </div>
  );
}
