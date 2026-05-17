const TRUST_ITEMS = [
  { id: 'evidence', label: '循证规则引擎', icon: '◆' },
  { id: 'privacy', label: '会话级隐私', icon: '◇' },
  { id: 'care', label: '协同照护通道', icon: '○' },
] as const;

export function TrustStrip() {
  return (
    <ul className="saba-trust-strip" aria-label="服务说明">
      {TRUST_ITEMS.map(item => (
        <li key={item.id} className="saba-trust-strip__item">
          <span className="saba-trust-strip__icon" aria-hidden>
            {item.icon}
          </span>
          <span>{item.label}</span>
        </li>
      ))}
    </ul>
  );
}
