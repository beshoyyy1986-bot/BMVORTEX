import React, { useState } from 'react';
import PropTypes from 'prop-types';

const ProxySelector = ({ onProxyChange, defaultOption = 'none' }) => {
    const [proxyOption, setProxyOption] = useState(defaultOption);
    const [customProxy, setCustomProxy] = useState('');

    const handleOptionChange = (option) => {
        setProxyOption(option);
        onProxyChange({ option, proxy: option === 'custom' ? customProxy : null });
    };

    const handleCustomProxyChange = (value) => {
        setCustomProxy(value);
        if (proxyOption === 'custom') {
            onProxyChange({ option: 'custom', proxy: value });
        }
    };

    const btnClass = (active) =>
        `rounded-lg border px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
            active
                ? 'border-blue-400/60 bg-blue-500/20 text-blue-100'
                : 'border-white/15 bg-black/20 text-slate-400 hover:border-white/25 hover:bg-white/5'
        }`;

    return (
        <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-400 mr-1">Proxy:</span>
            {[
                { value: 'none', label: 'No Proxy' },
                { value: 'site', label: 'Site Proxy' },
                { value: 'custom', label: 'Custom Proxy' }
            ].map((opt) => (
                <button
                    key={opt.value}
                    type="button"
                    className={btnClass(proxyOption === opt.value)}
                    onClick={() => handleOptionChange(opt.value)}
                >
                    {opt.label}
                </button>
            ))}
            {proxyOption === 'custom' && (
                <input
                    type="text"
                    placeholder="http://proxy:port"
                    value={customProxy}
                    onChange={(e) => handleCustomProxyChange(e.target.value)}
                    className="w-48 rounded-lg border border-white/20 bg-black/30 px-2 py-1.5 text-xs text-slate-300 outline-none placeholder:text-slate-600"
                />
            )}
        </div>
    );
};

ProxySelector.propTypes = {
    onProxyChange: PropTypes.func.isRequired,
    defaultOption: PropTypes.string
};

export default ProxySelector;
