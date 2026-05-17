interface ChatComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  placeholder?: string;
  quickTags?: string[];
}

export function ChatComposer({
  value,
  onChange,
  onSend,
  disabled,
  placeholder = '输入您的描述…',
  quickTags = [],
}: ChatComposerProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && value.trim()) onSend();
    }
  };

  return (
    <div className="chat-composer">
      {quickTags.length > 0 && (
        <div className="chat-composer__tags">
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
        />
        <button
          type="button"
          className="chat-composer__send"
          onClick={onSend}
          disabled={disabled || !value.trim()}
          aria-label="发送"
        >
          →
        </button>
      </div>
    </div>
  );
}
