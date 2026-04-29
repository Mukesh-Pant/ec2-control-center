import { useNavigate } from 'react-router-dom';
import { useRevealOnScroll } from '@/hooks/useRevealOnScroll';
import { useBentoParallax } from '@/hooks/useBentoParallax';
import { MarketingNav } from './MarketingNav';
import { Hero } from './Hero';
import { LogosStrip } from './LogosStrip';
import { BentoFeatures } from './BentoFeatures';
import { PreviewSection } from './PreviewSection';
import { StatsBand } from './StatsBand';
import { CtaBanner } from './CtaBanner';
import { MarketingFooter } from './MarketingFooter';
import './landing.css';

export default function LandingPage() {
  const navigate = useNavigate();
  const onLaunch = () => navigate('/login');

  useRevealOnScroll();
  useBentoParallax();

  return (
    <div className="landing">
      <MarketingNav onLaunch={onLaunch} />
      <Hero onLaunch={onLaunch} />
      <LogosStrip />
      <BentoFeatures />
      <PreviewSection />
      <StatsBand />
      <CtaBanner onLaunch={onLaunch} />
      <MarketingFooter />
    </div>
  );
}
