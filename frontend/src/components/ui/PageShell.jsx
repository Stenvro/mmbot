const GLOW_COLORS = {
  gold: 'rgba(252, 213, 53, 0.05)',
  cyan: 'rgba(14, 165, 233, 0.05)',
  green: 'rgba(46, 189, 133, 0.05)',
  purple: 'rgba(139, 92, 246, 0.05)',
};

const PageShell = ({ children, glowColor = 'gold' }) => (
  <div className="page-container overflow-y-auto h-full">
    <div
      className="pointer-events-none absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full blur-[120px] opacity-60"
      style={{ background: GLOW_COLORS[glowColor] || GLOW_COLORS.gold }}
    />
    <div className="relative z-10 max-w-[1400px] mx-auto px-4 md:px-8 py-6 space-y-6">
      {children}
    </div>
  </div>
);

export default PageShell;
