const TYPE_COLORS = {
  danger: { accent: '#f6465d', bg: 'rgba(246, 70, 93, 0.1)' },
  warning: { accent: '#fcd535', bg: 'rgba(252, 213, 53, 0.1)' },
  success: { accent: '#2ebd85', bg: 'rgba(46, 189, 133, 0.1)' },
  info: { accent: '#0ea5e9', bg: 'rgba(14, 165, 233, 0.1)' },
};

const Modal = ({ config, customBody }) => {
  if (!config) return null;

  const colors = TYPE_COLORS[config.type] || TYPE_COLORS.warning;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={config.onCancel} />
      <div className="relative modal-enter terminal-card max-w-md w-full shadow-[0_0_60px_rgba(0,0,0,0.5)]">
        <div className="px-5 py-4 border-b border-[#202532]" style={{ background: colors.bg }}>
          <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.accent }}>
            {config.title}
          </h3>
        </div>

        <div className="px-5 py-4">
          {customBody || (
            <p className="text-[11px] text-[#eaecef] leading-relaxed">{config.message}</p>
          )}
        </div>

        <div className="flex justify-end gap-3 px-5 py-3 border-t border-[#202532]">
          {config.onCancel && (
            <button
              onClick={config.onCancel}
              className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-[#848e9c] border border-[#202532] rounded-lg hover:bg-[#202532]/50 transition-colors"
            >
              {config.cancelText || 'Cancel'}
            </button>
          )}
          {config.onConfirm && (
            <button
              onClick={config.onConfirm}
              disabled={config.busy}
              className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
              style={{
                background: colors.accent,
                color: config.type === 'warning' ? '#181a20' : '#fff',
                boxShadow: `0 0 15px ${colors.accent}25`,
              }}
            >
              {config.busy ? 'Processing...' : (config.confirmText || 'Confirm')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Modal;
