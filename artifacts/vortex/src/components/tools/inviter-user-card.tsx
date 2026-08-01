import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Copy, Check, RefreshCw, Mail, AlertCircle, Users } from 'lucide-react';
import axios from 'axios';

interface ExtractedSession {
  dtsg?: string;
  lsd?: string;
  accessToken?: string;
  userId?: string;
  bizId?: string;
  cookieHeader?: string;
  platform?: string;
}

interface InviterState {
  cookies: string;
  businessId: string;
  emailList: string;
  loading: boolean;
  results: Array<{
    email: string;
    status: 'pending' | 'success' | 'error';
    message?: string;
  }>;
  error: string | null;
  success: string | null;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button 
      variant="outline" 
      size="icon" 
      className="h-9 w-9 shrink-0 border-primary/30 rounded-lg" 
      onClick={handleCopy} 
      disabled={!text}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
    </Button>
  );
}

export function InviterUserCard() {
  const [state, setState] = useState<InviterState>({
    cookies: '',
    businessId: '',
    emailList: '',
    loading: false,
    results: [],
    error: null,
    success: null,
  });

  const [extractedSession, setExtractedSession] = useState<ExtractedSession | null>(null);

  // Unified extraction function (same as other tools)
  const extractSessionFromCookies = async (cookies: string, url?: string) => {
    try {
      const response = await axios.post('/api/extract/session', {
        cookies,
        url: url || 'https://business.facebook.com/',
      });

      if (response.data.ok) {
        return response.data;
      } else {
        throw new Error(response.data.error || 'خطأ في استخراج الجلسة');
      }
    } catch (error: any) {
      throw new Error(error.response?.data?.error || error.message || 'خطأ في الاتصال');
    }
  };

  const handleExtractSession = async () => {
    if (!state.cookies.trim()) {
      setState(prev => ({ ...prev, error: 'يرجى إدخال الكوكيز' }));
      return;
    }

    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const session = await extractSessionFromCookies(state.cookies);
      setExtractedSession(session);
      setState(prev => ({ 
        ...prev, 
        loading: false,
        success: 'تم استخراج الجلسة بنجاح',
        businessId: session.bizId || prev.businessId
      }));
    } catch (error: any) {
      setState(prev => ({ 
        ...prev, 
        loading: false,
        error: error.message || 'فشل استخراج الجلسة'
      }));
    }
  };

  const handleSendInvites = async () => {
    if (!state.cookies.trim()) {
      setState(prev => ({ ...prev, error: 'يرجى إدخال الكوكيز أولاً' }));
      return;
    }

    if (!state.businessId.trim()) {
      setState(prev => ({ ...prev, error: 'يرجى إدخال رقم Business ID' }));
      return;
    }

    if (!state.emailList.trim()) {
      setState(prev => ({ ...prev, error: 'يرجى إدخال قائمة البريد الإلكتروني' }));
      return;
    }

    const emails = state.emailList
      .split('\n')
      .map(e => e.trim())
      .filter(e => e && e.includes('@'));

    if (emails.length === 0) {
      setState(prev => ({ ...prev, error: 'لا توجد رسائل بريد إلكترونية صحيحة' }));
      return;
    }

    setState(prev => ({
      ...prev,
      loading: true,
      error: null,
      results: emails.map(email => ({ email, status: 'pending' as const }))
    }));

    try {
      // First extract session if not already done
      if (!extractedSession) {
        const session = await extractSessionFromCookies(state.cookies);
        setExtractedSession(session);
      }

      // Send invites to each email
      for (const email of emails) {
        try {
          const response = await axios.post('/api/meta/send-invite', {
            cookies: state.cookies,
            businessId: state.businessId,
            email: email
          });

          setState(prev => ({
            ...prev,
            results: prev.results.map(r =>
              r.email === email
                ? {
                    ...r,
                    status: response.data.success ? 'success' : 'error',
                    message: response.data.message || response.data.error || 'تم'
                  }
                : r
            )
          }));
        } catch (error: any) {
          setState(prev => ({
            ...prev,
            results: prev.results.map(r =>
              r.email === email
                ? {
                    ...r,
                    status: 'error' as const,
                    message: error.response?.data?.message || error.message || 'خطأ'
                  }
                : r
            )
          }));
        }
      }

      setState(prev => ({ ...prev, loading: false, success: 'انتهت عملية الإرسال' }));
    } catch (error: any) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: error.message || 'خطأ في إرسال الدعوات'
      }));
    }
  };

  const handleReset = () => {
    setState({
      cookies: '',
      businessId: '',
      emailList: '',
      loading: false,
      results: [],
      error: null,
      success: null,
    });
    setExtractedSession(null);
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          دعوة مستخدمين إلى Business Manager
        </CardTitle>
        <CardDescription>
          أرسل دعوات لمستخدمين للانضمام إلى حسابك في Meta Business Manager
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Cookies Input */}
        <div className="space-y-2">
          <Label htmlFor="cookies">ملف تعريفات الارتباط (Cookies)</Label>
          <div className="flex gap-2">
            <Textarea
              id="cookies"
              placeholder="الصق ملف تعريفات الارتباط من Facebook هنا..."
              value={state.cookies}
              onChange={(e) => setState(prev => ({ ...prev, cookies: e.target.value }))}
              className="flex-1 font-mono text-xs"
              rows={4}
            />
            <CopyButton text={state.cookies} />
          </div>
        </div>

        {/* Extract Session Button */}
        <Button
          onClick={handleExtractSession}
          disabled={!state.cookies.trim() || state.loading}
          className="w-full"
          variant="outline"
        >
          {state.loading ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin mr-2" />
              جاري الاستخراج...
            </>
          ) : (
            <>
              <Mail className="h-4 w-4 mr-2" />
              استخراج بيانات الجلسة
            </>
          )}
        </Button>

        {/* Extracted Session Info */}
        {extractedSession && (
          <Alert className="bg-green-50 border-green-200">
            <AlertTitle className="text-green-900">✓ تم استخراج البيانات بنجاح</AlertTitle>
            <AlertDescription className="text-green-800 space-y-1 text-sm">
              {extractedSession.userId && <div>معرف المستخدم: {extractedSession.userId}</div>}
              {extractedSession.bizId && <div>معرف الأعمال: {extractedSession.bizId}</div>}
              {extractedSession.platform && <div>المنصة: {extractedSession.platform}</div>}
            </AlertDescription>
          </Alert>
        )}

        {/* Business ID Input */}
        <div className="space-y-2">
          <Label htmlFor="businessId">رقم Business ID</Label>
          <Input
            id="businessId"
            placeholder="أدخل رقم Business Manager الخاص بك"
            value={state.businessId}
            onChange={(e) => setState(prev => ({ ...prev, businessId: e.target.value }))}
          />
          {extractedSession?.bizId && !state.businessId && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setState(prev => ({ ...prev, businessId: extractedSession.bizId || '' }))}
              className="text-xs"
            >
              استخدام المستخرج: {extractedSession.bizId}
            </Button>
          )}
        </div>

        {/* Email List Input */}
        <div className="space-y-2">
          <Label htmlFor="emails">قائمة البريد الإلكتروني (واحد لكل سطر)</Label>
          <Textarea
            id="emails"
            placeholder="user1@example.com&#10;user2@example.com&#10;user3@example.com"
            value={state.emailList}
            onChange={(e) => setState(prev => ({ ...prev, emailList: e.target.value }))}
            rows={6}
          />
          <p className="text-xs text-muted-foreground">
            عدد الرسائل: {state.emailList.split('\n').filter(e => e.trim() && e.includes('@')).length}
          </p>
        </div>

        {/* Alerts */}
        {state.error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>خطأ</AlertTitle>
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}

        {state.success && (
          <Alert className="bg-green-50 border-green-200">
            <AlertTitle className="text-green-900">نجاح</AlertTitle>
            <AlertDescription className="text-green-800">{state.success}</AlertDescription>
          </Alert>
        )}

        {/* Results */}
        {state.results.length > 0 && (
          <div className="space-y-2">
            <Label>نتائج الإرسال</Label>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {state.results.map((result, idx) => (
                <div
                  key={idx}
                  className={`p-2 rounded text-sm flex justify-between items-center ${
                    result.status === 'success'
                      ? 'bg-green-50 text-green-900'
                      : result.status === 'error'
                        ? 'bg-red-50 text-red-900'
                        : 'bg-blue-50 text-blue-900'
                  }`}
                >
                  <span>{result.email}</span>
                  <span className="text-xs">
                    {result.status === 'pending' ? '⏳' : result.status === 'success' ? '✓' : '✗'}
                    {result.message && ` ${result.message}`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button
            onClick={handleSendInvites}
            disabled={!state.cookies.trim() || !state.businessId.trim() || !state.emailList.trim() || state.loading}
            className="flex-1"
          >
            {state.loading ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                جاري الإرسال...
              </>
            ) : (
              <>
                <Mail className="h-4 w-4 mr-2" />
                إرسال الدعوات
              </>
            )}
          </Button>
          <Button
            onClick={handleReset}
            variant="outline"
            disabled={state.loading}
          >
            إعادة تعيين
          </Button>
        </div>

        {/* Info Box */}
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>نصيحة</AlertTitle>
          <AlertDescription className="text-xs space-y-1">
            <p>• يتم استخراج معرف المستخدم ومعرف الأعمال تلقائياً من الكوكيز</p>
            <p>• تأكد من أن حسابك له صلاحيات إدارية في Business Manager</p>
            <p>• سيتم إرسال دعوات منفصلة لكل عنوان بريد إلكتروني</p>
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
