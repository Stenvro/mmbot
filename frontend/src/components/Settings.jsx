import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../api/client';

export default function Settings({ setError }) {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  
  const [balances, setBalances] = useState({});
  const [fetchingBalanceFor, setFetchingBalanceFor] = useState(null);
  
  const [keyName, setKeyName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [isSandbox, setIsSandbox] = useState(true);

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
    fetchKeys(); // eslint-disable-line react-hooks/set-state-in-effect -- initial data fetch on mount
  }, [fetchKeys]);

  const handleSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    if (setError) setError(null);
    try {
      await apiClient.post('/api/keys', {
        name: keyName,
        exchange: 'okx',
        api_key: apiKey,
        api_secret: apiSecret,
        passphrase: passphrase,
        is_sandbox: isSandbox
      });
      setModalConfig({
        type: 'success',
        title: 'Connection Saved',
        message: `Success! Key '${keyName}' is verified and securely stored.`,
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
    setLoading(true);
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
    setLoading(false);
  };

  const handleDeleteClick = (delName) => {
    setModalConfig({
      type: 'confirm',
      title: 'Delete Connection',
      message: `Are you sure you want to permanently delete the key '${delName}'?`,
      confirmText: 'Delete Key',
      confirmColor: 'bg-[#f6465d] hover:bg-[#f6465d]/80 text-white',
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
          setModalConfig({ type: 'error', title: 'Insufficient Funds', message: `You don't have any ${swapFrom} in this wallet.`, onConfirm: () => setModalConfig(null) });
          return;
      }
      setAmountType('from');
      setSwapAmount(walletBalances[swapFrom].free);
  };

  const executeSwap = async (e) => {
      e.preventDefault();
      setLoading(true);
      const currentWallet = swapModal; // Capture before clearing state
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
          setModalConfig({ type: 'error', title: 'Swap Failed', message: err.response?.data?.detail || err.message, onConfirm: () => setModalConfig(null) });
      }
      setLoading(false);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 w-full fade-in relative pb-10">
      
      {modalConfig && (
        <div className="fixed inset-0 z-[999] bg-[#0b0e11]/80 backdrop-blur-sm flex items-center justify-center p-4 fade-in">
          <div className="bg-[#181a20] border border-[#2b3139] rounded shadow-2xl max-w-sm w-full p-6 relative">
            <h3 className={`text-sm font-bold mb-2 uppercase tracking-wider ${modalConfig.type === 'success' ? 'text-[#2ebd85]' : 'text-[#f6465d]'}`}>
              {modalConfig.title}
            </h3>
            <p className="text-[#848e9c] text-xs mb-6 leading-relaxed">
              {modalConfig.message}
            </p>
            <div className="flex justify-end space-x-3">
              {modalConfig.type === 'confirm' && (
                <button onClick={modalConfig.onCancel} className="px-4 py-1.5 rounded text-[10px] font-bold text-[#848e9c] hover:text-[#eaecef] hover:bg-[#2b3139] transition-colors uppercase border border-transparent">
                  Cancel
                </button>
              )}
              <button 
                onClick={modalConfig.onConfirm} 
                className={`px-4 py-1.5 rounded text-[10px] font-bold uppercase transition-colors ${modalConfig.confirmColor || 'bg-[#2ebd85]/10 text-[#2ebd85] hover:bg-[#2ebd85]/20 border border-[#2ebd85]/30'}`}
              >
                {modalConfig.confirmText || 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}

      {swapModal && (
        <div className="fixed inset-0 z-[999] bg-[#0b0e11]/80 backdrop-blur-sm flex items-center justify-center p-4 fade-in">
          <div className="bg-[#181a20] border border-[#2b3139] rounded shadow-2xl max-w-md w-full p-6 relative">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h3 className="text-sm font-bold uppercase tracking-wider text-[#eaecef]">Market Execution</h3>
                    <p className="text-[#848e9c] text-[10px] mt-0.5">Routing via: <span className="text-[#fcd535] font-bold">{swapModal}</span></p>
                </div>
                <button onClick={() => setSwapModal(null)} className="text-[#848e9c] hover:text-[#f6465d] transition-colors font-bold">✕</button>
            </div>
            
            <form onSubmit={executeSwap} className="space-y-5">
                <div className="flex space-x-4">
                    <div className="w-1/2">
                        <label className="block text-[9px] font-bold uppercase text-[#848e9c] mb-1.5">From Asset (Sell)</label>
                        <input type="text" required value={swapFrom} onChange={e => setSwapFrom(e.target.value.toUpperCase())} className="w-full bg-[#0b0e11] border border-[#2b3139] text-[#eaecef] font-bold px-3 py-2 text-xs focus:outline-none focus:border-[#848e9c] rounded-sm transition-colors" placeholder="USDC" />
                    </div>
                    <div className="w-1/2">
                        <label className="block text-[9px] font-bold uppercase text-[#848e9c] mb-1.5">To Asset (Buy)</label>
                        <input type="text" required value={swapTo} onChange={e => setSwapTo(e.target.value.toUpperCase())} className="w-full bg-[#0b0e11] border border-[#2b3139] text-[#eaecef] font-bold px-3 py-2 text-xs focus:outline-none focus:border-[#848e9c] rounded-sm transition-colors" placeholder="SOL" />
                    </div>
                </div>

                <div>
                    <div className="flex justify-between items-end mb-1.5">
                        <label className="block text-[9px] font-bold uppercase text-[#848e9c]">Trade Size</label>
                        {balances[swapModal] && balances[swapModal][swapFrom] && (
                            <span className="text-[9px] text-[#848e9c] font-mono">Avail: {balances[swapModal][swapFrom].free.toFixed(4)} {swapFrom}</span>
                        )}
                    </div>
                    <div className="flex bg-[#0b0e11] border border-[#2b3139] rounded-sm overflow-hidden focus-within:border-[#848e9c] transition-colors">
                        <select value={amountType} onChange={e => setAmountType(e.target.value)} className="bg-[#181a20] text-[#848e9c] text-[10px] uppercase font-bold px-2 py-2 border-r border-[#2b3139] outline-none cursor-pointer hover:text-[#eaecef]">
                            <option value="from">Spend ({swapFrom})</option>
                            <option value="to">Receive ({swapTo})</option>
                        </select>
                        <input type="number" step="any" required value={swapAmount} onChange={e => setSwapAmount(e.target.value)} className="w-full bg-transparent text-[#eaecef] font-mono px-3 py-2 text-xs focus:outline-none" placeholder="0.00" />
                        <button type="button" onClick={handleMaxClick} className="bg-[#2b3139] hover:bg-[#3b4149] text-[#eaecef] text-[9px] font-bold uppercase px-3 transition-colors border-l border-[#2b3139]">MAX</button>
                    </div>
                </div>

                <div className="pt-4 border-t border-[#2b3139]">
                    <button type="submit" disabled={loading} className="w-full py-2.5 rounded-sm text-xs font-bold uppercase tracking-wider transition-colors bg-[#eaecef] hover:bg-white text-[#181a20] disabled:opacity-50">
                        {loading ? 'Processing...' : 'Execute Order'}
                    </button>
                </div>
            </form>
          </div>
        </div>
      )}

      <div className="bg-[#181a20] border border-[#2b3139] p-5 rounded shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-[#eaecef] text-sm font-bold uppercase tracking-wider">Exchange Connections</h3>
          <button 
            onClick={fetchKeys} 
            disabled={refreshing}
            className="text-[10px] text-[#848e9c] hover:text-[#eaecef] font-bold uppercase transition-colors border border-[#2b3139] hover:border-[#848e9c] px-3 py-1.5 rounded-sm bg-[#0b0e11]"
          >
            {refreshing ? 'Syncing...' : 'Refresh Status'}
          </button>
        </div>
        
        {keys.length === 0 ? (
          <div className="p-6 text-center border border-[#2b3139] border-dashed rounded bg-[#0b0e11]/50">
              <p className="text-xs text-[#848e9c] italic">No exchange keys configured. Add one below.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {keys.map((k, index) => (
              <div key={index} className="flex flex-col bg-[#0b0e11] p-4 border border-[#2b3139] rounded-sm transition-all hover:border-[#3b4149]">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-[#eaecef] font-bold text-sm">{k.name}</span>
                    <div className="flex items-center space-x-2 mt-1.5">
                      <div className={`w-1.5 h-1.5 rounded-full ${k.is_active ? 'bg-[#2ebd85]' : 'bg-[#f6465d] animate-pulse'}`}></div>
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
                          className="text-[#eaecef] text-[10px] font-bold uppercase transition-colors border border-[#2b3139] hover:border-[#eaecef] hover:bg-[#2b3139] px-3 py-1.5 rounded-sm"
                        >
                          Trade
                        </button>
                        <button 
                          onClick={() => handleFetchBalance(k.name)}
                          disabled={fetchingBalanceFor === k.name}
                          className="text-[#848e9c] hover:text-[#eaecef] text-[10px] font-bold uppercase transition-colors px-3 py-1.5 rounded-sm disabled:opacity-50"
                        >
                          {fetchingBalanceFor === k.name ? '...' : balances[k.name] ? 'Hide Assets' : 'Assets'}
                        </button>
                      </>
                    )}
                    <span className="text-[#2b3139]">|</span>
                    <button 
                      onClick={() => handleDeleteClick(k.name)} 
                      disabled={loading} 
                      className="text-[#f6465d] hover:text-[#f6465d]/80 text-[10px] font-bold uppercase transition-colors px-2 py-1.5"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {balances[k.name] && (
                  <div className="mt-4 pt-4 border-t border-[#2b3139]/50 animate-fade-in">
                    {Object.keys(balances[k.name]).length === 0 ? (
                      <span className="text-xs text-[#848e9c] italic">Wallet is empty.</span>
                    ) : (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {Object.entries(balances[k.name]).map(([coin, data]) => (
                          <div key={coin} className="bg-[#181a20] p-3 rounded-sm border border-[#2b3139]/50 flex flex-col">
                            <span className="text-[10px] text-[#848e9c] font-bold uppercase">{coin}</span>
                            <span className="text-xs text-[#eaecef] font-mono mt-1">{data.free.toFixed(4)}</span>
                            {data.used > 0 && (
                              <span className="text-[9px] text-[#fcd535] mt-1 font-mono">In Orders: {data.used.toFixed(4)}</span>
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

      <div className="bg-[#181a20] border border-[#2b3139] p-5 rounded shadow-sm">
        <h3 className="text-[#eaecef] text-sm font-bold mb-5 uppercase tracking-wider">Configure API Key</h3>
        <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="col-span-1 md:col-span-2">
            <label className="block text-[10px] font-bold uppercase text-[#848e9c] mb-1.5">Connection Name</label>
            <input type="text" required value={keyName} onChange={e => setKeyName(e.target.value)} className="w-full bg-[#0b0e11] border border-[#2b3139] text-[#eaecef] px-3 py-2 text-xs focus:outline-none focus:border-[#848e9c] transition-colors rounded-sm" placeholder="e.g. Production Wallet" />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase text-[#848e9c] mb-1.5">API Key</label>
            <input type="password" required value={apiKey} onChange={e => setApiKey(e.target.value)} className="w-full bg-[#0b0e11] border border-[#2b3139] text-[#eaecef] px-3 py-2 text-xs focus:outline-none focus:border-[#848e9c] transition-colors rounded-sm" placeholder="••••••••••••••••" />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase text-[#848e9c] mb-1.5">Secret Key</label>
            <input type="password" required value={apiSecret} onChange={e => setApiSecret(e.target.value)} className="w-full bg-[#0b0e11] border border-[#2b3139] text-[#eaecef] px-3 py-2 text-xs focus:outline-none focus:border-[#848e9c] transition-colors rounded-sm" placeholder="••••••••••••••••" />
          </div>
          <div className="col-span-1 md:col-span-2">
            <label className="block text-[10px] font-bold uppercase text-[#848e9c] mb-1.5">Passphrase</label>
            <input type="password" required value={passphrase} onChange={e => setPassphrase(e.target.value)} className="w-full bg-[#0b0e11] border border-[#2b3139] text-[#eaecef] px-3 py-2 text-xs focus:outline-none focus:border-[#848e9c] transition-colors rounded-sm" placeholder="Your OKX API Passphrase" />
          </div>
          
          <div className="col-span-1 md:col-span-2 flex items-center justify-between pt-4 border-t border-[#2b3139] mt-2">
            <label className="flex items-center cursor-pointer group">
                <input type="checkbox" checked={isSandbox} onChange={e => setIsSandbox(e.target.checked)} className="w-3.5 h-3.5 accent-[#fcd535] bg-[#0b0e11] border-[#2b3139] rounded-sm cursor-pointer" />
                <span className="ml-2 text-xs text-[#848e9c] group-hover:text-[#eaecef] transition-colors font-bold uppercase tracking-wider">
                  Sandbox Environment (Testnet)
                </span>
            </label>
            <button type="submit" disabled={loading} className="bg-[#fcd535] text-[#181a20] px-6 py-2 text-xs font-bold uppercase tracking-wider hover:bg-[#e5c02a] disabled:opacity-50 transition-colors rounded-sm shadow-sm">
              {loading ? 'Verifying...' : 'Save Connection'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}