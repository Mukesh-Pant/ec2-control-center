import { ArrowRight, MessageCircle } from 'lucide-react';

interface Props {
  onLaunch: () => void;
}

export function CtaBanner({ onLaunch }: Props) {
  return (
    <section className="cta-banner reveal" id="pricing">
      <h2>
        Ready to <span className="accent">unify</span> your cloud?
      </h2>
      <p>
        Open the dashboard, link an AWS account, and ship before lunch. No card. No demo gating.
        Just the cleanest control plane your team has ever used.
      </p>
      <div className="cta-row">
        <button className="hero-cta primary" onClick={onLaunch} type="button">
          Open dashboard
          <ArrowRight size={16} />
        </button>
        <button className="hero-cta ghost" type="button">
          <MessageCircle size={16} />
          Talk to sales
        </button>
      </div>
    </section>
  );
}
