/**
 * Sidebar navigation config. Mirrors the live portal's tab set so every
 * existing M1-M12 feature has a slot. Icons use the lucide-react names
 * (PascalCase). Path = /app/{id}.
 */

export interface NavItem {
  id: string;
  label: string;
  icon: string;
  count?: number;
}

export interface NavSection {
  section: string;
  items: NavItem[];
}

export const NAV: NavSection[] = [
  {
    section: 'Overview',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: 'LayoutGrid' },
      { id: 'instances', label: 'Instances', icon: 'Server' },
      { id: 'backups', label: 'Backups', icon: 'HardDriveUpload' },
      { id: 'servers', label: 'My Servers', icon: 'Monitor' },
    ],
  },
  {
    section: 'Intelligence',
    items: [
      { id: 'billing', label: 'Billing & Cost', icon: 'Receipt' },
      { id: 'analytics', label: 'Analytics', icon: 'Activity' },
      { id: 'audit', label: 'Audit Log', icon: 'ScrollText' },
    ],
  },
  {
    section: 'Finance',
    items: [
      { id: 'vendors', label: 'Vendors', icon: 'Briefcase' },
      { id: 'customers', label: 'Customers', icon: 'Users' },
      { id: 'alerts', label: 'Alerts', icon: 'Bell' },
      { id: 'finsettings', label: 'Fin Settings', icon: 'SlidersHorizontal' },
    ],
  },
  {
    section: 'Administration',
    items: [
      { id: 'accounts', label: 'Accounts', icon: 'Building2' },
      { id: 'users', label: 'Users', icon: 'UserCog' },
      { id: 'lab-settings', label: 'Lab Settings', icon: 'Settings2' },
    ],
  },
];

export const PAGE_TITLES: Record<string, string> = {
  dashboard: 'Dashboard',
  instances: 'Instances',
  servers: 'My Servers',
  backups: 'Backups',
  billing: 'Billing & Cost',
  analytics: 'Analytics',
  audit: 'Audit Log',
  vendors: 'Vendors',
  customers: 'Customers',
  alerts: 'Alerts',
  finsettings: 'Finance Settings',
  accounts: 'Accounts',
  users: 'Users',
  'lab-settings': 'Lab Settings',
};

/**
 * Pages visible only to admins. Operators/viewers see them filtered out
 * of the Sidebar by AppShell.
 */
export const ADMIN_ONLY_PAGES = new Set(['accounts', 'users', 'lab-settings']);
