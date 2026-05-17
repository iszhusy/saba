import { useEffect, useRef, useState } from 'react';
import { SymptomIcon } from '../ui/SymptomIcon';
import type { AssessRequest } from '../../types/index';

interface AssessmentFormProps {
  userId: string;
  onSubmit: (request: AssessRequest) => Promise<void>;
  isLoading?: boolean;
  onDraftChange?: (hasDraft: boolean) => void;
}

const SYMPTOM_OPTIONS = [
  { id: 'nausea', label: '恶心呕吐' },
  { id: 'fatigue', label: '疲劳乏力' },
  { id: 'pain', label: '疼痛' },
  { id: 'fever', label: '发热' },
  { id: 'rash', label: '皮疹' },
  { id: 'other', label: '其他' },
] as const;

const DURATION_OPTIONS = [
  { value: 'hours', label: '几小时', subLabel: '今天开始' },
  { value: '1day', label: '1天', subLabel: '昨天开始' },
  { value: '2-3days', label: '2-3天', subLabel: '持续中' },
  { value: 'week', label: '一周以上', subLabel: '比较久了' },
  { value: 'uncertain', label: '不确定', subLabel: '说不清多久' },
] as const;

const QUICK_TAGS = ['轻微', '剧烈', '间歇性', '持续性'] as const;

const PLACEHOLDER =
  '例如：饭后感到轻微恶心，持续约 20 分钟，休息后有所缓解';

export function AssessmentForm({
  userId,
  onSubmit,
  isLoading,
  onDraftChange,
}: AssessmentFormProps) {
  const [input, setInput] = useState('');
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [duration, setDuration] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const hasDraft =
    input.trim().length > 0 || selectedSymptoms.length > 0 || duration.length > 0;

  useEffect(() => {
    onDraftChange?.(hasDraft);
  }, [hasDraft, onDraftChange]);

  const handleSymptomToggle = (symptomId: string) => {
    setSelectedSymptoms(prev =>
      prev.includes(symptomId) ? prev.filter(s => s !== symptomId) : [...prev, symptomId],
    );
  };

  const appendQuickTag = (tag: string) => {
    setInput(prev => {
      if (!prev.trim()) return tag;
      if (prev.includes(tag)) return prev;
      return `${prev}，${tag}`;
    });
    textareaRef.current?.focus();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let fullInput = input;

    if (selectedSymptoms.length > 0) {
      const labels = selectedSymptoms
        .map(id => SYMPTOM_OPTIONS.find(s => s.id === id)?.label)
        .filter(Boolean)
        .join('、');
      fullInput = fullInput.trim() ? `${labels}，${fullInput}` : labels;
    }

    if (duration) {
      const durationLabel = DURATION_OPTIONS.find(d => d.value === duration)?.label;
      fullInput = `${fullInput}，持续${durationLabel}`;
    }

    if (!fullInput.trim()) return;

    await onSubmit({
      user_id: userId,
      input: fullInput,
      context: { treatment_phase: 'chemotherapy_cycle' },
    });
  };

  const canSubmit = input.trim().length > 0 || selectedSymptoms.length > 0;

  return (
    <form onSubmit={handleSubmit} className="saba-form">
      <section className="saba-form__section" aria-labelledby="symptom-label">
        <h3 id="symptom-label" className="saba-section-label">
          选择不适类型
          <span className="saba-section-hint">（可多选）</span>
        </h3>
        <div className="saba-form__body saba-chip-grid" role="group" aria-label="症状类型">
          {SYMPTOM_OPTIONS.map(symptom => {
            const isSelected = selectedSymptoms.includes(symptom.id);
            return (
              <button
                key={symptom.id}
                type="button"
                className={`saba-chip ${isSelected ? 'saba-chip--selected' : ''}`}
                onClick={() => handleSymptomToggle(symptom.id)}
                aria-pressed={isSelected}
              >
                <SymptomIcon symptomId={symptom.id} className="saba-chip__icon" />
                <span className="saba-chip__label">{symptom.label}</span>
                {isSelected && (
                  <span className="saba-chip__check" aria-hidden>
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <section className="saba-form__section" aria-labelledby="detail-label">
        <h3 id="detail-label" className="saba-section-label">
          详细描述
        </h3>
        <div className="saba-form__body">
          <div className="saba-quick-tags" role="group" aria-label="快捷描述">
            {QUICK_TAGS.map(tag => (
              <button
                key={tag}
                type="button"
                className="saba-quick-tag"
                onClick={() => appendQuickTag(tag)}
              >
                {tag}
              </button>
            ))}
          </div>
          <div className="saba-textarea-wrap">
            <textarea
              ref={textareaRef}
              id="input"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={PLACEHOLDER}
              rows={4}
              className="saba-textarea"
              maxLength={500}
            />
            <span className="saba-char-count">{input.length}/500</span>
          </div>
        </div>
      </section>

      <section className="saba-form__section" aria-labelledby="duration-label">
        <h3 id="duration-label" className="saba-section-label">
          持续时间
        </h3>
        <div className="saba-form__body saba-pill-row" role="group" aria-label="持续时间">
          {DURATION_OPTIONS.map(option => {
            const isSelected = duration === option.value;
            return (
              <button
                key={option.value}
                type="button"
                className={`saba-pill ${isSelected ? 'saba-pill--selected' : ''}`}
                onClick={() => setDuration(duration === option.value ? '' : option.value)}
                aria-pressed={isSelected}
              >
                <span>{option.label}</span>
                <span className="saba-pill__sub">{option.subLabel}</span>
              </button>
            );
          })}
        </div>
      </section>

      <button type="submit" className="saba-submit" disabled={isLoading || !canSubmit}>
        {isLoading ? '评估中…' : '开始评估 →'}
      </button>

      <p className="saba-disclaimer">
        本系统仅供辅助参考，不能替代专业医疗建议
        <br />
        如有紧急情况，请立即就医
      </p>
    </form>
  );
}
