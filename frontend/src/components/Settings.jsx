import { useState, useEffect } from 'react';
import { apiClient } from '../api/client';

export default function Settings({ setError }) {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(false);
  
  const [keyName, setKeyName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [isSandbox, setIsSandbox] = useState(true);

  const fetchKeys = async () => {
    try {
      const response = await apiClient.get('/api/keys');
      if (response.data.error) throw new Error(response.data.error);
      setKeys(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    fetchKeys();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.post('/api/keys', {
        name: keyName,
        exchange: 'okx',
        api_key: apiKey,
        api_secret: apiSecret,
        passphrase: passphrase,
        is_sandbox: isSandbox
      });
      
      if (response.data.error) {
        throw new Error(response.data.error);
      }

      alert(`Key '${keyName}' encrypted, verified and stored successfully.`);
      setKeyName('');
      setApiKey('');
      setApiSecret('');
      setPassphrase('');
      fetchKeys();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
    setLoading(false);
  };

  const handleDelete = async (delName) => {
    if (!window.confirm(`Are you sure you want to delete the key '${delName}'?`)) return;
    setLoading(true);
    try {
      // FIX: We sturen de naam nu mee in de URL, niet meer als query parameter!
      const response = await apiClient.delete(`/api/keys/${delName}`);
      if (response.data.error) throw new Error(response.data.error);
      fetchKeys();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
    setLoading(false);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 w-full fade-in">
      
      <div className="bg-[#181a20] border border-[#2b3139] p-5 rounded shadow-sm">
        <h3 className="text-[#848e9c] text-xs font-bold uppercase tracking-wider mb-4">Saved API Connections</h3>
        
        {keys.length === 0 ? (
          <p className="text-sm text-[#848e9c] italic">No exchange keys configured yet.</p>
        ) : (
          <div className="space-y-3">
            {keys.map((k, index) => (
              <div key={index} className="flex items-center justify-between bg-[#0b0e11] p-3 border border-[#2b3139] rounded-sm">
                <div className="flex flex-col">
                  <span className="text-[#eaecef] font-bold">{k.name}</span>
                  <div className="flex items-center space-x-2 mt-1">
                    {/* Het dynamische statuslampje */}
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
                <button 
                  onClick={() => handleDelete(k.name)} 
                  disabled={loading} 
                  className="text-[#f6465d] hover:text-[#f6465d]/80 text-sm font-medium transition-colors"
                >
                  Delete
                </button>
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
              {loading ? 'Verifying & Saving...' : 'Verify & Save Securely'}
            </button>
            <p className="text-center text-[#848e9c] text-xs mt-3">
              Keys are tested via CCXT before being encrypted locally with AES-128.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}