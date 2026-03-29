const GLOW_CLASSES = {
  gold: 'glow-panel',
  cyan: 'glow-panel-cyan',
  green: 'glow-panel-green',
  purple: 'glow-panel-purple',
};

const GlowPanel = ({ children, className = '', glowColor, noPadding = false }) => (
  <div className={`terminal-card hover:border-[#2b3545] transition-all duration-300 ${glowColor ? GLOW_CLASSES[glowColor] || '' : ''} ${noPadding ? '' : 'p-5'} ${className}`}>
    {children}
  </div>
);

export default GlowPanel;
