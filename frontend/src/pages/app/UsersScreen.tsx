import { ScreenPlaceholder } from './ScreenPlaceholder';

export default function UsersScreen() {
  return (
    <ScreenPlaceholder
      eyebrow="Administration"
      title="Users"
      sub="Manage user roles and per-account access permissions."
      emptyIcon="UserCog"
    />
  );
}
