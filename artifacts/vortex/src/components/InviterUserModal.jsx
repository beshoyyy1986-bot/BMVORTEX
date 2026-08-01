import React, { useState, useCallback } from "react";
import PropTypes from "prop-types";
import axios from "axios";
import { motion } from "framer-motion";
import CookieInput from "./CookieInput";
import { useLang } from "../i18n.jsx";

/**
 * InviterUserModal — دعوة مستخدمين إلى Business Manager
 * Sends Business Manager invitations to multiple users using the unified extract function
 */
export default function InviterUserModal({ onClose }) {
  const { t } = useLang();

  // Form state
  const [cookies, setCookies] = useState("");
  const [businessId, setBusinessId] = useState("");
  const [emailList, setEmailList] = useState("");

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [results, setResults] = useState([]);
  const [extractedData, setExtractedData] = useState(null);

  /**
   * Extract session data using the unified extraction API
   * (same as other tools in the app)
   */
  const handleExtractSession = useCallback(async () => {
    if (!cookies.trim()) {
      setError(t("enter_cookies"));
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const response = await axios.post("/api/extract/session", {
        cookies,
        url: "https://business.facebook.com/",
      });

      if (response.data.ok) {
        setExtractedData(response.data);
        setSuccess(t("session_extracted") || "تم استخراج الجلسة بنجاح");
        // Auto-fill business ID if available
        if (response.data.bizId && !businessId) {
          setBusinessId(response.data.bizId);
        }
      } else {
        setError(response.data.error || t("extraction_failed"));
      }
    } catch (err) {
      setError(
        err.response?.data?.error ||
        err.message ||
        t("connection_error")
      );
    } finally {
      setLoading(false);
    }
  }, [cookies, businessId, t]);

  /**
   * Send invitations to the email list
   */
  const handleSendInvites = useCallback(async () => {
    // Validation
    if (!cookies.trim()) {
      setError(t("enter_cookies"));
      return;
    }
    if (!businessId.trim()) {
      setError(t("enter_business_id") || "يرجى إدخال معرف الأعمال");
      return;
    }
    if (!emailList.trim()) {
      setError(t("enter_emails") || "يرجى إدخال قائمة البريد الإلكتروني");
      return;
    }

    // Parse emails
    const emails = emailList
      .split("\n")
      .map((e) => e.trim())
      .filter((e) => e && e.includes("@"));

    if (emails.length === 0) {
      setError(t("no_valid_emails") || "لا توجد رسائل بريد إلكترونية صحيحة");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");
    setResults(
      emails.map((email) => ({
        email,
        status: "pending",
        message: "",
      }))
    );

    try {
      // Send invites
      for (let i = 0; i < emails.length; i++) {
        const email = emails[i];
        try {
          const response = await axios.post("/api/meta/send-invite", {
            cookies,
            businessId,
            email,
          });

          setResults((prev) =>
            prev.map((r) =>
              r.email === email
                ? {
                    ...r,
                    status: response.data.success ? "success" : "error",
                    message: response.data.message || response.data.error || "",
                  }
                : r
            )
          );
        } catch (err) {
          setResults((prev) =>
            prev.map((r) =>
              r.email === email
                ? {
                    ...r,
                    status: "error",
                    message: err.response?.data?.message || err.message || "خطأ",
                  }
                : r
            )
          );
        }
      }

      setSuccess(t("invites_sent") || "انتهت عملية الإرسال");
    } catch (err) {
      setError(err.message || t("error_occurred"));
    } finally {
      setLoading(false);
    }
  }, [cookies, businessId, emailList, t]);

  const handleReset = useCallback(() => {
    setCookies("");
    setBusinessId("");
    setEmailList("");
    setError("");
    setSuccess("");
    setResults([]);
    setExtractedData(null);
  }, []);

  const validEmails = emailList
    .split("\n")
    .filter((e) => e.trim() && e.includes("@")).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="flex min-h-screen flex-col gap-6 bg-gradient-to-br from-slate-900 to-slate-950 p-6"
    >
      <div className="mx-auto w-full max-w-2xl space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-black text-white">
              دعوة مستخدمين إلى Business Manager
            </h1>
            <button
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
              aria-label="إغلاق"
            >
              ✕
            </button>
          </div>
          <p className="text-slate-400">
            أرسل دعوات لمستخدمين للانضمام إلى حسابك في Meta Business Manager
          </p>
        </div>

        {/* Alert Messages */}
        {error && (
          <div className="rounded-xl bg-red-500/20 border border-red-500/40 p-4 text-sm text-red-200">
            <span className="font-semibold">خطأ:</span> {error}
          </div>
        )}
        {success && (
          <div className="rounded-xl bg-green-500/20 border border-green-500/40 p-4 text-sm text-green-200">
            <span className="font-semibold">نجاح:</span> {success}
          </div>
        )}

        {/* Extracted Data Info */}
        {extractedData && (
          <div className="rounded-xl bg-blue-500/20 border border-blue-500/40 p-4 space-y-2 text-sm text-blue-200">
            <div className="font-semibold">✓ تم استخراج بيانات الجلسة:</div>
            {extractedData.userId && (
              <div>معرف المستخدم: {extractedData.userId}</div>
            )}
            {extractedData.bizId && (
              <div>معرف الأعمال: {extractedData.bizId}</div>
            )}
            {extractedData.platform && (
              <div>المنصة: {extractedData.platform}</div>
            )}
          </div>
        )}

        {/* Form */}
        <div className="space-y-6 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
          {/* Cookies Input */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-white">
              ملف تعريفات الارتباط (Cookies)
            </label>
            <div className="space-y-2">
              <CookieInput
                value={cookies}
                onChange={(val) => {
                  setCookies(val);
                  setExtractedData(null);
                }}
                placeholder="الصق ملف تعريفات الارتباط من Facebook هنا..."
              />
            </div>
          </div>

          {/* Extract Button */}
          <button
            onClick={handleExtractSession}
            disabled={!cookies.trim() || loading}
            className="w-full rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 disabled:opacity-50 py-2.5 px-4 font-semibold text-white transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <span className="animate-spin">⌛</span>
                جاري الاستخراج...
              </>
            ) : (
              <>📋 استخراج بيانات الجلسة</>
            )}
          </button>

          {/* Business ID */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-white">
              معرف Business ID
            </label>
            <input
              type="text"
              value={businessId}
              onChange={(e) => setBusinessId(e.target.value)}
              placeholder="أدخل رقم Business Manager..."
              className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
            />
          </div>

          {/* Email List */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-white">
              قائمة البريد الإلكتروني (واحد لكل سطر)
            </label>
            <textarea
              value={emailList}
              onChange={(e) => setEmailList(e.target.value)}
              placeholder="user1@example.com&#10;user2@example.com&#10;user3@example.com"
              rows={6}
              className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 font-mono text-sm"
            />
            <div className="text-xs text-slate-400">
              عدد الرسائل: {validEmails}
            </div>
          </div>

          {/* Results */}
          {results.length > 0 && (
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-white">
                نتائج الإرسال
              </label>
              <div className="space-y-1 max-h-48 overflow-y-auto rounded-lg bg-black/30 p-3">
                {results.map((result, idx) => (
                  <div
                    key={idx}
                    className={`text-xs p-2 rounded flex justify-between items-center ${
                      result.status === "success"
                        ? "bg-green-500/20 text-green-200"
                        : result.status === "error"
                          ? "bg-red-500/20 text-red-200"
                          : "bg-blue-500/20 text-blue-200"
                    }`}
                  >
                    <span>{result.email}</span>
                    <span>
                      {result.status === "pending"
                        ? "⏳"
                        : result.status === "success"
                          ? "✓"
                          : "✗"}
                      {result.message && ` ${result.message}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              onClick={handleSendInvites}
              disabled={
                !cookies.trim() ||
                !businessId.trim() ||
                !emailList.trim() ||
                loading
              }
              className="flex-1 rounded-lg bg-green-600 hover:bg-green-700 disabled:bg-slate-600 disabled:opacity-50 py-2.5 px-4 font-semibold text-white transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="animate-spin">⌛</span>
                  جاري الإرسال...
                </>
              ) : (
                <>✉️ إرسال الدعوات</>
              )}
            </button>
            <button
              onClick={handleReset}
              disabled={loading}
              className="rounded-lg border border-white/20 hover:bg-white/10 disabled:opacity-50 py-2.5 px-6 font-semibold text-white transition-colors"
            >
              إعادة تعيين
            </button>
          </div>
        </div>

        {/* Info Box */}
        <div className="rounded-xl bg-slate-800/50 border border-slate-700 p-4 space-y-2 text-xs text-slate-300">
          <div className="font-semibold text-slate-200">💡 نصائح:</div>
          <ul className="space-y-1 list-disc list-inside">
            <li>يتم استخراج بيانات الجلسة تلقائياً من الكوكيز</li>
            <li>تأكد من أن حسابك له صلاحيات إدارية في Business Manager</li>
            <li>سيتم إرسال دعوات منفصلة لكل عنوان بريد إلكتروني</li>
            <li>قد تستغرق معالجة الدعوات بعض الوقت</li>
          </ul>
        </div>
      </div>
    </motion.div>
  );
}

InviterUserModal.propTypes = {
  onClose: PropTypes.func.isRequired,
};
