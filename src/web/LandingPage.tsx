import { DnaCanvas } from './DnaCanvas';
import './landing.css';

interface LandingPageProps {
  onEnter: () => void;
}

export function LandingPage({ onEnter }: LandingPageProps) {
  return (
    <section className="landing-root" aria-label="SABA 欢迎页" data-testid="landing-page">
      <div className="landing-canvas-layer" aria-hidden>
        <DnaCanvas densityMultiplier={1.5} alignment={0.5} />
      </div>

      <nav className="landing-layer landing-nav">
        <div className="landing-brand" aria-label="SABA">
          <span className="landing-brand__mark">S</span>
          <span>
            <strong>SABA</strong>
            <small>Side-effect assessment</small>
          </span>
        </div>
        <div className="landing-nav__status" role="status">
          <span className="landing-nav__pulse" aria-hidden />
          Safety protocol enabled
        </div>
        <span className="landing-nav__badge">乳腺癌支持照护</span>
      </nav>

      <main className="landing-layer landing-stage">
        <div className="landing-mission">
          <p className="landing-mission__index">CLINICAL SUPPORT · PROTOCOL 01</p>
          <h1>
            让每一次不适，
            <br />
            <em>都有下一步。</em>
          </h1>
          <p className="landing-mission__lead">
            SABA 帮助乳腺癌治疗中的患者梳理症状、识别风险信号，并生成下一步沟通建议。
          </p>

          <div className="landing-actions">
            <button
              type="button"
              className="landing-enter-btn"
              data-testid="landing-enter"
              onClick={onEnter}
            >
              <span>开始症状评估</span>
              <span aria-hidden>↗</span>
            </button>
            <p className="landing-actions__note">
              <span aria-hidden>◎</span>
              不诊断 · 不改药 · 紧急情况优先联系医疗机构
            </p>
          </div>
        </div>

        <aside className="landing-brief" aria-label="评估过程说明">
          <div className="landing-brief__head">
            <div>
              <span className="landing-brief__eyebrow">CARE BRIEF / 001</span>
              <h2>一次评估，完成三件事</h2>
            </div>
            <span className="landing-brief__seal">S</span>
          </div>

          <ol className="landing-brief__steps">
            <li>
              <span className="landing-brief__number">01</span>
              <div>
                <strong>理解症状</strong>
                <p>结合治疗阶段，追问真正影响风险判断的信息。</p>
              </div>
            </li>
            <li>
              <span className="landing-brief__number">02</span>
              <div>
                <strong>识别风险</strong>
                <p>对照循证规则与安全边界，区分观察、咨询与升级处理。</p>
              </div>
            </li>
            <li>
              <span className="landing-brief__number">03</span>
              <div>
                <strong>给出下一步</strong>
                <p>用清晰语言说明该做什么、关注什么，以及何时联系医疗团队。</p>
              </div>
            </li>
          </ol>

          <div className="landing-brief__footer">
            <span>CONTEXT-AWARE</span>
            <span>SAFETY-CONSTRAINED</span>
            <span>AUDITABLE</span>
          </div>
        </aside>
      </main>

      <footer className="landing-layer landing-proof" aria-label="产品能力">
        <div>
          <span className="landing-proof__icon">01</span>
          <p><strong>连续上下文</strong><small>以治疗事件而非聊天记录理解变化</small></p>
        </div>
        <div>
          <span className="landing-proof__icon">02</span>
          <p><strong>安全约束</strong><small>建议生成前注入风险底线与禁区</small></p>
        </div>
        <div>
          <span className="landing-proof__icon">03</span>
          <p><strong>评估留痕</strong><small>风险结论、证据与处理过程可回看</small></p>
        </div>
      </footer>
    </section>
  );
}
