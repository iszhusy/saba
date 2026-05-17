import { useEffect, useRef } from 'react';

interface DnaCanvasProps {
  densityMultiplier?: number;
  alignment?: number;
  className?: string;
}

export function DnaCanvas({
  densityMultiplier = 1,
  alignment = 0.5,
  className = '',
}: DnaCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rawCtx = canvas.getContext('2d');
    if (!rawCtx) {
      throw new Error('2D canvas context is unavailable');
    }
    const ctx = rawCtx;

    const container = canvas.parentElement;
    if (!container) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let width = 0;
    let height = 0;
    let t = 0;
    let frameId = 0;
    let visible = true;
    const bases = ['A', 'T', 'C', 'G'] as const;

    class Particle {
      constructor(
        public y: number,
        public offset: number,
        public char: string,
      ) {}

      x = 0;
      screenY = 0;
      size = 12;
      alpha = 1;

      update(time: number) {
        const angle = this.y * 0.05 + time + this.offset;
        const radius = width < 768 ? 80 : 150;
        const x3d = Math.sin(angle) * radius;
        const z3d = Math.cos(angle) * radius;
        const fov = 1000;
        const scale = fov / (fov + z3d);
        this.x = width * alignment + x3d * scale;
        this.screenY = this.y * 15 * scale + height * 0.1;
        this.size = 12 * scale;
        this.alpha = scale > 1 ? 1 : 0.3;
      }

      draw() {
        ctx.font = `500 ${this.size}px "IBM Plex Mono", ui-monospace, monospace`;
        const ink = this.alpha;
        ctx.fillStyle = `rgba(20, 18, 16, ${ink * 0.85})`;
        ctx.textAlign = 'center';
        ctx.fillText(this.char, this.x, this.screenY);
      }
    }

    const particles: Particle[] = [];
    for (let i = 0; i < 80 * densityMultiplier; i++) {
      const char = bases[i % 4]!;
      const pairChar =
        char === 'A' ? 'T' : char === 'T' ? 'A' : char === 'C' ? 'G' : 'C';
      particles.push(new Particle(i, 0, char));
      particles.push(new Particle(i, Math.PI, pairChar));
    }

    const resize = () => {
      width = canvas.width = container.clientWidth;
      height = canvas.height = container.clientHeight;
    };

    const drawFrame = () => {
      ctx.clearRect(0, 0, width, height);
      const time = reducedMotion ? 0 : t;
      ctx.strokeStyle = 'rgba(158, 59, 50, 0.12)';
      for (let i = 0; i < particles.length; i += 2) {
        const p1 = particles[i]!;
        const p2 = particles[i + 1]!;
        p1.update(time);
        p2.update(time);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.screenY);
        ctx.lineTo(p2.x, p2.screenY);
        ctx.stroke();
        p1.draw();
        p2.draw();
      }
    };

    const animate = () => {
      if (!visible) return;
      drawFrame();
      if (!reducedMotion) {
        t += 0.008;
      }
      frameId = requestAnimationFrame(animate);
    };

    const visibilityObserver = new IntersectionObserver(
      ([entry]) => {
        visible = entry?.isIntersecting ?? true;
        if (visible && !frameId) {
          frameId = requestAnimationFrame(animate);
        }
      },
      { threshold: 0.05 },
    );

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    visibilityObserver.observe(container);
    resize();
    drawFrame();
    if (!reducedMotion) {
      frameId = requestAnimationFrame(animate);
    }

    return () => {
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      cancelAnimationFrame(frameId);
    };
  }, [densityMultiplier, alignment]);

  return (
    <canvas
      ref={canvasRef}
      className={`block h-full w-full ${className}`}
      aria-hidden
    />
  );
}
