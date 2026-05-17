import { useEffect, useId, useMemo, useState } from 'react';
import type { BaselineOptionGroup } from '../../lib/baseline-field-presets';
import { loadCustomBaselineOptions, saveCustomBaselineOption } from '../../lib/baseline-field-presets';

const ADD_CUSTOM_VALUE = '__add_custom__';

export interface CreatableSelectOption {
  value: string;
  label: string;
}

export interface CreatableSelectProps {
  fieldKey: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  presets?: CreatableSelectOption[];
  presetGroups?: BaselineOptionGroup[];
  placeholder?: string;
  emptyOption?: { value: string; label: string };
  disabled?: boolean;
  required?: boolean;
  hint?: string;
}

function mergeSelectOptions(
  presetValues: CreatableSelectOption[],
  customs: CreatableSelectOption[],
  currentValue?: string,
): CreatableSelectOption[] {
  const map = new Map<string, string>();
  for (const option of [...presetValues, ...customs]) {
    map.set(option.value, option.label);
  }
  const trimmed = currentValue?.trim();
  if (trimmed && trimmed !== ADD_CUSTOM_VALUE && !map.has(trimmed)) {
    map.set(trimmed, trimmed);
  }
  return Array.from(map.entries()).map(([v, l]) => ({ value: v, label: l }));
}

function flattenPresetOptions(
  presets?: CreatableSelectOption[],
  presetGroups?: BaselineOptionGroup[],
): CreatableSelectOption[] {
  if (presetGroups?.length) {
    return presetGroups.flatMap((group) => group.options);
  }
  return presets ?? [];
}

export function CreatableSelect({
  fieldKey,
  label,
  value,
  onChange,
  presets,
  presetGroups,
  placeholder = '请选择',
  emptyOption,
  disabled,
  required,
  hint,
}: CreatableSelectProps) {
  const selectId = useId();
  const customInputId = useId();
  const [customOptions, setCustomOptions] = useState<CreatableSelectOption[]>([]);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customDraft, setCustomDraft] = useState('');

  const flatPresets = useMemo(
    () => flattenPresetOptions(presets, presetGroups),
    [presets, presetGroups],
  );

  useEffect(() => {
    setCustomOptions(loadCustomBaselineOptions(fieldKey));
  }, [fieldKey]);

  const orphanOptions = useMemo(() => {
    const presetValues = new Set(flatPresets.map((option) => option.value));
    const customValues = new Set(customOptions.map((option) => option.value));
    const merged = mergeSelectOptions(flatPresets, customOptions, value);
    return merged.filter(
      (option) => !presetValues.has(option.value) && !customValues.has(option.value),
    );
  }, [flatPresets, customOptions, value]);

  const selectValue = showCustomInput ? ADD_CUSTOM_VALUE : value || (emptyOption?.value ?? '');

  const handleSelectChange = (next: string) => {
    if (next === ADD_CUSTOM_VALUE) {
      setShowCustomInput(true);
      setCustomDraft('');
      return;
    }
    setShowCustomInput(false);
    setCustomDraft('');
    onChange(next);
  };

  const handleAddCustom = () => {
    const trimmed = customDraft.trim();
    if (!trimmed) {
      return;
    }
    saveCustomBaselineOption(fieldKey, trimmed);
    setCustomOptions(loadCustomBaselineOptions(fieldKey));
    setShowCustomInput(false);
    setCustomDraft('');
    onChange(trimmed);
  };

  return (
    <div className={`creatable-select ${disabled ? 'creatable-select--disabled' : ''}`}>
      <label className="creatable-select__label" htmlFor={selectId}>
        {label}
        {required ? <span className="creatable-select__required">必填</span> : null}
      </label>

      {hint ? <p className="creatable-select__hint">{hint}</p> : null}

      <select
        id={selectId}
        className="creatable-select__control"
        value={selectValue}
        onChange={(event) => handleSelectChange(event.target.value)}
        disabled={disabled}
        required={required && !emptyOption}
      >
        {emptyOption ? <option value={emptyOption.value}>{emptyOption.label}</option> : null}
        {!value && !emptyOption ? <option value="">{placeholder}</option> : null}

        {presetGroups?.map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </optgroup>
        ))}

        {!presetGroups &&
          flatPresets.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}

        {customOptions.length > 0 ? (
          <optgroup label="我的自定义">
            {customOptions.map((option) => (
              <option key={`custom-${option.value}`} value={option.value}>
                {option.label}
              </option>
            ))}
          </optgroup>
        ) : null}

        {orphanOptions.map((option) => (
          <option key={`orphan-${option.value}`} value={option.value}>
            {option.label}
          </option>
        ))}

        <option value={ADD_CUSTOM_VALUE}>＋ 添加自定义…</option>
      </select>

      {showCustomInput ? (
        <div className="creatable-select__custom">
          <input
            id={customInputId}
            type="text"
            className="creatable-select__input"
            placeholder="输入后点击添加"
            value={customDraft}
            onChange={(event) => setCustomDraft(event.target.value)}
            disabled={disabled}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                handleAddCustom();
              }
            }}
          />
          <div className="creatable-select__custom-actions">
            <button
              type="button"
              className="creatable-select__btn creatable-select__btn--primary"
              onClick={handleAddCustom}
              disabled={disabled || !customDraft.trim()}
            >
              添加
            </button>
            <button
              type="button"
              className="creatable-select__btn"
              onClick={() => {
                setShowCustomInput(false);
                setCustomDraft('');
              }}
              disabled={disabled}
            >
              取消
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
