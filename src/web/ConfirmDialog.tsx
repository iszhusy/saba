interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = '确认离开',
  cancelLabel = '继续填写',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      className="saba-modal-backdrop"
      role="presentation"
      onClick={onCancel}
      onKeyDown={e => e.key === 'Escape' && onCancel()}
    >
      <div
        className="saba-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="saba-modal-title"
        onClick={e => e.stopPropagation()}
      >
        <h2 id="saba-modal-title" className="saba-modal__title">
          {title}
        </h2>
        <p className="saba-modal__message">{message}</p>
        <div className="saba-modal__actions">
          <button type="button" className="saba-btn saba-btn--ghost" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className="saba-btn" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
