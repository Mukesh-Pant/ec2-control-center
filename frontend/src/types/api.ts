/** Typed shapes for every Lambda JSON response. Field names match the Python dicts exactly. */

export interface Instance {
  instanceId: string;
  name: string;
  state: string;          // 'running' | 'stopped' | 'pending' | 'stopping' | etc.
  instanceType: string;
  publicIp: string;
  platform: 'Linux' | 'Windows';
  storageGb: number;
  elasticIp: string;
  region: string;
  accountId: string;
  accountName: string;
}

export interface InstancesResponse {
  instances: Instance[];
  pendingApproval?: boolean;
  noAccountsAssigned?: boolean;
}

export interface ActionResponse {
  message: string;
  state?: string;
  requestedBy?: string;
}

export interface Account {
  accountId: string;
  accountName: string;
  roleArn: string;
  consoleRoleArn: string;
  enabled: boolean;
  isCentral: boolean;
}

export interface AccountsResponse {
  accounts: Account[];
}

export interface AccountActionResponse {
  message: string;
  latencyMs?: number;
}

export interface AuditEntry {
  instanceId: string;
  instanceName: string;
  instanceType: string;
  action: string;
  userEmail: string;
  accountId: string;
  region: string;
  timestamp: string;
  date: string;
  details: string;
}

export interface AuditResponse {
  items: AuditEntry[];
  lastKey?: Record<string, unknown>;
}

export interface DailyEntry {
  date: string;
  instanceId: string;
  instanceName: string;
  instanceType: string;
  region: string;
  accountId: string;
  runningHours: number;
  estimatedCostUsd: number;
}

export interface DailyBillingResponse {
  days: DailyEntry[];
  instanceId?: string;
}

export interface UserAccount {
  accountId: string;
  accessLevel: string;
  grantedBy?: string;
}

export interface UserRecord {
  email: string;
  status: string;
  groups: string[];
  accountAssignments: UserAccount[];
}

export interface UsersResponse {
  users: UserRecord[];
}

export interface UserMutationResponse {
  message: string;
}

export interface RecoveryPoint {
  arn: string;
  creationDate: string;
  status: string;
  backupSizeBytes: number;
  instanceId: string;
  accountId: string;
}

export interface BackupPlan {
  planId: string;
  planName: string;
  scheduleExpression: string;
  startWindowMinutes?: number;
}

export interface BackupListResponse {
  recoveryPoints: RecoveryPoint[];
  backupPlans: BackupPlan[];
}

export interface BackupMutationResponse {
  message: string;
  recoveryPointArn?: string;
  planId?: string;
}

export interface ConsoleLoginResponse {
  loginUrl: string;
  accountId: string;
  accountName: string;
}

// ── Labs (M11) ────────────────────────────────────────────────────────────

export interface LabVpc {
  vpcId: string;
  name: string;
  cidrBlock: string;
}

export interface LabSubnet {
  subnetId: string;
  name: string;
  cidrBlock: string;
  availabilityZone: string;
  vpcId: string;
}

export interface LabSecurityGroup {
  groupId: string;
  groupName: string;
  description: string;
  vpcId: string;
}

export interface LabNetworkOptions {
  vpcs: LabVpc[];
  subnets: LabSubnet[];
  securityGroups: LabSecurityGroup[];
}

export interface Lab {
  labId: string;
  labName: string;
  userEmail: string;
  accountId: string;
  region: string;
  instanceId?: string;
  instanceType: string;
  platform: 'ubuntu' | 'windows';
  storageGb: number;
  elasticIp: boolean;
  subnetId: string;
  securityGroupIds: string; // JSON-encoded string from backend
  durationHours: number;
  expiresAt?: string;
  status: 'pending_approval' | 'provisioning' | 'running' | 'stopped' | 'terminated' | 'rejected';
  estimatedCost?: number;
  paymentS3Key?: string;
  publicIp?: string;
  keyName?: string;
  keyS3Key?: string;
  allocationId?: string;
  createdAt?: string;
  amiId?: string;
  publicDns?: string;
  paymentStatus?: string;   // 'paid' | 'pending'
  warningSent?: boolean;
}

export interface LabsListResponse {
  labs: Lab[];
}

export interface LabMutationResponse {
  labId?: string;
  instanceId?: string;
  status?: string;
  estimatedCost?: number;
  message?: string;
}

