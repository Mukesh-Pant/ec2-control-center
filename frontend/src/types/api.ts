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
  accounts: UserAccount[];
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
  loginUrl?: string;
}
