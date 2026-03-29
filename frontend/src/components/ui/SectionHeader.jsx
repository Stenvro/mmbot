const ACCENT_COLORS = {
  gold: 'text-[#fcd535]',
  cyan: 'text-[#0ea5e9]',
  green: 'text-[#2ebd85]',
  purple: 'text-[#8b5cf6]',
  red: 'text-[#f6465d]',
  white: 'text-[#eaecef]',
};

const SectionHeader = ({ title, subtitle, action, accentColor = 'white' }) => (
  <div className="flex items-center justify-between">
    <div>
      <h2 className={`text-sm font-bold uppercase tracking-[0.15em] ${ACCENT_COLORS[accentColor] || ACCENT_COLORS.white}`}>
        {title}
      </h2>
      {subtitle && (
        <p className="text-[10px] text-[#848e9c] mt-0.5 uppercase tracking-wider">{subtitle}</p>
      )}
    </div>
    {action && <div>{action}</div>}
  </div>
);

export default SectionHeader;
