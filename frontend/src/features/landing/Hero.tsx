import { ArrowRight, PlayCircle } from 'lucide-react';
import { HeroPreviewCard } from './HeroPreviewCard';

interface Props {
  onLaunch: () => void;
}

export function Hero({ onLaunch }: Props) {
  return (
    <section className="hero" id="product">
      <div>
        <div className="hero-eyebrow">
          <span className="pulse" />
          Now in production · v2.4
        </div>
        <h1>
          <span className="grad">Your cloud,</span>
          <br />
          <span className="grad">unified.</span>
          <br />
          <span className="accent">Simplified.</span>
        </h1>
        <p className="hero-lead">
          Start, stop, and monitor every EC2 instance across every AWS account from a single,
          dimensional control plane. Built for teams who refuse to console-hop.
        </p>
        <div className="hero-cta-row">
          <button className="hero-cta primary" onClick={onLaunch} type="button">
            Open dashboard
            <ArrowRight size={16} />
          </button>
          <button className="hero-cta ghost" type="button">
            <PlayCircle size={16} />
            Watch the tour
          </button>
        </div>
        <div className="hero-trust">
          <div className="dots">
            <span />
            <span />
            <span />
            <span />
          </div>
          <span>
            Trusted by teams managing <strong style={{ color: '#fff' }}>14,000+</strong> instances
            across 6 regions
          </span>
        </div>
      </div>
      <HeroPreviewCard />
    </section>
  );
}