export interface LabPricingBreakdown {
  ec2Hourly: number;
  ec2Cost: number;
  ebsCost: number;
  ebsPerGbMonth: number;
  eipCost: number;
  eipHourly: number;
  dataTransferCost: number;
  backupCost: number;
  monitoringCost: number;
  includeBackup: boolean;
  includeMonitoring: boolean;
  currencyRate: number;
  currencyCode: string;
  totalUsd: number;
  subtotalUsd: number;
  whtPercent: number;
  whtAmount: number;
  totalAfterWht: number;
  discountPercent: number;
  discountAmount: number;
  totalBeforeVat: number;
  vatPercent: number;
  vatAmount: number;
  finalTotalUsd: number;
  marginPercent?: number; // admin-only
  marginAmount?: number;  // admin-only
}

export interface LabPricingResponse {
  breakdown: LabPricingBreakdown;
  runningHours: number;
  totalDays: number;
  hoursPerDay: number;
  pricingSource: string;
}

export interface LabPaymentUploadResponse {
  paymentKey: string; // s3 key; pass as paymentKey in submit body
}

export interface LabUrlResponse {
  url: string; // presigned URL — used for keypair download, payment view
}

export interface LabWindowsPasswordResponse {
  password?: string;
  message?: string;
}

export interface LabTemplate {
  id: string;
  name: string;
  description: string;
  badge?: string;
  badgeClass: string;
  icon: string;
  instanceType: string;
  vcpu: number;
  ram: string;
  storageGb: number;
  platform: 'ubuntu' | 'windows';
  elasticIp: boolean;
  detailedMonitor: boolean;
  useCases: string[];
}

export interface LabTemplatesResponse {
  templates: LabTemplate[];
  message?: string;
}

export interface LabPricingSettings {
  whtPercent: number;
  vatPercent: number;
  marginPercent: number;
  dataTransferMonthlyUsd: number;
  includeBackup: boolean;
  includeMonitoring: boolean;
  currencyRate: number;
  currencyCode: string;
  usdToInrRate: number;
  discountPercent: number;
  showBreakdown: boolean;
}

export interface LabPricingSettingsResponse {
  settings: LabPricingSettings;
  message?: string;
}

// ── Finance module ────────────────────────────────────────────────────────

export interface Vendor {
  entityId: string;
  name: string;
  category: string;
  billingType: 'recurring' | 'one-time' | 'variable';
  currency: 'USD' | 'NPR' | 'INR';
  amount: number;
  agreementEnd?: string;   // ISO date YYYY-MM-DD
  manualStatus: 'active' | 'inactive';
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface VendorsResponse {
  items: Vendor[];
}

export interface VendorMutationResponse {
  vendorId?: string;
  deleted?: string;
}

export interface Customer {
  entityId: string;
  name: string;
  type: 'Business' | 'Individual';
  currency: 'USD' | 'NPR' | 'INR';
  contractValue: number;
  outstandingAmount: number;
  nextDueDate?: string;   // ISO date YYYY-MM-DD — triggers payment alerts
  agreementEnd?: string;  // ISO date YYYY-MM-DD — triggers contract expiry alerts
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CustomersResponse {
  items: Customer[];
}

export interface CustomerMutationResponse {
  customerId?: string;
  deleted?: string;
}

export interface FinanceSettings {
  usdToNpr: number;
  inrToNpr: number;
  expiryWarningDays: number;
  paymentWarningDays: number;
  defaultCurrency: 'USD' | 'NPR' | 'INR';
  wht_rate: number;     // decimal, e.g. 0.18 = 18%
  margin_rate: number;  // decimal
  vat_rate: number;     // decimal
  taxAccounts: Record<string, { wht?: number; vat?: number; margin?: number; rebate?: number }>;
}

export interface FinanceSettingsMutationResponse {
  saved: boolean;
}

export type FinanceAlertType =
  | 'vendor_expired'
  | 'vendor_expiring'
  | 'payment_overdue'
  | 'payment_due'
  | 'milestone_overdue'
  | 'contract_expiring';

export type FinanceAlertSeverity = 'critical' | 'warning';

export interface FinanceAlert {
  type: FinanceAlertType;
  severity: FinanceAlertSeverity;
  entityType: 'VENDOR' | 'CUSTOMER';
  entityId: string;
  entityName: string;
  message: string;
  link: string;
}

export interface FinanceAlertsResponse {
  alerts: FinanceAlert[];
}
