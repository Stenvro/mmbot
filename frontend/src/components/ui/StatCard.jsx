const COLORS = {
  gold: '#fcd535',
  cyan: '#0ea5e9',
  green: '#2ebd85',
  red: '#f6465d',
  purple: '#8b5cf6',
  white: '#eaecef',
};

const StatCard = ({ label, value, color = 'gold' }) => {
  const accent = COLORS[color] || COLORS.gold;

  return (
    <div
      className="terminal-card p-4 border-l-2 transition-all duration-300 hover:shadow-lg"
      style={{ borderLeftColor: accent }}
    >
      <p className="text-[9px] font-bold uppercase tracking-wider text-[#848e9c] mb-1">{label}</p>
      <p className="text-base font-mono font-bold" style={{ color: accent }}>
        {value}
      </p>
    </div>
  );
};

export default StatCard;
