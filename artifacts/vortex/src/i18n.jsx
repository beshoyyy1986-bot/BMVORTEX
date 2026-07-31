import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import PropTypes from "prop-types";

// ── Translation dictionary ────────────────────────────────────────
// Every user-facing string in the app is keyed here. Add new keys in
// BOTH `en` and `ar`. Use t("key") in components.
const dict = {
  en: {
    // Header / general
    dashboard: "Professional Dashboard",
    control: "Control Modules",
    status: "System Status",
    online: "VORTEX ONLINE",
    siteName: "VORTEX",
    siteTagline: "Control Panel",
    login: "Sign In",
    signup: "Sign Up",
    logout: "Sign Out",
    admin: "Admin Dashboard",
    support: "Support",
    close: "Close",
    back: "Back",
    cancel: "Cancel",
    save: "Save",
    loading: "Loading…",
    processing: "Processing…",
    theme_light: "Light",
    theme_dark: "Dark",

    // Cards
    locked: "LOCKED",
    hot: "HOT",
    card_hint: "Module appears for all users, unlocks after plan check.",

    // Card titles
    "card.bm_meta_tool": "BM Meta Tool",
    "card.meta_ads_one_way": "Meta Ads One Way",
    "card.mini_meta_2": "Mini Meta 2$",
    "card.cc_from_bm": "CC FROM BM",
    "card.bm_creator": "CREATE BM & AD ACC & INFO",
    "card.vortex_meta_tools": "Vortex Meta Tools",
    "card.remove_payment":    "Remove Payment",
    "card.add_funds_meta":    "Add Funds Metagraph",
    "card.add_primary_cc":    "Add Primary CC",
    "card.switch_bm_old":     "Switch BM to Old",
    "card.cc_tools": "Vortex CC Tools",
    "card.funds": "Add Funds",
    "card.ads": "Ads Creation",
    "card.cards": "Add Cards",
    "card.paypal": "Add PayPal",
    "card.gateway": "Link PayPal Gateway",
    "card.iban": "Add IBAN",
    "card.methods": "Methods",
    "card.debug": "Debug Data",
    "card.generator": "CC Generator",
    "card.checker": "CC Checker",
    "card.email": "Email Checker",
    "card.social": "Social Gateway Checker",
    "card.proxy": "Proxy Tools",
    "card.support": "Support Center",

    // Auth
    auth_signin_title: "Sign In",
    auth_signup_title: "Create Account",
    auth_signin_sub: "Access your Vortex workspace.",
    auth_signup_sub: "Create your account with email and password.",
    auth_secure_signin: "Secure Sign In",
    auth_create_account: "Create Account",
    username: "Username",
    email: "Email",
    password: "Password",
    confirm_password: "Confirm password",
    min8: "Minimum 8 characters",
    repeat_password: "Repeat password",
    remember_me: "Remember me",
    forgot_password: "Forgot password?",
    no_account: "Don't have an account?",
    have_account: "Already have an account?",
    create_account_link: "Create account",
    signin_link: "Sign in",
    username_placeholder: "vortex_user",
    email_placeholder: "you@example.com",

    // Forgot / reset
    forgot_title: "Forgot Password",
    forgot_sub: "Enter your email to receive a reset link.",
    send_reset: "Send reset link",
    sending: "Sending…",
    reset_title: "Reset Password",
    reset_sub: "Choose a new password for your account.",
    new_password: "New password",
    confirm_new_password: "Confirm new password",
    update_password: "Update password",
    updating: "Updating…",
    reset_link_sent: "If this email exists, a reset link was sent.",
    reset_email_fail: "Unable to send reset email.",
    password_updated: "Password updated successfully.",
    reset_failed: "Failed to reset password.",

    // Validation / messages
    err_pwd_short: "Password must be at least 8 characters",
    err_pwd_match: "Passwords do not match",
    err_username_rule:
      "Username must be 3-20 characters and use only lowercase letters, numbers, and underscores",
    login_success: "Login successful.",
    signup_success: "Account created. You can sign in now.",
    signup_check_email: "Account created! Check your inbox and confirm your email to activate full access.",
    verify_email_banner: "Please confirm your email address to unlock all features. Check your inbox for the confirmation link.",
    verify_email_title: "Email Not Confirmed",
    resend_verification: "Resend confirmation",
    verification_sent: "Confirmation email sent! Check your inbox.",
    auth_error: "Auth Error: ",
    auth_error_generic: "Something went wrong. Please try again.",
    login_required: "Login required.",
    account_frozen_short: "Your account is frozen. Contact support.",
    logged_in_elsewhere: "Logged in from another location.",

    // Admin gate
    admin_console: "Admin Console",
    admin_access: "Admin Access",
    admin_denied: "Access Denied",
    admin_denied_sub: "This area is restricted.",
    admin_denied_body: "Your account does not have administrator privileges. If you believe this is a mistake, contact the site owner.",

    // Support
    support_telegram_title: "Contact us on Telegram",
    support_telegram_sub: "Fast replies via @BaBa_MeDia_0",
    support_ticket: "Support Ticket",
    subject: "Subject",
    write_issue: "Write your issue…",
    priority_low: "Low",
    priority_normal: "Normal",
    priority_high: "High",
    submit_ticket: "Submit Ticket",
    ticket_submitted: "Ticket submitted successfully.",

    // Profile dropdown
    change_photo: "Change Profile Photo",
    uploading: "Uploading…",
    photo_updated: "Photo updated!",
    upload_failed: "Upload failed: ",
    no_plan: "no plan",

    // Frozen screen
    frozen_title: "Account Temporarily Frozen",
    frozen_body:
      "Your account has been temporarily frozen by the administrator. You cannot access the platform right now.",
    frozen_body2: "Please contact support to reactivate your account.",
    contact_support: "Contact Support",
    frozen_footer: "Account frozen · Contact the administrator",

    // Security lock
    seclock_title: "Account Temporarily Locked",
    seclock_body:
      "This account was locked because a simultaneous login from another device was detected. Please contact support to reactivate it.",
    seclock_footer: "Security lock · Concurrent session detected",

    // Admin panel
    admin_title: "Admin Dashboard",
    admin_subtitle: "Manage users, subscriptions and support",
    admin_refresh: "Refresh",
    admin_loading: "Loading…",
    admin_total_users: "Total Users",
    admin_active_plans: "Active Plans",
    admin_tickets: "Tickets",
    admin_frozen: "Frozen",
    admin_tab_users: "Users",
    admin_tab_tickets: "Tickets",
    admin_tab_new_admin: "New Admin",
    admin_search_users: "🔍 Search by email or username…",
    admin_loading_users: "Loading users…",
    admin_no_users: "No users found",
    admin_badge_admin: "ADMIN",
    admin_badge_frozen: "FROZEN",
    admin_badge_seclock: "🔐 SECURITY LOCK",
    admin_badge_expired: "EXPIRED",
    admin_plan: "Plan",
    admin_expires: "Expires",
    admin_freeze: "🔒 Freeze",
    admin_unfreeze: "🔓 Unfreeze",
    admin_session: "🔄 Session",
    admin_unlock_account: "🔓 Unlock Account",
    admin_cancel_sub: "❌ Cancel Sub",
    admin_delete: "🗑 Delete",
    admin_extend: "Extend",
    admin_apply: "Apply",
    admin_days: "days",
    admin_create_admin_title: "Create New Admin Account",
    admin_initial_plan: "Initial Plan",
    admin_create_admin_btn: "✅ Create Admin",
    admin_creating: "Creating…",
    admin_no_tickets: "No tickets",
    admin_close: "Close",

    // Plan names
    plan_basic: "Basic",
    plan_pro: "Pro",
    plan_enterprise: "Enterprise",
    plan_none: "none",
  },

  ar: {
    dashboard: "لوحة احترافية",
    control: "وحدات التحكم",
    status: "حالة النظام",
    online: "النظام متصل",
    siteName: "فورتكس",
    siteTagline: "لوحة التحكم",
    login: "تسجيل دخول",
    signup: "إنشاء حساب",
    logout: "تسجيل خروج",
    admin: "لوحة الإدارة",
    support: "الدعم",
    close: "إغلاق",
    back: "رجوع",
    cancel: "إلغاء",
    save: "حفظ",
    loading: "جارٍ التحميل…",
    processing: "جارٍ المعالجة…",
    theme_light: "فاتح",
    theme_dark: "داكن",

    locked: "مقفل",
    hot: "مميز",
    card_hint: "تظهر الأداة لجميع المستخدمين، وتُفتح بعد التحقق من الاشتراك.",

    "card.bm_meta_tool": "أداة BM ميتا",
    "card.meta_ads_one_way": "ميتا ادز ون واي",
    "card.mini_meta_2": "ميني ميتا 2$",
    "card.cc_from_bm": "CC من البيزنس",
    "card.bm_creator": "CREATE BM & AD ACC & INFO",
    "card.vortex_meta_tools": "أدوات Vortex ميتا",
    "card.remove_payment":    "حذف وسيلة الدفع",
    "card.add_funds_meta":    "إضافة رصيد ميتاجراف",
    "card.add_primary_cc":    "تعيين CC أساسية",
    "card.switch_bm_old":     "تحويل BM للقديم",
    "card.cc_tools": "Vortex CC Tools",
    "card.funds": "إضافة رصيد",
    "card.ads": "إنشاء إعلانات",
    "card.cards": "إضافة بطاقات",
    "card.paypal": "إضافة باي بال",
    "card.gateway": "ربط بوابة باي بال",
    "card.iban": "إضافة آيبان",
    "card.methods": "الطرق",
    "card.debug": "بيانات التصحيح",
    "card.generator": "مولّد البطاقات",
    "card.checker": "فاحص البطاقات",
    "card.email": "فاحص البريد",
    "card.social": "فاحص بوابات السوشيال",
    "card.proxy": "أدوات البروكسي",
    "card.support": "مركز الدعم",

    auth_signin_title: "تسجيل الدخول",
    auth_signup_title: "إنشاء حساب",
    auth_signin_sub: "ادخل إلى مساحة عمل فورتكس الخاصة بك.",
    auth_signup_sub: "أنشئ حسابك باستخدام البريد الإلكتروني وكلمة المرور.",
    auth_secure_signin: "تسجيل دخول آمن",
    auth_create_account: "إنشاء حساب",
    username: "اسم المستخدم",
    email: "البريد الإلكتروني",
    password: "كلمة المرور",
    confirm_password: "تأكيد كلمة المرور",
    min8: "8 أحرف على الأقل",
    repeat_password: "أعد كتابة كلمة المرور",
    remember_me: "تذكرني",
    forgot_password: "نسيت كلمة المرور؟",
    no_account: "ليس لديك حساب؟",
    have_account: "لديك حساب بالفعل؟",
    create_account_link: "إنشاء حساب",
    signin_link: "تسجيل الدخول",
    username_placeholder: "vortex_user",
    email_placeholder: "you@example.com",

    forgot_title: "استعادة كلمة المرور",
    forgot_sub: "أدخل بريدك الإلكتروني لاستلام رابط إعادة التعيين.",
    send_reset: "إرسال رابط الاستعادة",
    sending: "جارٍ الإرسال…",
    reset_title: "إعادة تعيين كلمة المرور",
    reset_sub: "اختر كلمة مرور جديدة لحسابك.",
    new_password: "كلمة المرور الجديدة",
    confirm_new_password: "تأكيد كلمة المرور الجديدة",
    update_password: "تحديث كلمة المرور",
    updating: "جارٍ التحديث…",
    reset_link_sent: "إذا كان هذا البريد موجودًا، فقد تم إرسال رابط الاستعادة.",
    reset_email_fail: "تعذّر إرسال بريد الاستعادة.",
    password_updated: "تم تحديث كلمة المرور بنجاح.",
    reset_failed: "فشل في إعادة تعيين كلمة المرور.",

    err_pwd_short: "يجب أن تكون كلمة المرور 8 أحرف على الأقل",
    err_pwd_match: "كلمتا المرور غير متطابقتين",
    err_username_rule:
      "يجب أن يكون اسم المستخدم من 3 إلى 20 حرفًا ويحتوي فقط على أحرف صغيرة وأرقام وشرطة سفلية",
    login_success: "تم تسجيل الدخول بنجاح.",
    signup_success: "تم إنشاء الحساب. يمكنك تسجيل الدخول الآن.",
    signup_check_email: "تم إنشاء الحساب! افتح بريدك وأكّد إيميلك لتفعيل الحساب.",
    verify_email_banner: "يرجى تأكيد بريدك الإلكتروني لفتح جميع المميزات. تحقق من صندوق الوارد للرابط.",
    verify_email_title: "البريد غير مؤكد",
    resend_verification: "إعادة إرسال التأكيد",
    verification_sent: "تم إرسال بريد التأكيد! تحقق من صندوق الوارد.",
    auth_error: "خطأ في المصادقة: ",
    auth_error_generic: "حدث خطأ ما. برجاء المحاولة مرة أخرى.",
    login_required: "تسجيل الدخول مطلوب.",
    account_frozen_short: "حسابك مجمّد. تواصل مع الدعم.",
    logged_in_elsewhere: "تم تسجيل الدخول من مكان آخر.",

    admin_console: "وحدة الإدارة",
    admin_access: "صلاحية الإدارة",
    admin_denied: "الوصول مرفوض",
    admin_denied_sub: "هذه المنطقة محظورة.",
    admin_denied_body: "حسابك لا يملك صلاحيات الإدارة. إذا كنت تعتقد أن هذا خطأ، تواصل مع مالك الموقع.",

    support_telegram_title: "تواصل معنا على تيليجرام",
    support_telegram_sub: "ردود سريعة عبر @BaBa_MeDia_0",
    support_ticket: "تذكرة دعم",
    subject: "الموضوع",
    write_issue: "اكتب مشكلتك…",
    priority_low: "منخفضة",
    priority_normal: "عادية",
    priority_high: "عالية",
    submit_ticket: "إرسال التذكرة",
    ticket_submitted: "تم إرسال التذكرة بنجاح.",

    change_photo: "تغيير صورة الملف الشخصي",
    uploading: "جارٍ الرفع…",
    photo_updated: "تم تحديث الصورة!",
    upload_failed: "فشل الرفع: ",
    no_plan: "بدون اشتراك",

    frozen_title: "تم تجميد الحساب مؤقتًا",
    frozen_body:
      "تم تجميد حسابك مؤقتًا من قِبل الإدارة. لا يمكنك الوصول إلى المنصة في الوقت الحالي.",
    frozen_body2: "يرجى التواصل مع الدعم لإعادة تفعيل حسابك.",
    contact_support: "تواصل مع الدعم",
    frozen_footer: "الحساب مجمّد · تواصل مع الإدارة",

    seclock_title: "تم إيقاف الحساب مؤقتًا",
    seclock_body:
      "تم إيقاف هذا الحساب مؤقتًا بسبب اكتشاف تسجيل دخول متزامن من جهاز آخر. يرجى التواصل مع الدعم لإعادة التفعيل.",
    seclock_footer: "قفل أمني · تم اكتشاف جلسة متزامنة",

    // Admin panel
    admin_title: "لوحة الإدارة",
    admin_subtitle: "إدارة المستخدمين والاشتراكات والدعم",
    admin_refresh: "تحديث",
    admin_loading: "جارٍ التحميل…",
    admin_total_users: "إجمالي المستخدمين",
    admin_active_plans: "الاشتراكات النشطة",
    admin_tickets: "التذاكر",
    admin_frozen: "مجمّد",
    admin_tab_users: "المستخدمون",
    admin_tab_tickets: "التذاكر",
    admin_tab_new_admin: "مشرف جديد",
    admin_search_users: "🔍 ابحث بالبريد أو اسم المستخدم…",
    admin_loading_users: "جارٍ تحميل المستخدمين…",
    admin_no_users: "لا يوجد مستخدمون",
    admin_badge_admin: "مشرف",
    admin_badge_frozen: "مجمّد",
    admin_badge_seclock: "🔐 قفل أمني",
    admin_badge_expired: "منتهي",
    admin_plan: "الاشتراك",
    admin_expires: "ينتهي",
    admin_freeze: "🔒 تجميد",
    admin_unfreeze: "🔓 إلغاء التجميد",
    admin_session: "🔄 الجلسة",
    admin_unlock_account: "🔓 فتح الحساب",
    admin_cancel_sub: "❌ إلغاء الاشتراك",
    admin_delete: "🗑 حذف",
    admin_extend: "تمديد",
    admin_apply: "تطبيق",
    admin_days: "يوم",
    admin_create_admin_title: "إنشاء حساب مشرف جديد",
    admin_initial_plan: "الاشتراك الأولي",
    admin_create_admin_btn: "✅ إنشاء مشرف",
    admin_creating: "جارٍ الإنشاء…",
    admin_no_tickets: "لا توجد تذاكر",
    admin_close: "إغلاق",

    // Plan names
    plan_basic: "أساسي",
    plan_pro: "احترافي",
    plan_enterprise: "متقدم",
    plan_none: "بدون",
  },
};

