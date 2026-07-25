import React, { useState } from 'react';
import ProxySelector from './ProxySelector.jsx';

const IBANToolModal = ({ onClose, closeLabel }) => {
    const [activeTab, setActiveTab] = useState('generate'); // generate, add, status
    const [proxyConfig, setProxyConfig] = useState({ option: 'none', proxy: null });
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [messageType, setMessageType] = useState('');
    const [generatedIBAN, setGeneratedIBAN] = useState('');
    const [ibanStatus, setIbanStatus] = useState(null);

    const handleProxyChange = (config) => {
        setProxyConfig(config);
    };

    const showMessage = (msg, type = 'info') => {
        setMessage(msg);
        setMessageType(type);
        setTimeout(() => {
            setMessage('');
            setMessageType('');
        }, 10000);
    };

    const generateIBAN = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMessage('');

        const formData = new FormData(e.target);
        const country = formData.get('country');

        try {
            const response = await fetch('/api/iban/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ country })
            });

            const result = await response.json();

            if (result.success) {
                setGeneratedIBAN(result.iban);
                showMessage(`IBAN generated: ${result.iban}`, 'success');
            } else {
                showMessage(result.error || 'Failed to generate IBAN', 'error');
            }
        } catch (error) {
            showMessage('Network error: ' + error.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const validateIBAN = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMessage('');

        const formData = new FormData(e.target);
        const iban = formData.get('iban');

        try {
            const response = await fetch('/api/iban/validate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ iban })
            });

            const result = await response.json();

            if (result.success) {
                const isValid = result.isValid;
                showMessage(
                    `IBAN validation: ${isValid ? 'Valid ✅' : 'Invalid ❌'} (Country: ${result.country}, Length: ${result.actualLength})`,
                    isValid ? 'success' : 'error'
                );
            } else {
                showMessage(result.error || 'Validation failed', 'error');
            }
        } catch (error) {
            showMessage('Network error: ' + error.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const addIBANToAdAccount = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMessage('');

        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());
        data.proxy_option = proxyConfig.option;
        data.custom_proxy = proxyConfig.proxy;

        try {
            const response = await fetch('/api/iban/add-to-ad-account', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            const result = await response.json();

            if (result.success) {
                showMessage(result.message || 'IBAN added successfully!', 'success');
            } else {
                showMessage(result.error || 'Failed to add IBAN', 'error');
            }
        } catch (error) {
            showMessage('Network error: ' + error.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const checkStatus = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMessage('');

        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());
        data.proxy_option = proxyConfig.option;
        data.custom_proxy = proxyConfig.proxy;

        try {
            const response = await fetch('/api/iban/status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            const result = await response.json();
            setIbanStatus(result);

            if (result.success) {
                showMessage(
                    result.hasIBAN
                        ? `IBAN found! ${result.ibanMethods.length} IBAN method(s) linked.`
                        : 'No IBAN linked to this ad account.',
                    result.hasIBAN ? 'success' : 'error'
                );
            } else {
                showMessage(result.error || 'Failed to check status', 'error');
            }
        } catch (error) {
            showMessage('Network error: ' + error.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex min-h-0 w-full max-w-[1100px] justify-center">
            <div className="w-full max-w-2xl rounded-2xl border border-blue-400/25 bg-[#141a22] p-6">
                <div className="mb-5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <span className="text-2xl">🏦</span>
                        <div>
                            <h3 className="text-xl font-bold text-blue-200">IBAN Management</h3>
                            <p className="text-xs text-slate-400">Generate, validate, and manage IBAN for Facebook Ads</p>
                        </div>
                    </div>
                    <button onClick={onClose}
                        className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300">
                        {closeLabel || 'Close'}
                    </button>
                </div>

                {message && (
                    <div className={`mb-4 rounded-xl px-4 py-2 text-sm ${
                        messageType === 'error'
                            ? 'border border-red-500/30 bg-red-500/10 text-red-200'
                            : 'border border-green-500/30 bg-green-500/10 text-green-200'
                    }`}>
                        {message}
                    </div>
                )}

                <div className="mb-4 flex gap-2 border-b border-white/10">
                    {[
                        { id: 'generate', label: 'Generate IBAN', icon: '🔢' },
                        { id: 'add', label: 'Add to Ad Account', icon: '➕' },
                        { id: 'status', label: 'Check Status', icon: '📊' }
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold transition-colors ${
                                activeTab === tab.id
                                    ? 'border-b-2 border-blue-500 text-blue-300'
                                    : 'text-slate-400 hover:text-slate-300'
                            }`}
                        >
                            <span>{tab.icon}</span>
                            <span className="hidden sm:inline">{tab.label}</span>
                        </button>
                    ))}
                </div>

                {activeTab === 'generate' && (
                    <div className="space-y-4">
                        <form onSubmit={generateIBAN} className="space-y-4">
                            <div>
                                <label className="mb-1 block text-xs font-semibold text-slate-400">Country</label>
                                <select name="country" defaultValue="DE"
                                    className="w-full rounded-xl border border-blue-400/15 bg-black/25 px-4 py-3 text-sm text-slate-100 outline-none">
                                    <option value="DE">Germany (DE)</option>
                                    <option value="GB">United Kingdom (GB)</option>
                                    <option value="FR">France (FR)</option>
                                    <option value="IT">Italy (IT)</option>
                                    <option value="ES">Spain (ES)</option>
                                    <option value="NL">Netherlands (NL)</option>
                                    <option value="AT">Austria (AT)</option>
                                    <option value="BE">Belgium (BE)</option>
                                </select>
                            </div>
                            <button type="submit" disabled={loading}
                                className="w-full rounded-xl bg-blue-500 px-5 py-3 text-sm font-bold text-white disabled:opacity-60">
                                {loading ? 'Generating...' : 'Generate Verified IBAN'}
                            </button>
                        </form>

                        {generatedIBAN && (
                            <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-4">
                                <div className="text-sm font-semibold text-green-300">Generated IBAN:</div>
                                <div className="mt-1 select-all rounded bg-black/30 p-2 font-mono text-sm text-slate-200">
                                    {generatedIBAN}
                                </div>
                                <div className="mt-2 text-xs text-yellow-300">
                                    ⚠️ This is a test IBAN for testing purposes. Use real banking details for production.
                                </div>
                            </div>
                        )}

                        <form onSubmit={validateIBAN} className="space-y-3 rounded-lg border border-white/10 bg-black/20 p-4">
                            <div className="text-sm font-semibold text-slate-300">Validate IBAN</div>
                            <input
                                type="text"
                                name="iban"
                                placeholder="DE89 3704 0044 0532 0130 00"
                                required
                                className="w-full rounded-lg border border-white/20 bg-black/30 px-3 py-2 text-sm text-slate-300 outline-none placeholder:text-slate-600"
                            />
                            <button type="submit" disabled={loading}
                                className="w-full rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-300 hover:bg-blue-500/20">
                                {loading ? 'Validating...' : 'Validate IBAN'}
                            </button>
                        </form>
                    </div>
                )}

                {activeTab === 'add' && (
                    <div className="space-y-4">
                        <ProxySelector onProxyChange={handleProxyChange} defaultOption="none" />
                        <form onSubmit={addIBANToAdAccount} className="space-y-4">
                            <div>
                                <label className="mb-1 block text-xs font-semibold text-slate-400">Access Token</label>
                                <input type="text" name="access_token" required placeholder="EAAC..."
                                    className="w-full rounded-xl border border-blue-400/15 bg-black/25 px-4 py-3 text-sm text-slate-100 outline-none" />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-semibold text-slate-400">Ad Account ID</label>
                                <input type="text" name="ad_account_id" required placeholder="act_123456789"
                                    className="w-full rounded-xl border border-blue-400/15 bg-black/25 px-4 py-3 text-sm text-slate-100 outline-none" />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-semibold text-slate-400">IBAN</label>
                                <input type="text" name="iban" required placeholder="DE89 3704 0044 0532 0130 00"
                                    className="w-full rounded-xl border border-blue-400/15 bg-black/25 px-4 py-3 text-sm text-slate-100 outline-none" />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-semibold text-slate-400">Account Holder Name</label>
                                <input type="text" name="account_holder_name" required placeholder="John Doe"
                                    className="w-full rounded-xl border border-blue-400/15 bg-black/25 px-4 py-3 text-sm text-slate-100 outline-none" />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-semibold text-slate-400">Bank Name (Optional)</label>
                                <input type="text" name="bank_name" placeholder="Deutsche Bank"
                                    className="w-full rounded-xl border border-blue-400/15 bg-black/25 px-4 py-3 text-sm text-slate-100 outline-none" />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-semibold text-slate-400">Country</label>
                                <select name="country" defaultValue="DE"
                                    className="w-full rounded-xl border border-blue-400/15 bg-black/25 px-4 py-3 text-sm text-slate-100 outline-none">
                                    <option value="DE">Germany</option>
                                    <option value="GB">United Kingdom</option>
                                    <option value="FR">France</option>
                                    <option value="IT">Italy</option>
                                    <option value="ES">Spain</option>
                                    <option value="NL">Netherlands</option>
                                </select>
                            </div>
                            <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                                <div className="mb-2 text-sm font-semibold text-slate-300">Billing Address</div>
                                <div className="grid grid-cols-2 gap-3">
                                    <input type="text" name="billing_address_street" placeholder="Street"
                                        className="w-full rounded-lg border border-white/20 bg-black/30 px-3 py-2 text-sm text-slate-300 outline-none" />
                                    <input type="text" name="billing_address_city" placeholder="City"
                                        className="w-full rounded-lg border border-white/20 bg-black/30 px-3 py-2 text-sm text-slate-300 outline-none" />
                                    <input type="text" name="billing_address_state" placeholder="State"
                                        className="w-full rounded-lg border border-white/20 bg-black/30 px-3 py-2 text-sm text-slate-300 outline-none" />
                                    <input type="text" name="billing_address_zip" placeholder="ZIP"
                                        className="w-full rounded-lg border border-white/20 bg-black/30 px-3 py-2 text-sm text-slate-300 outline-none" />
                                </div>
                            </div>
                            <button type="submit" disabled={loading}
                                className="w-full rounded-xl bg-blue-500 px-5 py-3 text-sm font-bold text-white disabled:opacity-60">
                                {loading ? 'Adding...' : 'Add IBAN to Ad Account'}
                            </button>
                        </form>
                    </div>
                )}

                {activeTab === 'status' && (
                    <div className="space-y-4">
                        <ProxySelector onProxyChange={handleProxyChange} defaultOption="none" />
                        <form onSubmit={checkStatus} className="space-y-4">
                            <div>
                                <label className="mb-1 block text-xs font-semibold text-slate-400">Access Token</label>
                                <input type="text" name="access_token" required placeholder="EAAC..."
                                    className="w-full rounded-xl border border-blue-400/15 bg-black/25 px-4 py-3 text-sm text-slate-100 outline-none" />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-semibold text-slate-400">Ad Account ID</label>
                                <input type="text" name="ad_account_id" required placeholder="act_123456789"
                                    className="w-full rounded-xl border border-blue-400/15 bg-black/25 px-4 py-3 text-sm text-slate-100 outline-none" />
                            </div>
                            <button type="submit" disabled={loading}
                                className="w-full rounded-xl bg-blue-500 px-5 py-3 text-sm font-bold text-white disabled:opacity-60">
                                {loading ? 'Checking...' : 'Check IBAN Status'}
                            </button>
                        </form>

                        {ibanStatus && ibanStatus.success && (
                            <div className={`rounded-xl border p-4 ${
                                ibanStatus.hasIBAN
                                    ? 'border-green-500/30 bg-green-500/10'
                                    : 'border-yellow-500/30 bg-yellow-500/10'
                            }`}>
                                <div className={`text-sm font-semibold ${
                                    ibanStatus.hasIBAN ? 'text-green-300' : 'text-yellow-300'
                                }`}>
                                    {ibanStatus.hasIBAN ? 'IBAN Linked ✅' : 'No IBAN Found'}
                                </div>
                                {ibanStatus.ibanMethods && ibanStatus.ibanMethods.length > 0 && (
                                    <div className="mt-2 space-y-2">
                                        {ibanStatus.ibanMethods.map((method, idx) => (
                                            <div key={idx} className="rounded bg-black/30 p-2 text-xs text-slate-300">
                                                <div>ID: {method.id}</div>
                                                <div>Provider: {method.provider}</div>
                                                <div>Status: {method.status}</div>
                                                <div>Primary: {method.isPrimary ? 'Yes' : 'No'}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default IBANToolModal;
