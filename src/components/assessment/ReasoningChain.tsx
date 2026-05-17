import type { Evidence } from '../../types/index';

interface ReasoningChainProps {
  evidence: Evidence[];
  reasoningChain: string[];
}

const TYPE_LABELS: Record<Evidence['type'], string> = {
  rule_match: '规则匹配',
  rag_reference: '知识库参考',
  llm_reasoning: '综合判断',
};

export function ReasoningChain({ evidence, reasoningChain }: ReasoningChainProps) {
  return (
    <div className="saba-reasoning">
      <h2>评估推理过程</h2>
      <p className="saba-reasoning__sub">了解系统如何得出结论</p>

      <div>
        {evidence.map((item, index) => (
          <article key={`${item.type}-${index}`} className="saba-reasoning-step">
            <span className="saba-reasoning-step__index">
              {String(index + 1).padStart(2, '0')}
            </span>
            <div>
              <p className="saba-reasoning-step__type">
                {TYPE_LABELS[item.type]}
              </p>
              <p className="saba-reasoning-step__content">{item.description}</p>
              {item.source && (
                <p
                  className="saba-reasoning-step__type"
                  style={{ marginTop: '0.35rem' }}
                >
                  来源: {item.source}
                </p>
              )}
            </div>
          </article>
        ))}
      </div>

      {reasoningChain.length > 0 && (
        <div style={{ marginTop: '2rem' }}>
          <p className="saba-reasoning-step__type">推理链</p>
          <ul
            style={{
              margin: '0.5rem 0 0',
              paddingLeft: '1.25rem',
              fontSize: '0.85rem',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            {reasoningChain.map((step, i) => (
              <li key={i} style={{ marginBottom: '0.35rem' }}>
                {step}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
