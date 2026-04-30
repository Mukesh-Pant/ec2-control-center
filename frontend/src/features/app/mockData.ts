// Mock data mirroring the real app's shape. Used by Phase 5 screens until
// the API client (Phase 6) is wired up. All field names match the legacy
// `frontend/js/*` modules so swapping in real data is a one-line change.

export type AccountKind = 'central' | 'member';

export interface Account {
  id: string;
  name: string;
  role: 'Central' | 'Member';
  status: 'enabled' | 'disabled';
  region: string;
  kind: AccountKind;
}

export type InstanceState = 'running' | 'stopped' | 'pending';

export interface Instance {
  id: string;
  name: string;
  account: string;
  accountId: string;
  type: string;
  state: InstanceState;
  region: string;
  ip: string;
  cost: number;
}

export interface Template {
  id: string;
  name: string;
  tag: string;
  desc: string;
  cpu: number;
  ram: string;
  disk: string;
  stack: string[];
  price: number;
  icon: string;
}

export interface AuditEntry {
  ts: string;
  action: 'start' | 'stop' | 'auto-stop' | 'terminate';
  instance: string;
  iid: string;
  type: string;
  account: string;
  region: string;
  user: string;
}

export interface User {
  email: string;
  role: 'admin' | 'operator' | 'viewer';
  status: 'confirmed' | 'pending';
  access: string;
}

export const ACCOUNTS: Account[] = [
  {
    id: '976792586566',
    name: 'Central Account',
    role: 'Central',
    status: 'enabled',
    region: 'ap-south-1',
    kind: 'central',
  },
  {
    id: '196750375951',
    name: 'Mukesh-Testing',
    role: 'Member',
    status: 'enabled',
    region: 'us-east-1',
    kind: 'member',
  },
];

export const INSTANCES: Instance[] = [
  {
    id: 'i-076355d828b48aca',
    name: 'OneCloudUtopia-Backend',
    account: 'Central Account',
    accountId: '976792586566',
    type: 't3.medium',
    state: 'running',
    region: 'ap-south-1',
    ip: '13.204.51.197',
    cost: 29.95,
  },
  {
    id: 'i-0875bff179f152628',
    name: 'Navigator_Web',
    account: 'Central Account',
    accountId: '976792586566',
    type: 'm6i.xlarge',
    state: 'stopped',
    region: 'ap-south-1',
    ip: '13.204.212.204',
    cost: 0,
  },
  {
    id: 'i-3ebdbd9c4ab678374',
    name: 'dinesh-new-ec2',
    account: 'Mukesh-Testing',
    accountId: '196750375951',
    type: 't2.micro',
    state: 'stopped',
    region: 'us-east-1',
    ip: '—',
    cost: 0,
  },
];

export const TEMPLATES: Template[] = [
  {
    id: 'starter',
    name: 'Starter Blog',
    tag: 'Most Affordable',
    desc: 'Personal websites, portfolios, and blogs.',
    cpu: 2,
    ram: '1 GB',
    disk: '20 GB SSD',
    stack: ['WordPress', 'Ghost', 'Static sites'],
    price: 1307.24,
    icon: 'NotebookPen',
  },
  {
    id: 'dev',
    name: 'Dev Sandbox',
    tag: 'Best Value',
    desc: 'Development, testing, and CI environments.',
    cpu: 2,
    ram: '4 GB',
    disk: '30 GB SSD',
    stack: ['Node.js', 'Python', 'Docker'],
    price: 3152.38,
    icon: 'TerminalSquare',
  },
  {
    id: 'ecom',
    name: 'E-Commerce',
    tag: 'Popular',
    desc: 'Online stores with moderate traffic.',
    cpu: 2,
    ram: '8 GB',
    disk: '50 GB SSD',
    stack: ['WooCommerce', 'Magento', 'Shopify self-hosted'],
    price: 5720.08,
    icon: 'ShoppingBag',
  },
  {
    id: 'analytics',
    name: 'Analytics Engine',
    tag: 'High Memory',
    desc: 'Data processing and analytics workloads.',
    cpu: 2,
    ram: '8 GB',
    disk: '100 GB SSD',
    stack: ['Jupyter', 'Pandas', 'Spark'],
    price: 7213.61,
    icon: 'BarChart3',
  },
  {
    id: 'api',
    name: 'API Service',
    tag: 'Developer Pick',
    desc: 'REST/GraphQL backends with predictable load.',
    cpu: 4,
    ram: '8 GB',
    disk: '60 GB SSD',
    stack: ['FastAPI', 'Express', 'Rails'],
    price: 4890.12,
    icon: 'Server',
  },
  {
    id: 'ml',
    name: 'ML Inference',
    tag: 'Specialized',
    desc: 'Light-model serving, embeddings, RAG.',
    cpu: 4,
    ram: '16 GB',
    disk: '120 GB SSD',
    stack: ['vLLM', 'ONNX', 'Transformers'],
    price: 9840.0,
    icon: 'Sparkles',
  },
];

