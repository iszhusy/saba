import { SymptomIcon } from '../ui/SymptomIcon';

export interface ChatOptionGroupProps {
  options: { id: string; label: string }[];
  mode: 'single' | 'multi';
  selected: string[];
  onToggle: (id: string) => void;
  onConfirm: () => void;
  confirmLabel?: string;
  confirmDisabled?: boolean;
  showIcons?: boolean;
}

export function ChatOptionGroup({
  options,
  mode,
  selected,
  onToggle,
  onConfirm,
  confirmLabel = '继续',
  confirmDisabled = false,
  showIcons = false,
}: ChatOptionGroupProps) {
  return (
    <div className="chat-options" role="group">
      <div className="chat-options__grid">
        {options.map(option => {
          const isSelected = selected.includes(option.id);
          return (
            <button
              key={option.id}
              type="button"
              className={`chat-option ${isSelected ? 'chat-option--selected' : ''}`}
              onClick={() => onToggle(option.id)}
              aria-pressed={isSelected}
            >
              {showIcons && (
                <SymptomIcon symptomId={option.id} className="chat-option__icon" />
              )}
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className="chat-options__confirm"
        onClick={onConfirm}
        disabled={confirmDisabled}
      >
        {confirmLabel}
      </button>
      {mode === 'multi' && (
        <p className="chat-options__hint">可多选，选好后点击继续</p>
      )}
    </div>
  );
}
