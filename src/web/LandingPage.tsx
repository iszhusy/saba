import { DnaCanvas } from './DnaCanvas';
import './landing.css';

interface LandingPageProps {
  onEnter: () => void;
}

export function LandingPage({ onEnter }: LandingPageProps) {
  return (
    <section className="landing-root" aria-label="SABA 欢迎页">
      <div className="landing-canvas-layer" aria-hidden>
        <DnaCanvas densityMultiplier={1.5} alignment={0.5} />
      </div>

      <nav className="landing-layer landing-nav">
        <span>SABA // PROTOCOL 0.1</span>
        <span className="landing-nav__center">STATUS: READY</span>
        <span className="landing-nav__badge">乳腺癌护理</span>
      </nav>

      <div className="landing-layer landing-mission">
        <h2>
          理解
          <br />
          您的
          <br />
          每一次感受
        </h2>
        <p>
          基于循证医学与 AI 推理的副作用评估助手，7×24
          小时为您提供专业、即时的健康建议。
        </p>
      </div>

      <footer className="landing-layer landing-enter">
        <button type="button" className="landing-enter-btn" onClick={onEnter}>
          <span className="landing-enter-btn__label">进入评估终端</span>
          <span className="landing-enter-btn__cta">ENTER —</span>
        </button>
      </footer>
    </section>
  );
}
