import React, { useState } from "react";
import PropTypes from "prop-types";

// Eye (visible) / eye-off (hidden) icons
function EyeIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
EyeIcon.propTypes = { size: PropTypes.number };

function EyeOffIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c6.5 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3.5 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}
EyeOffIcon.propTypes = { size: PropTypes.number };

/**
 * A password <input> with a built-in show/hide toggle.
 * Accepts a `className` matching the surrounding inputs so the UI stays
 * consistent, and forwards all other input props. The eye button is
 * positioned on the trailing side and is RTL-aware.
 */
export default function PasswordInput({
  className = "",
  wrapperClassName = "",
  isDark = true,
  toggleAriaLabel = "Toggle password visibility",
  ...inputProps
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className={`relative ${wrapperClassName || "w-full"}`}>
      <input
        {...inputProps}
        type={visible ? "text" : "password"}
        // Extra inline-end padding so text never runs under the icon (works LTR + RTL).
        className={`${className} pe-11`}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setVisible((v) => !v)}
        aria-label={toggleAriaLabel}
        aria-pressed={visible}
        className={`absolute inset-y-0 end-2 my-auto flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
          isDark
            ? "text-slate-400 hover:text-slate-200 hover:bg-white/10"
            : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
        }`}
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}
PasswordInput.propTypes = {
  className: PropTypes.string,
  wrapperClassName: PropTypes.string,
  isDark: PropTypes.bool,
  toggleAriaLabel: PropTypes.string,
};
