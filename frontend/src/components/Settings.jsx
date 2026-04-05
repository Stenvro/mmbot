import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../api/client';
import PageShell from './ui/PageShell';
import GlowPanel from './ui/GlowPanel';
import SectionHeader from './ui/SectionHeader';
import Modal from './ui/Modal';

export default function Settings({ setError }) {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingKey, setDeletingKey] = useState(null);

  const [balances, setBalances] = useState({});
  const [fetchingBalanceFor, setFetchingBalanceFor] = useState(null);

  const [keyName, setKeyName] = useState('');
  const [selectedExchange, setSelectedExchange] = useState('okx');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [isSandbox, setIsSandbox] = useState(true);

  const EXCHANGES = [
    { id: 'okx', name: 'OKX' },
    { id: 'binance', name: 'Binance' },
    { id: 'bitvavo', name: 'Bitvavo' },
    { id: 'coinbase', name: 'Coinbase' },
    { id: 'cryptocom', name: 'Crypto.com' },
    { id: 'kraken', name: 'Kraken' },
    { id: 'kucoin', name: 'KuCoin' },
  ];
  const needsPassphrase = ['okx', 'kucoin'].includes(selectedExchange);

  const [modalConfig, setModalConfig] = useState(null);

  const [swapModal, setSwapModal] = useState(null);
  const [swapFrom, setSwapFrom] = useState('USDC');
  const [swapTo, setSwapTo] = useState('BTC');
  const [swapAmount, setSwapAmount] = useState('');
  const [amountType, setAmountType] = useState('from');

  const fetchKeys = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await apiClient.get('/api/keys');
      setKeys(Array.isArray(response.data) ? response.data : []);
      if (setError) setError(null);
    } catch (err) {
      if (setError) setError(err.response?.data?.detail || err.message);
    }
    setRefreshing(false);
  }, [setError]);

  useEffect(() => {
    const controller = new AbortController();
    fetchKeys(); // eslint-disable-line react-hooks/set-state-in-effect -- initial data fetch on mount
    return () => controller.abort();
  }, [fetchKeys]);

  const handleSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    if (setError) setError(null);
    try {
      await apiClient.post('/api/keys', {
        name: keyName,
        exchange: selectedExchange,
        api_key: apiKey,
        api_secret: apiSecret,
        passphrase: needsPassphrase ? passphrase : '',
        is_sandbox: isSandbox
      });
      setModalConfig({
        type: 'success',
        title: 'Connection Saved',
        message: `Success! Key '${keyName}' is verified and securely stored.`,
        confirmText: 'OK',
        onConfirm: () => setModalConfig(null)
      });
      setKeyName('');
      setApiKey('');
      setApiSecret('');
      setPassphrase('');
      fetchKeys();
    } catch (err) {
      if (setError) setError(err.response?.data?.detail || "An unexpected error occurred.");
    }
    setLoading(false);
  };

  const executeDelete = async (delName) => {
    setDeletingKey(delName);
    try {
      await apiClient.delete(`/api/keys/${delName}`);
      setBalances(prev => {
        const newBal = {...prev};
        delete newBal[delName];
        return newBal;
      });
      fetchKeys();
      setModalConfig(null);
    } catch (err) {
      if (setError) setError(err.response?.data?.detail || err.message);
      setModalConfig(null);
    }
    setDeletingKey(null);
  };

  const handleDeleteClick = (delName) => {
    setModalConfig({
      type: 'danger',
      title: 'Delete Connection',
      message: `Are you sure you want to permanently delete the key '${delName}'?`,
      confirmText: 'Delete Key',
      onConfirm: () => executeDelete(delName),
      onCancel: () => setModalConfig(null)
    });
  };

  const handleFetchBalance = async (kName) => {
    if (balances[kName]) {
      setBalances(prev => {
        const newBal = {...prev};
        delete newBal[kName];
        return newBal;
      });
      return;
    }

    setFetchingBalanceFor(kName);
    if (setError) setError(null);
    try {
      const response = await apiClient.get(`/api/keys/${kName}/balance`);
      setBalances(prev => ({
        ...prev,
        [kName]: response.data.balances
      }));
    } catch (err) {
      if (setError) setError(err.response?.data?.detail || `Failed to fetch balance for ${kName}`);
    }
    setFetchingBalanceFor(null);
  };

  const openSwapModal = async (kName) => {
      setSwapModal(kName);
      if (!balances[kName]) {
          try {
              const response = await apiClient.get(`/api/keys/${kName}/balance`);
              setBalances(prev => ({ ...prev, [kName]: response.data.balances }));
          } catch { /* silent */ }
      }
  };

  const handleMaxClick = () => {
      const walletBalances = balances[swapModal];
      if (!walletBalances || !walletBalances[swapFrom]) {
          setModalConfig({ type: 'danger', title: 'Insufficient Funds', message: `You don't have any ${swapFrom} in this wallet.`, confirmText: 'OK', onConfirm: () => setModalConfig(null) });
          return;
      }
      setAmountType('from');
      setSwapAmount(walletBalances[swapFrom].free);
  };

  const executeSwap = async (e) => {
      e.preventDefault();
      setLoading(true);
      const currentWallet = swapModal;
      try {
          await apiClient.post(`/api/keys/${currentWallet}/swap`, {
              from_asset: swapFrom,
              to_asset: swapTo,
              amount: parseFloat(swapAmount),
              amount_type: amountType
          });

          setSwapModal(null);
          setModalConfig({
            type: 'success',
            title: 'Swap Executed',
            message: `Successfully executed market order. Updating balance...`,
            confirmText: 'OK',
            onConfirm: () => setModalConfig(null)
          });

          setTimeout(async () => {
              try {
                  const response = await apiClient.get(`/api/keys/${currentWallet}/balance`);
                  setBalances(prev => ({ ...prev, [currentWallet]: response.data.balances }));
              } catch { /* silent */ }
          }, 1500);

      } catch (err) {
          setSwapModal(null);
          setModalConfig({ type: 'danger', title: 'Swap Failed', message: err.response?.data?.detail || err.message, confirmText: 'OK', onConfirm: () => setModalConfig(null) });
      }
      setLoading(false);
  };

  const inputClass = "w-full bg-[#080a0f] border border-[#202532] text-[#eaecef] px-3 py-2 text-xs focus:outline-none focus:border-[#0ea5e9] focus:shadow-[0_0_8px_rgba(14,165,233,0.1)] transition-all duration-200 rounded-lg";

  return (
    <PageShell glowColor="gold">
      <Modal config={modalConfig ? { ...modalConfig, busy: !!deletingKey || loading } : null} />

      {/* Swap modal */}
      {swapModal && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSwapModal(null)} />
          <div className="relative modal-enter terminal-card max-w-md w-full shadow-[0_0_60px_rgba(0,0,0,0.5)]">
            <div className="px-5 py-4 border-b border-[#202532] flex justify-between items-center">
                <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#eaecef]">Market Execution</h3>
                    <p className="text-[#848e9c] text-[10px] mt-0.5">Routing via: <span className="text-[#fcd535] font-bold">{swapModal}</span></p>
                </div>
                <button onClick={() => setSwapModal(null)} className="text-[#848e9c] hover:text-[#f6465d] transition-colors font-bold">&#10005;</button>
            </div>

            <form onSubmit={executeSwap} className="p-5 space-y-5">
                <div className="flex space-x-4">
                    <div className="w-1/2">
                        <label className="block text-[9px] font-bold uppercase text-[#848e9c] mb-1.5">From Asset (Sell)</label>
                        <input type="text" required value={swapFrom} onChange={e => setSwapFrom(e.target.value.toUpperCase())} className={`${inputClass} font-bold`} placeholder="USDC" />
                    </div>
                    <div className="w-1/2">
                        <label className="block text-[9px] font-bold uppercase text-[#848e9c] mb-1.5">To Asset (Buy)</label>
                        <input type="text" required value={swapTo} onChange={e => setSwapTo(e.target.value.toUpperCase())} className={`${inputClass} font-bold`} placeholder="SOL" />
                    </div>
                </div>

                <div>
                    <div className="flex justify-between items-end mb-1.5">
                        <label className="block text-[9px] font-bold uppercase text-[#848e9c]">Trade Size</label>
                        {balances[swapModal] && balances[swapModal][swapFrom] && (
                            <span className="text-[9px] text-[#848e9c] font-mono">Avail: {balances[swapModal][swapFrom].free.toFixed(4)} {swapFrom}</span>
                        )}
                    </div>
                    <div className="flex bg-[#080a0f] border border-[#202532] rounded-lg overflow-hidden focus-within:border-[#0ea5e9] transition-all duration-200">
                        <select value={amountType} onChange={e => setAmountType(e.target.value)} className="bg-[#12151c] text-[#848e9c] text-[10px] uppercase font-bold px-2.5 py-2 border-r border-[#202532] outline-none cursor-pointer hover:text-[#eaecef]">
                            <option value="from">Spend ({swapFrom})</option>
                            <option value="to">Receive ({swapTo})</option>
                        </select>
                        <input type="number" step="any" required value={swapAmount} onChange={e => setSwapAmount(e.target.value)} className="w-full bg-transparent text-[#eaecef] font-mono px-3 py-2 text-xs focus:outline-none" placeholder="0.00" />
                        <button type="button" onClick={handleMaxClick} className="bg-[#202532] hover:bg-[#2b3545] text-[#eaecef] text-[9px] font-bold uppercase px-3 transition-colors border-l border-[#202532]">MAX</button>
                    </div>
                </div>

                <div className="pt-4 border-t border-[#202532]">
                    <button type="submit" disabled={loading} className="w-full py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-200 bg-[#fcd535] hover:bg-[#e5c02a] text-[#181a20] disabled:opacity-50 shadow-[0_0_15px_rgba(252,213,53,0.15)]">
                        {loading ? 'Processing...' : 'Execute Order'}
                    </button>
                </div>
            </form>
          </div>
        </div>
      )}

      {/* Exchange Connections */}
      <GlowPanel glowColor="gold">
        <SectionHeader
          title="Exchange Connections"
          accentColor="white"
          action={
            <button
              onClick={fetchKeys}
              disabled={refreshing}
              className="text-[10px] text-[#848e9c] hover:text-[#eaecef] font-bold uppercase transition-all duration-200 border border-[#202532] hover:border-[#848e9c] px-3 py-1.5 rounded-lg bg-[#080a0f]"
            >
              {refreshing ? 'Syncing...' : 'Refresh Status'}
            </button>
          }
        />

        <div className="mt-5">
        {keys.length === 0 ? (
          <div className="p-6 text-center border border-[#202532] border-dashed rounded-lg bg-[#080a0f]/30">
              <p className="text-xs text-[#848e9c]">No exchange keys configured. Add one below.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {keys.map((k, index) => (
              <div key={index} className={`flex flex-col bg-[#080a0f]/50 p-4 border border-[#202532] rounded-xl transition-all duration-200 hover:border-[#2b3545] fade-in-delay-${Math.min(index + 1, 6)}`}>
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-[#eaecef] font-bold text-sm">{k.name}</span>
                    <div className="flex items-center space-x-2 mt-1.5">
                      <div className={`w-1.5 h-1.5 rounded-full ${k.is_active ? 'bg-[#2ebd85] shadow-[0_0_8px_#2ebd85]' : 'bg-[#f6465d] animate-pulse'}`}></div>
                      <span className="text-[10px] text-[#848e9c] uppercase font-bold tracking-wider">
                        {k.exchange} {k.is_sandbox ? 'SANDBOX' : 'LIVE'}
                      </span>
                      {!k.is_active && (
                        <span className="text-[9px] text-[#f6465d] ml-2 border border-[#f6465d]/30 bg-[#f6465d]/10 px-1.5 py-0.5 rounded cursor-help" title={k.error_msg}>
                          ERROR
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex space-x-2 items-center">
                    {k.is_active && (
                      <>
                        <button
                          onClick={() => openSwapModal(k.name)}
                          className="text-[#eaecef] text-[10px] font-bold uppercase transition-all duration-200 border border-[#202532] hover:border-[#eaecef] hover:bg-[#202532] px-3 py-1.5 rounded-lg"
                        >
                          Trade
                        </button>
                        <button
                          onClick={() => handleFetchBalance(k.name)}
                          disabled={fetchingBalanceFor === k.name}
                          className="text-[#848e9c] hover:text-[#eaecef] text-[10px] font-bold uppercase transition-colors px-3 py-1.5 rounded-lg disabled:opacity-50"
                        >
                          {fetchingBalanceFor === k.name ? 'Loading...' : balances[k.name] ? 'Hide Assets' : 'Assets'}
                        </button>
                      </>
                    )}
                    <span className="text-[#202532]">|</span>
                    <button
                      onClick={() => handleDeleteClick(k.name)}
                      disabled={deletingKey === k.name}
                      className="text-[#f6465d] hover:text-[#f6465d]/80 text-[10px] font-bold uppercase transition-colors px-2 py-1.5 disabled:opacity-50"
                    >
                      {deletingKey === k.name ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </div>

                {balances[k.name] && (
                  <div className="mt-4 pt-4 border-t border-[#202532]/50 fade-in">
                    {Object.keys(balances[k.name]).length === 0 ? (
                      <span className="text-xs text-[#848e9c]">Wallet is empty.</span>
                    ) : (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {Object.entries(balances[k.name]).map(([coin, data]) => (
                          <div key={coin} className="terminal-card p-3 border-l-2 border-[#2ebd85]">
                            <span className="text-[10px] text-[#848e9c] font-bold uppercase">{coin}</span>
                            <span className="text-xs text-[#eaecef] font-mono mt-1 block">{data.free.toFixed(4)}</span>
                            {data.used > 0 && (
                              <span className="text-[9px] text-[#fcd535] mt-1 font-mono block">In Orders: {data.used.toFixed(4)}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        </div>
      </GlowPanel>

      {/* Configure API Key */}
      <GlowPanel>
        <SectionHeader title="Configure API Key" accentColor="white" />
        <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
          <div>
            <label className="block text-[10px] font-bold uppercase text-[#848e9c] mb-1.5">Exchange</label>
            <select value={selectedExchange} onChange={e => setSelectedExchange(e.target.value)} className={inputClass}>
              {EXCHANGES.map(ex => (
                <option key={ex.id} value={ex.id}>{ex.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase text-[#848e9c] mb-1.5">Connection Name</label>
            <input type="text" required value={keyName} onChange={e => setKeyName(e.target.value)} className={inputClass} placeholder="e.g. Production Wallet" />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase text-[#848e9c] mb-1.5">API Key</label>
            <input type="password" required value={apiKey} onChange={e => setApiKey(e.target.value)} className={inputClass} placeholder="••••••••••••••••" />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase text-[#848e9c] mb-1.5">Secret Key</label>
            <input type="password" required value={apiSecret} onChange={e => setApiSecret(e.target.value)} className={inputClass} placeholder="••••••••••••••••" />
          </div>
          {needsPassphrase && (
            <div className="col-span-1 md:col-span-2">
              <label className="block text-[10px] font-bold uppercase text-[#848e9c] mb-1.5">Passphrase</label>
              <input type="password" required value={passphrase} onChange={e => setPassphrase(e.target.value)} className={inputClass} placeholder="API Passphrase" />
            </div>
          )}

          <div className="col-span-1 md:col-span-2 flex items-center justify-between pt-4 border-t border-[#202532] mt-2">
            <label className="flex items-center cursor-pointer group">
                <input type="checkbox" checked={isSandbox} onChange={e => setIsSandbox(e.target.checked)} className="w-3.5 h-3.5 accent-[#fcd535] bg-[#080a0f] border-[#202532] rounded-sm cursor-pointer" />
                <span className="ml-2 text-xs text-[#848e9c] group-hover:text-[#eaecef] transition-colors font-bold uppercase tracking-wider">
                  Sandbox Environment (Testnet)
                </span>
            </label>
            <button type="submit" disabled={loading} className="bg-[#fcd535] text-[#181a20] px-6 py-2 text-xs font-bold uppercase tracking-wider hover:bg-[#e5c02a] disabled:opacity-50 transition-all duration-200 rounded-lg shadow-[0_0_15px_rgba(252,213,53,0.15)] hover:shadow-[0_0_25px_rgba(252,213,53,0.25)]">
              {loading ? 'Verifying...' : 'Save Connection'}
            </button>
          </div>
        </form>
      </GlowPanel>
    </PageShell>
  );
}
