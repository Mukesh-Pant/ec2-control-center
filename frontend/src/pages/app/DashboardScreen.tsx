import { ScreenPlaceholder } from './ScreenPlaceholder';

export default function DashboardScreen() {
  return (
    <ScreenPlaceholder
      eyebrow="Fleet overview"
      title="Dashboard"
      sub="Real-time fleet overview across every linked AWS account. Updated continuously."
      emptyIcon="LayoutGrid"
      emptyTitle="Phase 5 next"
      emptyDesc="The Dashboard renders Quick Actions, fleet stats, and a quick-control list once the screens phase ships."
    />
  );
}