export const AUDIT: AuditEntry[] = [
  { ts: '19 Apr 2026, 14:15:35', action: 'stop',  instance: 'Navigator_Web',          iid: 'i-0875bff179f152628', type: 'm6i.xlarge', account: '976792586566', region: 'ap-south-1', user: 'kandelmahesh39@gmail.com' },
  { ts: '19 Apr 2026, 12:03:12', action: 'start', instance: 'Navigator_Web',          iid: 'i-0875bff179f152628', type: 'm6i.xlarge', account: '976792586566', region: 'ap-south-1', user: 'kandelmahesh39@gmail.com' },
  { ts: '13 Apr 2026, 17:04:29', action: 'stop',  instance: 'Navigator_Web',          iid: 'i-0875bff179f152628', type: 'm6i.xlarge', account: '976792586566', region: 'ap-south-1', user: 'kandelmahesh39@gmail.com' },
  { ts: '13 Apr 2026, 12:37:30', action: 'start', instance: 'Navigator_Web',          iid: 'i-0875bff179f152628', type: 'm6i.xlarge', account: '976792586566', region: 'ap-south-1', user: 'kandelmahesh39@gmail.com' },
  { ts: '13 Apr 2026, 12:35:41', action: 'stop',  instance: 'Navigator_Web',          iid: 'i-0875bff179f152628', type: 'm6i.xlarge', account: '976792586566', region: 'ap-south-1', user: 'kandelmahesh39@gmail.com' },
  { ts: '13 Apr 2026, 10:10:12', action: 'start', instance: 'Navigator_Web',          iid: 'i-0875bff179f152628', type: 'm6i.xlarge', account: '976792586566', region: 'ap-south-1', user: 'sushant@onecloudutopia.com' },
  { ts: '12 Apr 2026, 14:43:44', action: 'start', instance: 'OneCloudUtopia-Backend', iid: 'i-076355d828b48aca', type: 't3.medium',  account: '976792586566', region: 'ap-south-1', user: 'kandelmahesh39@gmail.com' },
  { ts: '12 Apr 2026, 14:43:30', action: 'stop',  instance: 'Navigator_Web',          iid: 'i-0875bff179f152628', type: 'm6i.xlarge', account: '976792586566', region: 'ap-south-1', user: 'kandelmahesh39@gmail.com' },
  { ts: '12 Apr 2026, 14:43:15', action: 'stop',  instance: 'OneCloudUtopia-Backend', iid: 'i-076355d828b48aca', type: 't3.medium',  account: '976792586566', region: 'ap-south-1', user: 'kandelmahesh39@gmail.com' },
  { ts: '12 Apr 2026, 11:28:09', action: 'start', instance: 'Navigator_Web',          iid: 'i-0875bff179f152628', type: 'm6i.xlarge', account: '976792586566', region: 'ap-south-1', user: 'kandelmahesh39@gmail.com' },
];

export const USERS: User[] = [
  { email: 'kandelmahesh39@gmail.com',      role: 'operator', status: 'confirmed', access: '976792586566 · OPERATOR' },
  { email: 'joshiadarsh421@gmail.com',      role: 'operator', status: 'confirmed', access: '976792586566 · OPERATOR' },
  { email: 'sushant@onecloudutopia.com.np', role: 'admin',    status: 'confirmed', access: 'None' },
  { email: 'sushovan@onecloudutopia.com',   role: 'admin',    status: 'confirmed', access: 'None' },
  { email: 'info.upendrapn@gmail.com',      role: 'operator', status: 'confirmed', access: '196750375951 · OPERATOR' },
  { email: 'pantm8877@gmail.com',           role: 'admin',    status: 'confirmed', access: 'None' },
  { email: 'pantr8877@gmail.com',           role: 'operator', status: 'confirmed', access: '976792586566 · OPERATOR' },
];
