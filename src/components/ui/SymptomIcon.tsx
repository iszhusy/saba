interface SymptomIconProps {
  symptomId: string;
  className?: string;
}

const svgProps = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function SymptomIcon({ symptomId, className }: SymptomIconProps) {
  switch (symptomId) {
    case 'nausea':
      return (
        <svg {...svgProps} className={className} aria-hidden>
          <path d="M12 3c-2 4-4 6-4 9a4 4 0 0 0 8 0c0-3-2-5-4-9z" />
          <path d="M8 21h8" />
        </svg>
      );
    case 'fatigue':
      return (
        <svg {...svgProps} className={className} aria-hidden>
          <path d="M12 3v4M12 17v4M5 12H3M21 12h-2M6 6l-1.5-1.5M19.5 19.5L18 18M18 6l1.5-1.5M4.5 19.5L6 18" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case 'pain':
      return (
        <svg {...svgProps} className={className} aria-hidden>
          <path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z" />
        </svg>
      );
    case 'fever':
      return (
        <svg {...svgProps} className={className} aria-hidden>
          <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
        </svg>
      );
    case 'rash':
      return (
        <svg {...svgProps} className={className} aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <circle cx="9" cy="10" r="1" fill="currentColor" stroke="none" />
          <circle cx="15" cy="9" r="1" fill="currentColor" stroke="none" />
          <circle cx="14" cy="14" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    default:
      return (
        <svg {...svgProps} className={className} aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v8M8 12h8" />
        </svg>
      );
  }
}
