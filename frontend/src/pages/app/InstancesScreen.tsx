import { ScreenPlaceholder } from './ScreenPlaceholder';

export default function InstancesScreen() {
  return (
    <ScreenPlaceholder
      eyebrow="Fleet"
      title="Instances"
      sub="Servers grouped by account — click any row to inspect and control."
      emptyIcon="Server"
    />
  );
}
