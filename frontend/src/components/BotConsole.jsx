import { useState, useEffect, useRef, useCallback } from 'react';
import { apiClient } from '../api/client';

const LEVEL_COLOR = {
  INFO:  'text-[#0ea5e9]',
  WARN:  'text-[#fcd535]',
  ERROR: 'text-[#f6465d]',
};

export default function BotConsole({ botName, isOpen }) {
  const [entries, setEntries]       = useState([]);
  const [cursor, setCursor]         = useState(0);
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef  = useRef(null);
  const bottomRef  = useRef(null);
  const cursorRef  = useRef(0);

  // Keep cursorRef in sync so the interval closure always sees the latest value
  useEffect(() => { cursorRef.current = cursor; }, [cursor]);

  // Poll only while open
  useEffect(() => {
    if (!isOpen) return;

    const poll = async () => {
      try {
        const res = await apiClient.get(
          `/api/bots/${encodeURIComponent(botName)}/logs?since=${cursorRef.current}`
        );
        const newEntries = res.data?.entries ?? [];
        if (newEntries.length > 0) {
          setEntries(prev => {
            const combined = [...prev, ...newEntries];
            return combined.length > 1000 ? combined.slice(-1000) : combined;
          });
          setCursor(newEntries[newEntries.length - 1].seq);
        }
      } catch {
        // silently ignore — backend may be restarting
      }
    };

    poll(); // immediate first fetch
    const id = setInterval(poll, 2000);
    return () => clearInterval(id);
  }, [isOpen, botName]);

  // Auto-scroll to bottom when new entries arrive
  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [entries.length, autoScroll]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollTop >= el.scrollHeight - el.clientHeight - 24;
    if (!atBottom) setAutoScroll(false);
  }, []);

  const jumpToBottom = () => {
    setAutoScroll(true);
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const clearLocal = () => setEntries([]);

  return (
    <div className="bg-[#030507] border-t border-[#202532]">
      {/* Console toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#202532]/50">
        <div className="flex items-center gap-2">
          <span className="text-[8px] font-bold uppercase tracking-widest text-[#848e9c]">OUTPUT</span>
          <span className="text-[8px] font-mono text-[#848e9c]/60">{entries.length} lines</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={clearLocal}
            className="text-[8px] font-bold uppercase text-[#848e9c] hover:text-[#eaecef] transition-colors px-1.5 py-0.5 rounded hover:bg-[#202532]"
          >
            CLEAR
          </button>
          <button
            onClick={jumpToBottom}
            title={autoScroll ? 'Auto-scroll on' : 'Click to resume auto-scroll'}
            className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded transition-colors ${
              autoScroll
                ? 'text-[#2ebd85] bg-[#2ebd85]/10'
                : 'text-[#848e9c] hover:text-[#eaecef] hover:bg-[#202532]'
            }`}
          >
            ↓ FOLLOW
          </button>
        </div>
      </div>

      {/* Log lines */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="h-40 overflow-y-auto"
        style={{ scrollbarWidth: 'thin', scrollbarColor: '#202532 transparent' }}
      >
        {entries.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-[9px] text-[#848e9c] font-mono">No activity yet — start the engine to stream events</span>
          </div>
        ) : (
          entries.map((e) => (
            <div
              key={e.seq}
              className="flex items-start gap-2 px-3 py-[2px] hover:bg-[#0ea5e9]/5 group"
            >
              <span className="text-[#848e9c] font-mono text-[9px] shrink-0 select-none pt-[1px]">{e.ts}</span>
              <span className={`font-mono text-[9px] font-bold shrink-0 w-9 pt-[1px] ${LEVEL_COLOR[e.level] ?? 'text-[#848e9c]'}`}>
                {e.level}
              </span>
              <span className="font-mono text-[9px] text-[#c9d1d9] break-all leading-relaxed">{e.msg}</span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
