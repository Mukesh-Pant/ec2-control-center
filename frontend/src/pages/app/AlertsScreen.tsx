import React from 'react';
import { Badge, Card, EmptyState, Icon, PageHeader } from '@/components/ui';
import { useFinanceAlerts } from '@/lib/queries/finance';
import type { FinanceAlert } from '@/types/api';

function alertIconName(type: FinanceAlert['type']): string {
  if (type === 'vendor_expired' || type === 'payment_overdue' || type === 'milestone_overdue') {
    return 'AlertOctagon';
  }
  return 'AlertTriangle';
}

function alertBadgeTone(severity: FinanceAlert['severity']): 'err' | 'warn' {
  return severity === 'critical' ? 'err' : 'warn';
}

function alertColor(severity: FinanceAlert['severity']): string {
  return severity === 'critical' ? 'var(--danger)' : 'var(--warn)';
}

export default function AlertsScreen() {
  const { data, isLoading, error } = useFinanceAlerts();
  const alerts = data?.alerts ?? [];
  const showTable = !isLoading && !error && alerts.length > 0;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Finance"
        title="Alerts & Notifications"
        sub="Contract expirations, payment reminders, and cost anomalies."
      />
      <Card pad={showTable ? false : undefined}>
        {isLoading && (
          <p style={{ padding: 'var(--pad)', color: 'var(--ink-3)', fontSize: 13 }}>Loading alerts…</p>
        )}
        {error && (
          <p style={{ padding: 'var(--pad)', color: 'var(--danger)', fontSize: 13 }}>
            {error instanceof Error ? error.message : 'Failed to load alerts.'}
          </p>
        )}
        {!isLoading && !error && alerts.length === 0 && (
          <EmptyState
            icon="BellOff"
            title="Nothing needs your attention"
            description="Alerts appear here when contracts are about to expire, payments are overdue, or cost anomalies are detected."
          />
        )}
        {showTable && (
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 32 }}></th>
                <th>Message</th>
                <th>Entity</th>
                <th style={{ width: 110 }}>Severity</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((a) => (
                <tr key={`${a.entityType}-${a.entityId}`}>
                  <td>
                    <Icon
                      name={alertIconName(a.type)}
                      size={14}
                      color={alertColor(a.severity)}
                    />
                  </td>
                  <td style={{ fontSize: 13 }}>{a.message}</td>
                  <td>
                    <div style={{ fontSize: 13 }}>{a.entityName}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-4)' }}>{a.entityType}</div>
                  </td>
                  <td>
                    <Badge tone={alertBadgeTone(a.severity)}>
                      {a.severity}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
