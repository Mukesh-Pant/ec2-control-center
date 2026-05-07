// src/pages/app/labs/LabList.tsx
import { useState } from 'react';
import { EmptyState } from '@/components/ui';
import type { Lab } from '@/types/api';
import { useLabsList } from '@/lib/queries/labs';
import { useAccounts } from '@/lib/queries/accounts';
import { getRole } from '@/lib/auth';
import { LabRow } from './LabRow';

type Bucket = 'active' | 'pending' | 'history';

const BUCKET_STATUSES: Record<Bucket, Lab['status'][]> = {
  active:  ['running', 'provisioning'],
  pending: ['pending_approval'],
  history: ['terminated', 'rejected'],
};

interface Filters {
  platform: string;
  instanceType: string;
  status: string;
  account: string;
}

const EMPTY_FILTERS: Filters = { platform: '', instanceType: '', status: '', account: '' };

function bucketCount(labs: Lab[], bucket: Bucket): number {
  return labs.filter((l) => (BUCKET_STATUSES[bucket] as string[]).includes(l.status)).length;
}

export function LabList() {
  const role = getRole();
  const isAdmin = role === 'admin';
  const { data, isLoading, error } = useLabsList();
  const { data: acctData } = useAccounts();
  const labs = data?.labs ?? [];
  const accountMap = Object.fromEntries(
    (acctData?.accounts ?? []).map((a) => [a.accountId, a.accountName]),
  );

  const [bucket, setBucket] = useState<Bucket>('active');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const bucketLabs = labs.filter((l) => (BUCKET_STATUSES[bucket] as string[]).includes(l.status));

  const visibleLabs = bucketLabs.filter((l) => {
    if (filters.platform && l.platform !== filters.platform) return false;
    if (filters.instanceType && l.instanceType !== filters.instanceType) return false;
    if (filters.status && l.status !== filters.status) return false;
    if (filters.account && l.accountId !== filters.account) return false;
    return true;
  });

  const hasFilters = Object.values(filters).some(Boolean);
  const uniqueTypes    = [...new Set(bucketLabs.map((l) => l.instanceType))];
  const uniqueStatuses = [...new Set(bucketLabs.map((l) => l.status))];
  const uniqueAccounts = [...new Set(bucketLabs.map((l) => l.accountId))];

  const setFilter = (key: keyof Filters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const toggleRow = (labId: string) => {
    setExpandedId((prev) => (prev === labId ? null : labId));
  };

  const switchBucket = (b: Bucket) => {
    setBucket(b);
    setFilters(EMPTY_FILTERS);
    setExpandedId(null);
  };

  const EMPTY_MESSAGES: Record<Bucket, { title: string; description: string }> = {
    active:  { title: 'No active labs', description: 'Provision one using the New Lab button above.' },
    pending: { title: 'No pending labs', description: 'Submitted labs awaiting admin approval will appear here.' },
    history: { title: 'No lab history', description: 'Terminated and rejected labs will appear here.' },
  };

  return (
    <div>
      {/* Bucket tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {(['active', 'pending', 'history'] as Bucket[]).map((b) => {
          const count = bucketCount(labs, b);
          return (
            <button
              key={b}
              type="button"
              onClick={() => switchBucket(b)}
              style={{
                padding: '6px 14px',
                borderRadius: 'var(--r)',
                border: '1px solid var(--line)',
                background: bucket === b ? 'var(--accent)' : 'var(--surface)',
                color: bucket === b ? '#fff' : 'var(--ink-2)',
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
                display: 'flex',
                gap: 6,
                alignItems: 'center',
              }}
            >
              {b.charAt(0).toUpperCase() + b.slice(1)}
              {count > 0 && (
                <span style={{
                  background: bucket === b ? 'rgba(255,255,255,0.25)' : 'var(--surface-2)',
                  borderRadius: 99,
                  padding: '1px 7px',
                  fontSize: 11,
                }}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Filter bar */}
      {bucketLabs.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
          <select className="inp" style={{ height: 30, fontSize: 12, width: 130 }} value={filters.platform} onChange={(e) => setFilter('platform', e.target.value)}>
            <option value="">All platforms</option>
            <option value="ubuntu">Linux</option>
            <option value="windows">Windows</option>
          </select>
          <select className="inp" style={{ height: 30, fontSize: 12, width: 140 }} value={filters.instanceType} onChange={(e) => setFilter('instanceType', e.target.value)}>
            <option value="">All types</option>
            {uniqueTypes.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className="inp" style={{ height: 30, fontSize: 12, width: 150 }} value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
            <option value="">All statuses</option>
            {uniqueStatuses.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
          </select>
          {isAdmin && (
            <select className="inp" style={{ height: 30, fontSize: 12, width: 160 }} value={filters.account} onChange={(e) => setFilter('account', e.target.value)}>
              <option value="">All accounts</option>
              {uniqueAccounts.map((id) => <option key={id} value={id}>{accountMap[id] ?? id}</option>)}
            </select>
          )}
          {hasFilters && (
            <button type="button" onClick={() => setFilters(EMPTY_FILTERS)} style={{ fontSize: 12, color: 'var(--ink-3)', background: 'none', border: 0, cursor: 'pointer', textDecoration: 'underline' }}>
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* States */}
      {isLoading && <div style={{ padding: 'var(--pad)', color: 'var(--ink-3)', fontSize: 13 }}>Loading labs…</div>}
      {error && <div style={{ padding: 'var(--pad)', color: 'var(--danger)', fontSize: 13 }}>Failed to load labs.</div>}

      {!isLoading && !error && bucketLabs.length === 0 && (
        <EmptyState icon="Monitor" title={EMPTY_MESSAGES[bucket].title} description={EMPTY_MESSAGES[bucket].description} />
      )}

      {visibleLabs.length === 0 && bucketLabs.length > 0 && hasFilters && (
        <div style={{ padding: 'var(--pad)', fontSize: 13, color: 'var(--ink-3)' }}>No labs match the current filters.</div>
      )}

      {visibleLabs.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 32 }} />
                <th>Lab ID</th>
                <th>Platform</th>
                <th>Instance Type</th>
                <th>Status</th>
                <th>Account</th>
                <th>Expires</th>
                <th>Submitted By</th>
              </tr>
            </thead>
            <tbody>
              {visibleLabs.map((lab) => (
                <LabRow
                  key={lab.labId}
                  lab={lab}
                  isExpanded={expandedId === lab.labId}
                  onToggle={toggleRow}
                  accountName={accountMap[lab.accountId]}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
