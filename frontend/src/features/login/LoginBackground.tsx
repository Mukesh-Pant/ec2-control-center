/**
 * Animated background layers behind the login shell:
 * - Drifting grid pattern (gridPan keyframe)
 * - Three blurred orbs that drift independently (orbDrift / orbCenterDrift)
 * - SVG-noise overlay for analog texture
 */
export function LoginBackground() {
  return (
    <div className="login-bg" aria-hidden="true">
      <div className="login-grid" />
      <div className="login-orb a" />
      <div className="login-orb b" />
      <div className="login-orb c" />
      <div className="login-noise" />
    </div>
  );
}
