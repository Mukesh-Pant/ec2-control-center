interface StatCell {
  value: string;
  unit?: string;
  label: string;
}

const STATS: StatCell[] = [
  { value: '14,000', unit: '+', label: 'EC2 instances under management' },
  { value: '99.97', unit: '%', label: 'Control-plane uptime · last 12 months' },
  { value: '$2.4', unit: 'M', label: 'Cloud spend optimized for our customers' },
  { value: '6', label: 'AWS regions · expanding to 14 in Q3' },
];

export function StatsBand() {
  return (
    <section className="stats-band reveal">
      {STATS.map((s) => (
        <div className="stat-band-cell" key={s.label}>
          <div className="stat-band-v">
            {s.value}
            {s.unit && <span className="unit">{s.unit}</span>}
          </div>
          <div className="stat-band-l">{s.label}</div>
        </div>
      ))}
    </section>
  );
}
