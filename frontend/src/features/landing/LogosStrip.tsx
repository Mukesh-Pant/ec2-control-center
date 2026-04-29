const LOGOS = ['Cloudmandap', 'Navigator', 'Aaveg', 'Pathway', 'Ostara', 'Oracle Lab'];

export function LogosStrip() {
  return (
    <section className="logos-strip">
      <div className="logos-label">Powering cloud teams from</div>
      <div className="logos-row">
        {LOGOS.map((name) => (
          <div className="logo-mark" key={name}>
            <span className="ico" />
            {name}
          </div>
        ))}
      </div>
    </section>
  );
}
