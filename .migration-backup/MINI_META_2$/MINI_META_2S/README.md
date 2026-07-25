# MINI META 2$

أداة إدارة إعلانات فيسبوك عبر الكوكيز والـ Internal API

## المتطلبات
- Python 3.12
- متغيرات البيئة في `.env` (انسخ `.env.example`)

## تشغيل محلي
```bash
pip install -r requirements.txt
python -m playwright install chromium
python app.py
```
الأداة تشتغل على: http://localhost:5000

## المميزات
- تحقق واستخراج Token من الكوكيز
- ربط بطاقات الدفع (تلقائي / يدوي)
- إنشاء إعلانات مجدولة +30 دقيقة تلقائياً
- جلب منشورات الصفحة عبر Internal GraphQL API
- لوحة إدارة المشتركين على `/admin`
