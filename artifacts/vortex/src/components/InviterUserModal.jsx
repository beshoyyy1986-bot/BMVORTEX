import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { motion } from "framer-motion";
import { useLang } from "../i18n.jsx";
import {
  useCreateTempEmail,
  useSendInvite,
  useGetTempEmailMessages,
  useExtractInviteLink,
  useGrantPermissions,
} from "@workspace/api-client-react";
import CookieInput from "./CookieInput";

export default function InviterUserModal({ onClose }) {
  const { t } = useLang();

  // Global Auth State
  const [cookies, setCookies] = useState("");
  const [businessId, setBusinessId] = useState("");
  const [fbDtsg, setFbDtsg] = useState("");
  const [lsd, setLsd] = useState("");

  // Invite Tool State
  const [generatedEmail, setGeneratedEmail] = useState("");
  const [emailToken, setEmailToken] = useState("");
  const [assetId, setAssetId] = useState("");
  const [isCheckingInbox, setIsCheckingInbox] = useState(false);
  const [activeTab, setActiveTab] = useState("invite"); // "invite" or "permissions"

  // Permissions Tool State
  const [userId, setUserId] = useState("");

  // Mutations & Queries
  const createTempEmail = useCreateTempEmail();
  const sendInvite = useSendInvite();
  const grantPermissions = useGrantPermissions();
  const { data: messagesData, isFetching: isFetchingMessages, refetch: refetchMessages } = useGetTempEmailMessages(
    { token: emailToken },
    { query: { enabled: isCheckingInbox && !!emailToken, refetchInterval: isCheckingInbox ? 5000 : false } }
  );

  const messages = messagesData?.messages || [];
  const latestMessageId = messages.length > 0 ? messages[0].id : null;

  const { data: inviteLinkData, isFetching: isFetchingLink } = useExtractInviteLink(
    { token: emailToken, messageId: latestMessageId || "" },
    { query: { enabled: !!latestMessageId && isCheckingInbox } }
  );

  useEffect(() => {
    if (inviteLinkData?.found) {
      setIsCheckingInbox(false);
    }
  }, [inviteLinkData]);

  const handleGenerateEmail = () => {
    createTempEmail.mutate(undefined, {
      onSuccess: (data) => {
        setGeneratedEmail(data.email);
        setEmailToken(data.token);
        setIsCheckingInbox(false);
      },
    });
  };

  const handleSendInvite = () => {
    sendInvite.mutate({
      data: {
        cookies,
        businessId,
        fbDtsg,
        lsd,
        email: generatedEmail,
        assetId: assetId || null,
      },
    });
  };

  const handleCheckInbox = () => {
    if (!emailToken) return;
    setIsCheckingInbox(true);
    refetchMessages();
  };

  const handleGrantPermissions = () => {
    grantPermissions.mutate({
      data: {
        cookies,
        businessId,
        fbDtsg,
        lsd,
        userId,
      },
    });
  };

  const handleCopy = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto"
    >
      <div className="w-full max-w-4xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700 bg-slate-800/50">
          <h1 className="text-2xl font-bold text-white">Meta Business Tools</h1>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-4 px-6 pt-6 border-b border-slate-700">
          <button
            onClick={() => setActiveTab("invite")}
            className={`pb-3 font-semibold transition-colors ${
              activeTab === "invite"
                ? "border-b-2 border-blue-500 text-blue-400"
                : "text-slate-400 hover:text-slate-300"
            }`}
          >
            📧 Invite Tool
          </button>
          <button
            onClick={() => setActiveTab("permissions")}
            className={`pb-3 font-semibold transition-colors ${
              activeTab === "permissions"
                ? "border-b-2 border-purple-500 text-purple-400"
                : "text-slate-400 hover:text-slate-300"
            }`}
          >
            🔐 Permissions
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Global Credentials */}
          <div className="space-y-4 p-4 border border-slate-700 rounded-lg bg-slate-800/30">
            <h3 className="font-semibold text-slate-200">Global Auth Credentials</h3>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-2">Cookies</label>
              <CookieInput
                value={cookies}
                onChange={setCookies}
                placeholder="c_user=...; xs=...;"
                className="w-full h-16"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">Business ID</label>
                <input
                  type="text"
                  value={businessId}
                  onChange={(e) => setBusinessId(e.target.value)}
                  placeholder="1234567890"
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">fb_dtsg</label>
                <input
                  type="text"
                  value={fbDtsg}
                  onChange={(e) => setFbDtsg(e.target.value)}
                  placeholder="AQG..."
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">LSD</label>
                <input
                  type="text"
                  value={lsd}
                  onChange={(e) => setLsd(e.target.value)}
                  placeholder="xyz..."
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {/* INVITE TOOL */}
          {activeTab === "invite" && (
            <div className="space-y-4">
              {/* 1. Generate Email */}
              <div className="space-y-3 p-4 border border-slate-700 rounded-lg bg-slate-800/30">
                <h4 className="font-semibold text-blue-400 text-sm">1. Temp Email Address</h4>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={generatedEmail}
                    placeholder="Waiting for generation..."
                    className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded text-sm text-blue-400 font-mono placeholder-slate-500 focus:outline-none"
                  />
                  <button
                    onClick={() => handleCopy(generatedEmail)}
                    className="px-3 py-2 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded text-sm text-slate-300 transition-colors"
                  >
                    📋
                  </button>
                  <button
                    onClick={handleGenerateEmail}
                    disabled={createTempEmail.isPending}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 rounded text-sm text-white font-semibold transition-colors"
                  >
                    {createTempEmail.isPending ? "..." : "Generate"}
                  </button>
                </div>
              </div>

              {/* 2. Send Invite */}
              <div className="space-y-3 p-4 border border-slate-700 rounded-lg bg-slate-800/30">
                <h4 className="font-semibold text-blue-400 text-sm">2. Send Invite</h4>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-2">Asset ID (Optional)</label>
                  <input
                    type="text"
                    value={assetId}
                    onChange={(e) => setAssetId(e.target.value)}
                    placeholder="Page or Ad Account ID"
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <button
                  onClick={handleSendInvite}
                  disabled={
                    sendInvite.isPending ||
                    !generatedEmail ||
                    !cookies ||
                    !businessId ||
                    !fbDtsg ||
                    !lsd
                  }
                  className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 rounded text-sm text-white font-semibold transition-colors"
                >
                  {sendInvite.isPending ? "Sending..." : "Execute Send Invite"}
                </button>

                {sendInvite.isSuccess && sendInvite.data && (
                  <div
                    className={`p-3 rounded text-xs ${
                      sendInvite.data.success
                        ? "bg-green-900/30 border border-green-700 text-green-300"
                        : "bg-red-900/30 border border-red-700 text-red-300"
                    }`}
                  >
                    {sendInvite.data.message}
                  </div>
                )}
              </div>

              {/* 3. Check Inbox */}
              <div className="space-y-3 p-4 border border-slate-700 rounded-lg bg-slate-800/30">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-blue-400 text-sm">3. Inbox Polling</h4>
                  <button
                    onClick={handleCheckInbox}
                    disabled={!emailToken || isCheckingInbox}
                    className="px-3 py-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 rounded text-xs text-slate-300 transition-colors"
                  >
                    {isCheckingInbox ? "Polling..." : "Check Inbox"}
                  </button>
                </div>

                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {!emailToken ? (
                    <div className="text-center py-4 border border-dashed border-slate-600 rounded text-xs text-slate-500 font-mono">
                      Awaiting temp email...
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="text-center py-4 border border-dashed border-slate-600 rounded text-xs text-slate-500 font-mono">
                      {isCheckingInbox ? "Listening for mail..." : "No messages yet"}
                    </div>
                  ) : (
                    messages.map((msg) => (
                      <div key={msg.id} className="p-2 border border-slate-600 rounded bg-slate-700/50 text-xs">
                        <div className="flex justify-between gap-2">
                          <span className="text-slate-200 font-semibold truncate">{msg.subject}</span>
                          <span className="text-slate-500 text-[10px] shrink-0">
                            {new Date(msg.createdAt).toLocaleTimeString()}
                          </span>
                        </div>
                        <div className="text-slate-400 text-[10px]">{msg.from}</div>
                      </div>
                    ))
                  )}
                </div>

                {inviteLinkData?.found && inviteLinkData.link && (
                  <div className="p-3 border border-green-700/50 rounded bg-green-900/20 space-y-2">
                    <div className="text-green-400 text-xs font-semibold">✓ Invite Link Extracted</div>
                    <div className="flex gap-2">
                      <input
                        readOnly
                        value={inviteLinkData.link}
                        className="flex-1 px-2 py-1 bg-slate-700 border border-green-700 rounded text-xs text-green-400 font-mono"
                      />
                      <button
                        onClick={() => handleCopy(inviteLinkData.link)}
                        className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-xs text-slate-300"
                      >
                        📋
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* PERMISSIONS TOOL */}
          {activeTab === "permissions" && (
            <div className="space-y-4">
              <div className="space-y-3 p-4 border border-slate-700 rounded-lg bg-slate-800/30">
                <h4 className="font-semibold text-purple-400 text-sm">Grant Admin Permissions</h4>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-2">Target User ID</label>
                  <input
                    type="text"
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                    placeholder="1000..."
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                  />
                </div>

                <button
                  onClick={handleGrantPermissions}
                  disabled={
                    grantPermissions.isPending ||
                    !userId ||
                    !cookies ||
                    !businessId ||
                    !fbDtsg ||
                    !lsd
                  }
                  className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-600 rounded text-sm text-white font-semibold transition-colors"
                >
                  {grantPermissions.isPending ? "Granting..." : "Execute Grant"}
                </button>

                {grantPermissions.isSuccess && grantPermissions.data && (
                  <div
                    className={`p-3 rounded text-xs ${
                      grantPermissions.data.success
                        ? "bg-purple-900/30 border border-purple-700 text-purple-300"
                        : "bg-red-900/30 border border-red-700 text-red-300"
                    }`}
                  >
                    {grantPermissions.data.message}
                  </div>
                )}
              </div>

              <div className="space-y-2 p-4 border border-slate-700 rounded-lg bg-slate-800/30">
                <h4 className="font-semibold text-slate-300 text-sm">Operations Included</h4>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    "MANAGE",
                    "CREATE_CONTENT",
                    "BASIC_CARDS",
                    "MESSAGE",
                    "EDIT_PROFILE",
                    "ANALYZE",
                    "MODERATE",
                    "ADVERTISE",
                    "CASHIER_ROLE",
                    "VIEW_COST",
                    "MANAGE_LEADS",
                    "PUBLISH_CONTENT",
                  ].map((task) => (
                    <div
                      key={task}
                      className="text-[10px] font-mono px-2 py-1 bg-slate-700/50 border border-slate-600 rounded text-slate-300"
                    >
                      ✓ {task}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

InviterUserModal.propTypes = {
  onClose: PropTypes.func.isRequired,
};
