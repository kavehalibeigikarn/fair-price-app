# قیمت منصفانه (اپ اندروید)

اپ Capacitor که لینک آگهی دیوار را می‌گیرد (اشتراک‌گذاری از اپ دیوار یا چسباندن لینک) و گزارش قیمت/اجاره منصفانه با گیج نشان می‌دهد.
منطق محاسبه همان افزونه مرورگر است (`www/core.js`).

## ساخت APK
با هر push، GitHub Actions فایل `app-debug.apk` را می‌سازد (تب Actions → آخرین اجرا → Artifacts).

## ساختار
- `www/` صفحه اپ، داده‌ها و منطق
- `android-patch/` کلاس MainActivity (دریافت لینک اشتراکی) و اسکریپت افزودن intent-filterها
- `capacitor.config.json` — CapacitorHttp فعال است تا درخواست به api.divar.ir بدون محدودیت CORS انجام شود
