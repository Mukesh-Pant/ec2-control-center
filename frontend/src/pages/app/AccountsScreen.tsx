import { ScreenPlaceholder } from './ScreenPlaceholder';

export default function AccountsScreen() {
  return (
    <ScreenPlaceholder
      eyebrow="Administration"
      title="Accounts"
      sub="AWS accounts managed by this portal — each with a cross-account IAM role."
      emptyIcon="Building2"
    />
  );
}
