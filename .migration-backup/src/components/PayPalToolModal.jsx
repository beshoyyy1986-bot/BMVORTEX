import React, { useState, useEffect } from 'react';
import ProxySelector from './ProxySelector.jsx';

const PayPalToolModal = ({ onClose, closeLabel }) => {
    const [step, setStep] = useState('input'); // input, session, popup, verify, complete
    const [proxyConfig, setProxyConfig] = useState({ option: 'none', proxy: null });
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [messageType, setMessageType] = useState('');
    const [sessionData, setSessionData] = useState(null);
    const [formData, setFormData] = useState({
        access_token: '',
        ad_account_id: '',
    });
    const [verificationResult, setVerificationResult] = useState(null);

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

    const generateSession = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMessage('');

        const data = {
            access_token: formData.access_token,
            ad_account_id: formData.ad_account_id,
            proxy_option: proxyConfig.option,
            custom_proxy: proxyConfig.proxy
        };

        try {
            const response = await fetch('/api/paypal/generate-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            const result = await response.json();

            if (result.success) {
                setSessionData(result.sessionData);
                setStep('session');
                showMessage('Session generated! Open PayPal popup to authorize.', 'success');
            } else {
                showMessage(result.error || 'Failed to generate session', 'error');
            }
        } catch (error) {
            showMessage('Network error: ' + error.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const openPayPalPopup = () => {
        if (!sessionData?.paypalUrl) {
            showMessage('No PayPal URL available', 'error');
            return;
        }

        const width = 600;
        const height = 700;
        const left = (window.screen.width - width) / 2;
        const top = (window.screen.height - height) / 2;

        const popup = window.open(
            sessionData.paypalUrl,
            'paypalAuth',
            `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes`
        );

        if (!popup) {
            showMessage('Popup blocked! Please allow popups for this site.', 'error');
            return;
        }

        setStep('popup');

        // Poll for popup close
        const pollTimer = setInterval(() => {
            if (popup.closed) {
                clearInterval(pollTimer);
                setStep('verify');
                verifyPayPalLink();
            }
        }, 1000);
    };

    const verifyPayPalLink = async () => {
        setLoading(true);
        setMessage('');

        try {
            const response = await fetch('/api/paypal/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    access_token: formData.access_token,
                    ad_account_id: formData.ad_account_id,
                    proxy_option: proxyConfig.option,
                    custom_proxy: proxyConfig.proxy
                })
            });

            const result = await response.json();
            setVerificationResult(result);

            if (result.success) {
                if (result.isLinked) {
                    setStep('complete');
                    showMessage('PayPal successfully linked to ad account!', 'success');
                } else {
                    setStep('verify');
                    showMessage('PayPal not yet linked. User authorization may still be pending.', 'error');
                }
            } else {
                showMessage(result.error || 'Verification failed', 'error');
            }
        } catch (error) {
            showMessage('Network error: ' + error.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const forceComplete = async () => {
        setLoading(true);
        setMessage('');

        try {
            const response = await fetch('/api/paypal/complete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    access_token: formData.access_token,
                    ad_account_id: formData.ad_account_id,
                    session_token: sessionData?.sessionToken,
                    proxy_option: proxyConfig.option,
                    custom_proxy: proxyConfig.proxy
                })
            });

            const result = await response.json();

            if (result.success) {
                setStep('complete');
                showMessage(result.message || 'PayPal linking completed!', 'success');
            } else {
                showMessage(result.error || 'Failed to complete linking', 'error');
            }
        } catch (error) {
            showMessage('Network error: ' + error.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const disconnectPayPal = async () => {
        if (!window.confirm('Are you sure you want to disconnect PayPal from this ad account?')) {
            return;
        }

        setLoading(true);
        try {
            const response = await fetch('/api/paypal/disconnect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    access_token: formData.access_token,
                    ad_account_id: formData.ad_account_id,
                    payment_method_id: verificationResult?.paypalMethod?.id,
                    proxy_option: proxyConfig.option,
                    custom_proxy: proxyConfig.proxy
                })
            });

            const result = await response.json();
            if (result.success) {
                showMessage('PayPal disconnected successfully', 'success');
                setStep('input');
                setSessionData(null);
                setVerificationResult(null);
            } else {
                showMessage(result.error || 'Disconnect failed', 'error');
            }
        } catch (error) {
            showMessage('Network error: ' + error.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const renderStep = () => {
        switch (step) {
            case 'input':
                return (
                    <form onSubmit={generateSession} className="space-y-4">
                        <div>
                            <label className="mb-1 block text-xs font-semibold text-slate-400">Access Token</label>
                            <input
                                type="text"
                                value={formData.access_token}
                                onChange={(e) => setFormData({ ...formData, access_token: e.target.value })}
                                required
                                placeholder="EAAC..."
                                className="w-full rounded-xl border border-blue-400/15 bg-black/25 px-4 py-3 text-sm text-slate-100 outline-none"
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-semibold text-slate-400">Ad Account ID</label>
                            <input
                                type="text"
                                value={formData.ad_account_id}
                                onChange={(e) => setFormData({ ...formData, ad_account_id: e.target.value })}
                                required
                                placeholder="act_123456789"
                                className="w-full rounded-xl border border-blue-400/15 bg-black/25 px-4 py-3 text-sm text-slate-100 outline-none"
                            />
                        </div>
                        <ProxySelector onProxyChange={handleProxyChange} defaultOption="none" />
                        <button type="submit" disabled={loading}
                            className="w-full rounded-xl bg-blue-500 px-5 py-3 text-sm font-bold text-white disabled:opacity-60">
                            {loading ? 'Generating...' : 'Generate PayPal Session'}
                        </button>
                    </form>
                );

            case 'session':
                return (
                    <div className="space-y-4">
                        <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-4">
                            <div className="text-sm font-semibold text-green-300">Session Generated!</div>
                            <div className="mt-1 text-xs text-slate-400">
                                Ad Account: {formData.ad_account_id}
                            </div>
                            {sessionData?.sessionToken && (
                                <div className="mt-1 text-xs text-slate-400">
                                    Session Token: {sessionData.sessionToken.substring(0, 20)}...
                                </div>
                            )}
                        </div>

                        <div className="space-y-3">
                            <button
                                onClick={openPayPalPopup}
                                className="w-full rounded-xl bg-blue-500 px-5 py-3 text-sm font-bold text-white"
                            >
                                Open PayPal Authorization Popup
                            </button>

                            <button
                                onClick={() => {
                                    if (sessionData?.paypalUrl) {
                                        window.open(sessionData.paypalUrl, '_blank');
                                    }
                                }}
                                className="w-full rounded-xl border border-white/20 bg-white/5 px-5 py-3 text-sm font-semibold text-slate-300"
                            >
                                Open in New Tab
                            </button>
                        </div>

                        <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-3">
                            <div className="text-xs text-yellow-300">
                                Instructions:
                            </div>
                            <ol className="mt-1 list-inside list-decimal text-xs text-slate-400">
                                <li>Click "Open PayPal Authorization Popup"</li>
                                <li>Log in to your PayPal account</li>
                                <li>Select the card you want to link</li>
                                <li>Click "Agree & Link" or "Authorize"</li>
                                <li>Close the popup when done</li>
                                <li>The tool will automatically verify the link</li>
                            </ol>
                        </div>

                        <button
                            onClick={() => setStep('input')}
                            className="w-full rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-slate-300"
                        >
                            Back to Input
                        </button>
                    </div>
                );

            case 'popup':
                return (
                    <div className="space-y-4 text-center">
                        <div className="text-4xl">⏳</div>
                        <div className="text-lg font-bold text-blue-200">Waiting for PayPal Authorization</div>
                        <div className="text-sm text-slate-400">
                            Please complete the PayPal authorization in the popup window.
                        </div>
                        <div className="text-xs text-slate-500">
                            This window will automatically update when the popup is closed.
                        </div>
                        <button
                            onClick={() => {
                                setStep('verify');
                                verifyPayPalLink();
                            }}
                            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300"
                        >
                            I've Completed Authorization
                        </button>
                    </div>
                );

            case 'verify':
                return (
                    <div className="space-y-4">
                        <div className="text-lg font-bold text-blue-200">Verifying PayPal Link</div>
                        {verificationResult && (
                            <div className={`rounded-xl border p-4 ${
                                verificationResult.isLinked
                                    ? 'border-green-500/30 bg-green-500/10'
                                    : 'border-yellow-500/30 bg-yellow-500/10'
                            }`}>
                                <div className={`text-sm font-semibold ${
                                    verificationResult.isLinked ? 'text-green-300' : 'text-yellow-300'
                                }`}>
                                    {verificationResult.isLinked
                                        ? 'PayPal is Linked!'
                                        : 'PayPal Not Yet Linked'
                                    }
                                </div>
                                {verificationResult.paypalMethod && (
                                    <div className="mt-2 text-xs text-slate-400">
                                        <div>Method ID: {verificationResult.paypalMethod.id}</div>
                                        <div>Provider: {verificationResult.paypalMethod.provider}</div>
                                    </div>
                                )}
                            </div>
                        )}
                        <div className="flex gap-3">
                            <button
                                onClick={forceComplete}
                                disabled={loading}
                                className="flex-1 rounded-xl bg-blue-500 px-5 py-3 text-sm font-bold text-white disabled:opacity-60"
                            >
                                {loading ? 'Processing...' : 'Force Complete Link'}
                            </button>
                            <button
                                onClick={verifyPayPalLink}
                                disabled={loading}
                                className="flex-1 rounded-xl border border-white/20 bg-white/5 px-5 py-3 text-sm font-semibold text-slate-300 disabled:opacity-60"
                            >
                                Verify Again
                            </button>
                        </div>
                        <button
                            onClick={() => setStep('input')}
                            className="w-full rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-slate-300"
                        >
                            Back to Input
                        </button>
                    </div>
                );

            case 'complete':
                return (
                    <div className="space-y-4">
                        <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-4 text-center">
                            <div className="text-4xl mb-2">✅</div>
                            <div className="text-lg font-bold text-green-300">PayPal Linked Successfully!</div>
                            <div className="mt-1 text-sm text-slate-400">
                                PayPal has been successfully linked to ad account: {formData.ad_account_id}
                            </div>
                        </div>

                        {verificationResult?.paypalMethod && (
                            <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                                <div className="text-xs font-semibold text-slate-400 mb-1">Payment Method Details:</div>
                                <div className="text-xs text-slate-300 space-y-1">
                                    <div>ID: {verificationResult.paypalMethod.id}</div>
                                    <div>Provider: {verificationResult.paypalMethod.provider}</div>
                                    <div>Type: {verificationResult.paypalMethod.type}</div>
                                </div>
                            </div>
                        )}

                        <div className="flex gap-3">
                            <button
                                onClick={disconnectPayPal}
                                className="flex-1 rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-3 text-sm font-semibold text-red-300 hover:bg-red-500/20"
                            >
                                Disconnect PayPal
                            </button>
                            <button
                                onClick={() => {
                                    setStep('input');
                                    setSessionData(null);
                                    setVerificationResult(null);
                                }}
                                className="flex-1 rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-slate-300"
                            >
                                Link Another Account
                            </button>
                        </div>
                    </div>
                );

            default:
                return <div className="text-slate-400">Unknown step</div>;
        }
    };

    return (
        <div className="flex min-h-0 w-full max-w-[1100px] justify-center">
            <div className="w-full max-w-2xl rounded-2xl border border-blue-400/25 bg-[#141a22] p-6">
                <div className="mb-5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <span className="text-2xl">💰</span>
                        <div>
                            <h3 className="text-xl font-bold text-blue-200">PayPal Link Tool</h3>
                            <p className="text-xs text-slate-400">Link PayPal to Facebook Ad Account</p>
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

                {renderStep()}
            </div>
        </div>
    );
};

export default PayPalToolModal;