const LangContext = createContext(null);

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    try {
      return localStorage.getItem("vortex_lang") || "en";
    } catch {
      return "en";
    }
  });

  const isArabic = lang === "ar";

  // Keep <html> dir/lang in sync so RTL applies globally (portals included).
  useEffect(() => {
    const el = document.documentElement;
    el.setAttribute("lang", lang);
    el.setAttribute("dir", isArabic ? "rtl" : "ltr");
    try {
      localStorage.setItem("vortex_lang", lang);
    } catch {
      /* ignore */
    }
  }, [lang, isArabic]);

  const setLang = useCallback((l) => setLangState(l), []);
  const toggleLang = useCallback(
    () => setLangState((p) => (p === "en" ? "ar" : "en")),
    []
  );

  const t = useCallback(
    (key) => {
      const table = dict[lang] || dict.en;
      return table[key] ?? dict.en[key] ?? key;
    },
    [lang]
  );

  return (
    <LangContext.Provider value={{ lang, setLang, toggleLang, isArabic, t }}>
      {children}
    </LangContext.Provider>
  );
}
LangProvider.propTypes = { children: PropTypes.node };

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) {
    // Fallback so components used outside provider still render in English.
    return {
      lang: "en",
      setLang: () => {},
      toggleLang: () => {},
      isArabic: false,
      t: (k) => dict.en[k] ?? k,
    };
  }
  return ctx;
}

export default dict;
