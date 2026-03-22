import { useState, useEffect } from 'react';
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
  const [swapFrom, setSwapFrom] = useState('USDT');
  const [swapTo, setSwapTo] = useState('BTC');
  const [swapAmount, setSwapAmount] = useState('');
  const [amountType, setAmountType] = useState('from'); 

  const fetchKeys = async () => {
    setRefreshing(true);
    try {
      const response = await apiClient.get('/api/keys');
      setKeys(Array.isArray(response.data) ? response.data : []);
      if (setError) setError(null);
    } catch (err) {
      if (setError) setError(err.response?.data?.detail || err.message);
    }
    setRefreshing(false);
  };

  useEffect(() => {
    fetchKeys();
  }, []);

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
      confirmText: 'Delete',
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

  const executeSwap = async (e) => {
      e.preventDefault();
      setLoading(true);
      try {
          await apiClient.post(`/api/keys/${swapModal}/swap`, {
              from_asset: swapFrom,
              to_asset: swapTo,
              amount: parseFloat(swapAmount),
              amount_type: amountType
          });
          
          // FORCE REFRESH THE BALANCE INSTEAD OF TOGGLING IT
          try {
              const response = await apiClient.get(`/api/keys/${swapModal}/balance`);
              setBalances(prev => ({
                ...prev,
                [swapModal]: response.data.balances
              }));
          } catch (balanceErr) {
              console.error("Could not auto-refresh balance", balanceErr);
          }

          setSwapModal(null);
          setModalConfig({
            type: 'success',
            title: 'Swap Executed',
            message: `Successfully executed manual swap order.`,
            onConfirm: () => setModalConfig(null)
          });
          
      } catch (err) {
          setSwapModal(null);
          setModalConfig({
            type: 'error',
            title: 'Swap Failed',
            message: err.response?.data?.detail || err.message,
            onConfirm: () => setModalConfig(null)
          });
      }
      setLoading(false);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 w-full fade-in relative">
      
      {modalConfig && (
        <div className="fixed inset-0 z-[999] bg-[#0b0e11]/80 backdrop-blur-sm flex items-center justify-center p-4 fade-in">
          <div className="bg-[#181a20] border border-[#2b3139] rounded shadow-2xl max-w-sm w-full p-6 relative">
            <h3 className={`text-lg font-bold mb-2 uppercase tracking-wider ${modalConfig.type === 'success' ? 'text-[#2ebd85]' : 'text-[#f6465d]'}`}>
              {modalConfig.title}
            </h3>
            <p className="text-[#848e9c] text-sm mb-6 leading-relaxed">
              {modalConfig.message}
            </p>
            <div className="flex justify-end space-x-3">
              {modalConfig.type === 'confirm' && (
                <button onClick={modalConfig.onCancel} className="px-4 py-2 rounded text-xs font-bold text-[#848e9c] hover:bg-[#2b3139] transition-colors uppercase">
                  Cancel
                </button>
              )}
              <button 
                onClick={modalConfig.onConfirm} 
                className={`px-4 py-2 rounded text-xs font-bold uppercase transition-colors ${modalConfig.confirmColor || 'bg-[#2ebd85] hover:bg-[#2ebd85]/80 text-[#181a20]'}`}
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
            <h3 className="text-lg font-bold mb-1 uppercase tracking-wider text-[#eaecef]">Quick Swap / Trade</h3>
            <p className="text-[#848e9c] text-xs mb-6">Executing on exchange via: <span className="text-[#0ea5e9] font-bold">{swapModal}</span></p>
            
            <form onSubmit={executeSwap} className="space-y-4">
                <div className="flex space-x-4">
                    <div className="w-1/2">
                        <label className="block text-[10px] font-bold uppercase text-[#848e9c] mb-1.5">From Asset (Sell)</label>
                        <input type="text" required value={swapFrom} onChange={e => setSwapFrom(e.target.value.toUpperCase())} className="w-full bg-[#0b0e11] border border-[#2b3139] text-[#f6465d] font-bold px-3 py-2 text-sm focus:outline-none focus:border-[#0ea5e9] rounded-sm" placeholder="USDT" />
                    </div>
                    <div className="w-1/2">
                        <label className="block text-[10px] font-bold uppercase text-[#848e9c] mb-1.5">To Asset (Buy)</label>
                        <input type="text" required value={swapTo} onChange={e => setSwapTo(e.target.value.toUpperCase())} className="w-full bg-[#0b0e11] border border-[#2b3139] text-[#2ebd85] font-bold px-3 py-2 text-sm focus:outline-none focus:border-[#0ea5e9] rounded-sm" placeholder="SOL" />
                    </div>
                </div>

                <div className="pt-2">
                    <label className="block text-[10px] font-bold uppercase text-[#848e9c] mb-1.5">Trade Size</label>
                    <div className="flex bg-[#0b0e11] border border-[#2b3139] rounded-sm overflow-hidden">
                        <select value={amountType} onChange={e => setAmountType(e.target.value)} className="bg-[#181a20] text-[#eaecef] text-xs px-2 py-2 border-r border-[#2b3139] outline-none cursor-pointer">
                            <option value="from">Spend exactly ({swapFrom})</option>
                            <option value="to">Receive exactly ({swapTo})</option>
                        </select>
                        <input type="number" step="any" required value={swapAmount} onChange={e => setSwapAmount(e.target.value)} className="w-full bg-transparent text-[#fcd535] font-mono px-3 py-2 text-sm focus:outline-none" placeholder="Amount..." />
                    </div>
                </div>

                <div className="flex justify-end space-x-3 pt-6 border-t border-[#2b3139] mt-6">
                    <button type="button" onClick={() => setSwapModal(null)} className="px-4 py-2 rounded text-xs font-bold text-[#848e9c] hover:bg-[#2b3139] transition-colors uppercase">Cancel</button>
                    <button type="submit" disabled={loading} className="px-6 py-2 rounded text-xs font-bold uppercase transition-colors bg-[#0ea5e9] hover:bg-[#0ea5e9]/80 text-[#181a20] disabled:opacity-50">
                        {loading ? 'Processing...' : 'Execute Market Swap'}
                    </button>
                </div>
            </form>
          </div>
        </div>
      )}

      <div className="bg-[#181a20] border border-[#2b3139] p-5 rounded shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[#848e9c] text-xs font-bold uppercase tracking-wider">Saved API Connections</h3>
          <button 
            onClick={fetchKeys} 
            disabled={refreshing}
            className="text-xs text-[#2ebd85] hover:text-[#2ebd85]/80 font-medium transition-colors border border-[#2ebd85]/30 px-3 py-1 rounded bg-[#2ebd85]/5"
          >
            {refreshing ? 'Checking...' : 'Refresh Status'}
          </button>
        </div>
        
        {keys.length === 0 ? (
          <p className="text-sm text-[#848e9c] italic">No exchange keys configured yet.</p>
        ) : (
          <div className="space-y-3">
            {keys.map((k, index) => (
              <div key={index} className="flex flex-col bg-[#0b0e11] p-3 border border-[#2b3139] rounded-sm transition-all">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-[#eaecef] font-bold">{k.name}</span>
                    <div className="flex items-center space-x-2 mt-1">
                      <div className={`w-2 h-2 rounded-full ${k.is_active ? 'bg-[#2ebd85]' : 'bg-[#f6465d] animate-pulse'}`}></div>
                      <span className="text-xs text-[#848e9c]">
                        {k.exchange.toUpperCase()} - {k.is_sandbox ? 'Sandbox (Testnet)' : 'Live Market'}
                      </span>
                      {!k.is_active && (
                        <span className="text-xs text-[#f6465d] ml-2 bg-[#f6465d]/10 px-2 py-0.5 rounded cursor-help" title={k.error_msg}>
                          Connection Failed
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex space-x-4 items-center">
                    {k.is_active && (
                      <>
                        <button 
                          onClick={() => setSwapModal(k.name)}
                          className="text-[#0ea5e9] hover:text-[#0ea5e9]/80 text-xs font-bold uppercase transition-colors border border-[#0ea5e9]/30 px-3 py-1 rounded bg-[#0ea5e9]/10"
                        >
                          Quick Swap
                        </button>
                        <button 
                          onClick={() => handleFetchBalance(k.name)}
                          disabled={fetchingBalanceFor === k.name}
                          className="text-[#fcd535] hover:text-[#e5c02a] text-sm font-medium transition-colors disabled:opacity-50"
                        >
                          {fetchingBalanceFor === k.name ? 'Loading...' : balances[k.name] ? 'Hide Balance' : 'View Balance'}
                        </button>
                      </>
                    )}
                    <button 
                      onClick={() => handleDeleteClick(k.name)} 
                      disabled={loading} 
                      className="text-[#f6465d] hover:text-[#f6465d]/80 text-sm font-medium transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {balances[k.name] && (
                  <div className="mt-4 pt-3 border-t border-[#2b3139]/50 animate-fade-in">
                    <h4 className="text-[10px] text-[#848e9c] uppercase tracking-wider mb-2">Available Portfolio</h4>
                    {Object.keys(balances[k.name]).length === 0 ? (
                      <span className="text-sm text-[#848e9c]">Portfolio is empty.</span>
                    ) : (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {Object.entries(balances[k.name]).map(([coin, data]) => (
                          <div key={coin} className="bg-[#181a20] p-2 rounded border border-[#2b3139]/50 flex flex-col">
                            <span className="text-xs text-[#848e9c] font-bold">{coin}</span>
                            <span className="text-sm text-[#eaecef] font-mono mt-0.5">{data.free.toFixed(4)}</span>
                            {data.used > 0 && (
                              <span className="text-[10px] text-[#fcd535] mt-1">In Orders: {data.used.toFixed(4)}</span>
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
        <h3 className="text-[#848e9c] text-xs font-bold mb-4 uppercase tracking-wider">Add New Exchange Key</h3>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs text-[#848e9c] mb-1.5">Connection Name (e.g. "Main Algo" or "Test Bot 1")</label>
            <input type="text" required value={keyName} onChange={e => setKeyName(e.target.value)} className="w-full bg-[#0b0e11] border border-[#2b3139] text-[#eaecef] px-3 py-2 text-sm focus:outline-none focus:border-[#fcd535] transition-colors rounded-sm" placeholder="Name this connection" />
          </div>
          <div>
            <label className="block text-xs text-[#848e9c] mb-1.5">API Key</label>
            <input type="password" required value={apiKey} onChange={e => setApiKey(e.target.value)} className="w-full bg-[#0b0e11] border border-[#2b3139] text-[#eaecef] px-3 py-2 text-sm focus:outline-none focus:border-[#fcd535] transition-colors rounded-sm" placeholder="Paste your API Key here" />
          </div>
          <div>
            <label className="block text-xs text-[#848e9c] mb-1.5">Secret Key</label>
            <input type="password" required value={apiSecret} onChange={e => setApiSecret(e.target.value)} className="w-full bg-[#0b0e11] border border-[#2b3139] text-[#eaecef] px-3 py-2 text-sm focus:outline-none focus:border-[#fcd535] transition-colors rounded-sm" placeholder="Paste your Secret Key here" />
          </div>
          <div>
            <label className="block text-xs text-[#848e9c] mb-1.5">Passphrase</label>
            <input type="password" required value={passphrase} onChange={e => setPassphrase(e.target.value)} className="w-full bg-[#0b0e11] border border-[#2b3139] text-[#eaecef] px-3 py-2 text-sm focus:outline-none focus:border-[#fcd535] transition-colors rounded-sm" placeholder="Your OKX API Passphrase" />
          </div>
          <div className="flex items-center pt-2">
            <input type="checkbox" id="sandbox" checked={isSandbox} onChange={e => setIsSandbox(e.target.checked)} className="w-4 h-4 accent-[#fcd535] bg-[#0b0e11] border-[#2b3139] rounded-sm cursor-pointer" />
            <label htmlFor="sandbox" className="ml-2 text-sm text-[#eaecef] cursor-pointer">
              Use Sandbox (Testnet) Environment
            </label>
          </div>
          <div className="pt-4 border-t border-[#2b3139]">
            <button type="submit" disabled={loading} className="w-full bg-[#fcd535] text-[#181a20] px-6 py-2.5 text-sm font-semibold hover:bg-[#e5c02a] disabled:opacity-50 transition-colors rounded-sm">
              {loading ? 'Verifying...' : 'Verify & Save Securely'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}