import { ArrowRight } from 'lucide-react';
import { BrandMark } from '@/components/BrandMark';

interface Props {
  onLaunch: () => void;
}

export function MarketingNav({ onLaunch }: Props) {
  return (
    <nav className="mnav">
      <button className="mnav-brand" onClick={onLaunch} type="button">
        <span className="mnav-mark">
          <BrandMark size={14} />
        </span>
        One Cloud Utopia
      </button>
      <div className="mnav-links">
        <a href="#product">Product</a>
        <a href="#features">Features</a>
        <a href="#preview">Preview</a>
        <a href="#pricing">Pricing</a>
        <a href="#docs">Docs</a>
      </div>
      <div className="mnav-spacer" />
      <button className="mnav-cta ghost" onClick={onLaunch} type="button">
        Sign in
      </button>
      <button className="mnav-cta solid" onClick={onLaunch} type="button">
        Open dashboard
        <ArrowRight size={14} />
      </button>
    </nav>
  );
}
