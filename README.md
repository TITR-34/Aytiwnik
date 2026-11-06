# Hazırlıq — qrup imtahan hazırlıq platforması

Qrup üzvləri imtahan yaradır (fayl yükləyib AI ilə suallara çevirir, sonra düzəldir), qrupla paylaşır, hamı təsadüfi qarışdırılmış suallarla məşq edir. **AI yalnız yazılı cavabların yoxlanmasında** (və fayldan sual çıxarmada) istifadə olunur. Test sualları AI-sız, serverdə yoxlanılır (hər sual 1 bal).

## Əsas xüsusiyyətlər
- Qrup yaratmaq / kodla qoşulmaq. İstənilən üzv imtahan yarada bilər, qrupda hamı görür.
- PDF / DOCX / TXT yüklə → AI sualları çıxarır → yoxla və düzəlt. Düzgün cavab faylda yoxdursa AI təxmin etmir, sən seçirsən.
- İmtahan vaxtı (yaradan təyin edir, başlayan dəyişə bilər), sual aralığı, sual sayı, qarışdırma.
- Yazılı sual üçün bal yaradan tərəfindən təyin olunur; AI məhz bu maksimum bal üzərindən qiymət verir (nümunə cavab + meyar əsasında).
- Yazılı cavab mətn və ya əl yazısı şəkli (private Storage).
- Limit: hər istifadəçi hər imtahan üçün **5** AI yoxlama (`AI_GRADING_LIMIT_PER_EXAM`). Bir cəhd = bütün yazılı suallar üçün 1 AI sorğusu.
- Nəticə: düzgün/səhv/boş, izahlar, AI rəyi və meyarlar. "Səhvlərlə" və "işarələnmişlərlə" təkrar cəhd.
- Analitika: orta/ən yüksək nəticə, son cəhdlər, zəif mövzular.

## Təhlükəsizlik modeli
- Brauzer yalnız Supabase **Auth** ilə danışır (anon key). Bütün data API-dan keçir.
- API hər sorğuda JWT-ni yoxlayır, qrup üzvlüyünü server tərəfdə təsdiqləyir.
- Cədvəllərdə RLS **açıqdır, policy yoxdur** və `anon/authenticated` rollarının icazəsi alınıb → brauzer cavab açarlarına birbaşa çata bilməz.
- Cavab açarları cəhd bitməmiş heç vaxt göndərilmir. Xal serverdə hesablanır, vaxt serverdə yoxlanılır (60 san güzəşt).
- Service-role və Gemini açarları yalnız backend-də.

## Lokal işə salma
```bash
npm install
cp .env.example .env        # sonra dəyərləri doldur
npm run dev:api             # http://localhost:8080
npm run dev:web             # http://localhost:5173
npm test                    # util testləri (shuffle, bal, kod)
```
Supabase: SQL Editor-da `supabase/migrations/001_init.sql` faylını bir dəfə işlət. Auth → URL Configuration bölməsində Site URL və Redirect URL-lərə frontend ünvanını əlavə et (lokal: `http://localhost:5173`, prod: Render ünvanı).

## Render deploy
1. Repo-nu GitHub-a push et.
2. Render → New → Blueprint → repo seç (`render.yaml` iki servis yaradır).
3. Backend (`study-api`) env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `CORS_ORIGINS=<frontend URL>`.
4. Frontend (`study-web`) env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL=<backend URL>`.
5. Frontend URL-ni Supabase Auth redirect siyahısına əlavə et.
6. Pulsuz Render planında backend yuxusuya gedir; ilk sorğu 30-60 san çəkə bilər.

## Məlum məhdudiyyətlər / sonrakı addımlar
- Çox böyük PDF-lərdə (yüzlərlə sual) AI cavabı kəsilə bilər — faylı hissələrə bölüb yükləyin.
- AI balının admin tərəfindən əl ilə düzəldilməsi (override) hələ yoxdur; `ai_result` JSON-da orijinal AI qiyməti saxlanılır.
- Google OAuth, XDİAK məktub şablonu, qrup analitikası ayrıca mərhələdir.
