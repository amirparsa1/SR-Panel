export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        
        if (request.method === "GET" && url.pathname === "/") {
            return new Response(getHtmlContent(), {
                headers: { "Content-Type": "text/html;charset=UTF-8" },
            });
        }

        // ===== DEPLOY =====
        if (request.method === "POST" && url.pathname === "/api/deploy") {
            try {
                const { token } = await request.json();
                if (!token) throw new Error("توکن نمی‌تواند خالی باشد.");

                const headers = {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                };

                // دریافت Account ID
                const accRes = await fetch("https://api.cloudflare.com/client/v4/accounts", { headers });
                const accData = await accRes.json();
                if (!accData.success || accData.result.length === 0) {
                    throw new Error("فقط با دکمه نارنجی «دریافت توکن» توکن بسازید.");
                }
                const accountId = accData.result[0].id;

                // ایجاد Subdomain
                let devSub = null;
                const subRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/subdomain`, { headers });
                const subData = await subRes.json();
                if (subData.success && subData.result?.subdomain) {
                    devSub = subData.result.subdomain;
                } else {
                    const newSub = `sr-${Math.random().toString(36).substring(2, 8)}`;
                    const createSub = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/subdomain`, {
                        method: "PUT",
                        headers,
                        body: JSON.stringify({ subdomain: newSub }),
                    });
                    const createSubData = await createSub.json();
                    if (!createSubData.success) {
                        throw new Error(`CF_TOS_ERROR|${createSubData.errors?.[0]?.message || "نامشخص"}`);
                    }
                    devSub = newSub;
                }

                // ایجاد دیتابیس D1
                const uniqueSuffix = Math.random().toString(36).substring(2, 8);
                const workerName = `sr-panel-${uniqueSuffix}`;
                const dbName = `sr-db-${uniqueSuffix}`;

                const dbRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify({ name: dbName }),
                });
                const dbData = await dbRes.json();
                if (!dbData.success) {
                    throw new Error(`CF_DB_ERROR|${dbData.errors?.[0]?.message || "نامشخص"}`);
                }
                const dbUuid = dbData.result.uuid;

                await new Promise(resolve => setTimeout(resolve, 1000));

                // دریافت سورس از گیت‌هاب (مخزن جدید SR)
                const githubRes = await fetch("https://raw.githubusercontent.com/IR-NETLIFY/sr-panel/refs/heads/main/sr-panel.js?t=" + Date.now());
                if (!githubRes.ok) throw new Error("خطا در دریافت سورس از گیت‌هاب.");
                const srCode = await githubRes.text();

                // متادیتا
                const metadata = {
                    main_module: "sr-panel.js",
                    compatibility_date: "2024-02-08",
                    bindings: [
                        { type: "d1", name: "DB", id: dbUuid },
                        { type: "secret_text", name: "CF_API_TOKEN", text: token },
                        { type: "secret_text", name: "CF_ACCOUNT_ID", text: accountId },
                    ],
                };

                const formData = new FormData();
                formData.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
                formData.append("sr-panel.js", new Blob([srCode], { type: "application/javascript+module" }), "sr-panel.js");

                // دیپلوی ورکر
                const deployRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${workerName}`, {
                    method: "PUT",
                    headers: { Authorization: `Bearer ${token}` },
                    body: formData,
                });
                const deployData = await deployRes.json();
                if (!deployData.success) {
                    throw new Error(`CF_DEPLOY_ERROR|${deployData.errors?.[0]?.message || "نامشخص"}`);
                }

                // فعال‌سازی Subdomain
                const routeRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${workerName}/subdomain`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify({ enabled: true }),
                });
                if (!routeRes.ok) throw new Error("خطا در فعال‌سازی لینک نهایی.");

                const finalUrl = `https://${workerName}.${devSub}.workers.dev/panel`;

                return new Response(JSON.stringify({ success: true, url: finalUrl }), {
                    headers: { "Content-Type": "application/json" },
                });

            } catch (error) {
                return new Response(JSON.stringify({ success: false, error: error.message }), {
                    status: 400,
                    headers: { "Content-Type": "application/json" },
                });
            }
        }

        // ===== LIST PANELS =====
        if (request.method === "POST" && url.pathname === "/api/list-panels") {
            // ... (همون منطق با تغییر اسم به sr-panel)
        }

        // ===== GET PANEL VERSION =====
        if (request.method === "POST" && url.pathname === "/api/get-panel-version") {
            // ... 
        }

        // ===== DO UPDATE =====
        if (request.method === "POST" && url.pathname === "/api/do-update") {
            // ...
        }

        // ===== RESET PASSWORD =====
        if (request.method === "POST" && url.pathname === "/api/reset-password") {
            // ...
        }

        // ===== DELETE PANEL =====
        if (request.method === "POST" && url.pathname === "/api/delete-panel") {
            // ...
        }

        return new Response("Not Found", { status: 404 });
    },
};

// ============================================================
// HTML صفحه دیپلوی (با سبک پاسارگاردی)
// ============================================================
function getHtmlContent() {
    return `
<!DOCTYPE html>
<html lang="fa" dir="rtl" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SR Panel Deployer</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css" rel="stylesheet" type="text/css" />
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&display=swap');
        body { font-family: 'Vazirmatn', 'Playfair Display', sans-serif; }
        .persian-gold { color: #C9A84C; }
        .gold-border { border-color: #C9A84C40; }
        .gold-input { background: #1a140e; border: 1px solid #C9A84C40; color: #e8d5a3; }
        .gold-input:focus { border-color: #C9A84C; box-shadow: 0 0 20px rgba(201,168,76,0.15); }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #1a140e; }
        ::-webkit-scrollbar-thumb { background: #C9A84C60; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #C9A84C; }
        * { scrollbar-width: thin; scrollbar-color: #C9A84C60 #1a140e; }
    </style>
    <script>
        tailwind.config = {
            darkMode: 'class',
            theme: {
                extend: {
                    fontFamily: { sans: ['Vazirmatn', 'sans-serif'] },
                    colors: { 
                        amoled: { bg: '#000000', card: '#0a0806', input: '#1a140e', border: '#2a2015' },
                        gold: { 500: '#C9A84C', 600: '#B8962D', 700: '#A6841E' }
                    }
                }
            }
        }
    </script>
</head>
<body class="bg-[#0a0806] text-[#e8d5a3] min-h-screen flex flex-col items-center justify-center p-4">
    <div id="mainCard" class="w-full max-w-md bg-[#14100b] border-2 border-gold-500/50 rounded-3xl shadow-[0_0_60px_rgba(201,168,76,0.15)] p-8 relative overflow-hidden z-10">
        <!-- Background Glow -->
        <div class="absolute -left-12 -top-12 w-40 h-40 bg-gold-500/5 rounded-full blur-3xl pointer-events-none"></div>
        <div class="absolute -right-12 -bottom-12 w-40 h-40 bg-gold-500/5 rounded-full blur-3xl pointer-events-none"></div>
        
        <div class="text-center mb-6 relative z-10">
            <div class="inline-flex items-center justify-center p-3 bg-gold-500/10 border border-gold-500/30 rounded-2xl mb-4 shadow-[0_0_30px_rgba(201,168,76,0.1)]">
                <svg class="w-8 h-8 text-gold-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
                </svg>
            </div>
            <h2 class="text-2xl font-black text-gold-500">🏛️ SR Panel Deployer</h2>
            <p class="text-sm font-medium text-[#b8a07c]">نصب خودکار پنل SR روی کلودفلر</p>
            <p class="text-sm font-medium text-gold-500/70 mt-1">🔥 روزانه 10 الی 100 گیگ کانفیگ رایگان 🔥</p>
        </div>

        <div class="space-y-5 relative z-10">
            <!-- دکمه دریافت توکن -->
            <a href="https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=%5B%7B%22key%22%3A%22workers_scripts%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22workers_kv_storage%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22d1%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22account_settings%22%2C%22type%22%3A%22read%22%7D%2C%7B%22key%22%3A%22workers_subdomain%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22account_analytics%22%2C%22type%22%3A%22read%22%7D%5D&accountId=*&zoneId=all&name=SR-Deployer-Token" target="_blank" class="flex items-center justify-center w-full py-3.5 border border-orange-700 text-orange-500 bg-orange-900/20 hover:bg-orange-900/40 font-bold rounded-xl text-sm transition duration-300 shadow-sm">
                دریافت توکن کلودفلر
            </a>

            <div class="mt-2 text-center mb-4">
                <p class="text-[11px] text-[#6a5f4a] font-medium">
                    در کلودفلر لاگین کنید و روی 
                    <span class="font-bold text-orange-500">دریافت توکن</span> 
                    کلیک کنید. سپس در انتهای صفحه روی 
                    <span class="font-bold text-blue-500">Continue to summary</span> 
                    کلیک کرده و توکن را کپی کنید.
                </p>
            </div>

            <!-- ورودی توکن -->
            <div class="relative">
                <input type="password" id="apiToken" placeholder="توکن خود را وارد کنید" autocomplete="off" spellcheck="false" class="w-full pl-12 pr-4 py-3.5 gold-input rounded-xl focus:outline-none focus:ring-2 focus:ring-gold-500/50 text-sm font-mono text-right transition" dir="auto">
                <button type="button" onclick="toggleToken()" class="absolute inset-y-0 left-0 flex items-center pl-4 text-[#6a5f4a] hover:text-gold-500 transition">
                    <svg id="eyeIcon" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                </button>
            </div>

            <!-- دکمه ساخت پنل -->
            <button id="deployBtn" onclick="startDeploy()" class="w-full py-3.5 bg-gold-500 hover:bg-gold-600 text-[#0a0806] font-black rounded-xl text-lg transition duration-300 shadow-[0_0_30px_rgba(201,168,76,0.2)] hover:shadow-[0_0_50px_rgba(201,168,76,0.3)]">
                ساخت پنل
            </button>

            <!-- دکمه مدیریت پنل‌ها -->
            <button type="button" id="openUpdateModalBtn" onclick="toggleUpdateModal(true)" class="w-full py-3.5 border border-gold-500/50 text-gold-500 bg-gold-500/10 hover:bg-gold-500/20 font-black rounded-xl text-lg transition duration-300 shadow-sm mt-3">
                مدیریت و آپدیت پنل‌ها
            </button>

            <!-- استاتوس -->
            <div id="status-container" class="hidden mt-4 bg-[#1a140e] rounded-xl p-4 border border-gold-500/20">
                <div class="flex justify-between items-center mb-2.5">
                    <span id="status-text" class="text-xs font-bold text-[#b8a07c]">شروع فرآیند...</span>
                    <span id="status-pct" class="text-xs font-black text-gold-500">۰٪</span>
                </div>
                <div class="w-full bg-[#0a0806] rounded-full h-1.5 overflow-hidden">
                    <div id="progressBar" class="bg-gold-500 h-1.5 rounded-full transition-all duration-300" style="width: 0%"></div>
                </div>
            </div>

            <!-- باکس خطا -->
            <div id="error-box" class="hidden mt-4 p-4 bg-red-900/20 border border-red-800/50 rounded-xl text-sm text-red-400 text-center font-medium"></div>
        </div>
    </div>

    <!-- لینک‌های پایین -->
    <div class="flex flex-col gap-4 mt-6 z-10">
        <div class="flex items-center gap-4 justify-center">
            <a href="https://github.com/IR-NETLIFY/sr-panel" target="_blank" class="flex items-center gap-2 px-4 py-2 border border-gold-500/30 text-[#b8a07c] bg-[#14100b] hover:border-gold-500 hover:text-gold-500 rounded-full shadow-sm hover:shadow-md transition text-sm font-bold group">
                <svg class="w-5 h-5 group-hover:scale-110 transition" viewBox="0 0 24 24" fill="currentColor">
                    <path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0012 2z"/>
                </svg>
                گیت‌هاب
            </a>
            <a href="https://t.me/SR_PANEL_BOT" target="_blank" class="flex items-center gap-2 px-4 py-2 border border-sky-700 text-sky-500 bg-sky-900/20 hover:bg-sky-900/40 rounded-full shadow-sm hover:shadow-md transition text-sm font-bold group">
                <svg class="w-5 h-5 group-hover:scale-110 transition" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.94-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.37.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .24z"/>
                </svg>
                SR_PANEL_BOT@
            </a>
        </div>
        <div class="flex items-center gap-4 justify-center">
            <a href="https://sr-panel.ir-netlify.workers.dev/" target="_blank" class="flex items-center gap-2 px-4 py-2 border border-amber-700 text-amber-500 bg-amber-900/20 hover:bg-amber-900/40 rounded-full shadow-sm hover:shadow-md transition text-sm font-bold group">
                <svg class="w-5 h-5 group-hover:scale-110 transition" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                </svg>
                ساخت رایگان پنل
            </a>
            <a href="https://donatonion.ir-netlify.workers.dev" target="_blank" class="flex items-center gap-2 px-4 py-2 border border-red-700 text-red-500 bg-red-900/20 hover:bg-red-900/40 rounded-full shadow-sm hover:shadow-md transition text-sm font-bold group">
                <svg class="w-5 h-5 group-hover:scale-110 transition" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3 9.24 3 10.91 3.81 12 5.08 13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                </svg>
                دونیت
            </a>
        </div>
    </div>

    <!-- ===== مودال‌ها ===== -->
    <div id="update-modal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm opacity-0 pointer-events-none transition-opacity duration-200 ease-out">
        <div id="update-modal-card" class="w-full max-w-md bg-[#14100b] border-2 border-gold-500/50 rounded-3xl shadow-[0_0_60px_rgba(201,168,76,0.15)] p-5 transform transition-all scale-95 opacity-0 duration-200 flex flex-col max-h-[95vh]">
            <div class="flex justify-between items-center mb-6 shrink-0">
                <h3 class="text-xl font-bold text-gold-500">مدیریت و آپدیت پنل‌ها</h3>
                <button onclick="toggleUpdateModal(false)" class="p-1.5 rounded-lg bg-red-900/20 border border-red-800/50 text-red-400 hover:bg-red-900/40 transition">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
            </div>
            <div class="space-y-4 shrink-0">
                <a href="https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=%5B%7B%22key%22%3A%22workers_scripts%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22workers_kv_storage%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22d1%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22account_settings%22%2C%22type%22%3A%22read%22%7D%2C%7B%22key%22%3A%22workers_subdomain%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22account_analytics%22%2C%22type%22%3A%22read%22%7D%5D&accountId=*&zoneId=all&name=SR-Deployer-Token" target="_blank" class="flex items-center justify-center w-full py-2.5 border border-orange-700 text-orange-500 bg-orange-900/20 hover:bg-orange-900/40 font-bold rounded-xl text-sm transition duration-300 shadow-sm">
                    دریافت توکن کلودفلر
                </a>
                <div class="mt-2 text-center mb-4">
                    <p class="text-[11px] text-[#6a5f4a] font-medium">
                        در کلودفلر لاگین کنید و روی 
                        <span class="font-bold text-orange-500">دریافت توکن</span> 
                        کلیک کنید.
                    </p>
                </div>
                <input type="password" id="updateApiToken" placeholder="توکن خود را وارد کنید" class="w-full px-4 py-3 gold-input rounded-xl focus:outline-none focus:ring-2 focus:ring-gold-500/50 text-sm font-mono text-right transition" dir="auto">
                <button id="checkPanelsBtn" onclick="checkExistingPanels()" class="w-full py-3 border border-gold-500/50 text-gold-500 bg-gold-500/10 hover:bg-gold-500/20 font-bold rounded-xl text-md transition duration-300 shadow-sm">
                    بررسی پنل‌های موجود
                </button>
            </div>
            <div id="panels-list-container" class="mt-6 hidden overflow-y-auto space-y-3 pr-1 pb-2"></div>
            <div id="update-status" class="hidden mt-4 text-center text-sm font-bold shrink-0 p-3 rounded-xl"></div>
        </div>
    </div>

    <div id="toast-container" class="fixed top-5 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 pointer-events-none"></div>
    <div id="custom-confirm-modal" class="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm opacity-0 pointer-events-none transition-all duration-300 ease-out">
        <div id="custom-confirm-card" class="w-full max-w-sm bg-[#14100b] border-2 border-gold-500/50 rounded-3xl shadow-[0_0_60px_rgba(201,168,76,0.15)] overflow-hidden p-6 text-center transform transition-all scale-95 duration-300">
            <h3 class="font-black text-xl text-gold-500 mb-3">تایید عملیات</h3>
            <p id="custom-confirm-message" class="text-sm text-[#b8a07c] mb-6 leading-relaxed font-medium"></p>
            <div class="flex gap-3">
                <button id="custom-confirm-cancel" class="flex-1 py-3 bg-red-900/20 border border-red-800/50 text-red-400 hover:bg-red-900/40 font-bold rounded-xl text-sm transition">لغو</button>
                <button id="custom-confirm-ok" class="flex-1 py-3 bg-gold-500 hover:bg-gold-600 text-[#0a0806] font-bold rounded-xl text-sm transition shadow-[0_0_20px_rgba(201,168,76,0.2)]">تایید</button>
            </div>
        </div>
    </div>

    <script>
        // ===== توابع =====
        function showToast(message, type = 'success') {
            const container = document.getElementById('toast-container');
            const toast = document.createElement('div');
            const colors = type === 'error' 
                ? 'bg-red-900/40 border-red-800 text-red-400' 
                : 'bg-gold-500/20 border-gold-500/40 text-gold-500';
            toast.className = 'px-4 py-3 border rounded-xl shadow-lg font-bold text-sm transform transition-all duration-300 -translate-y-full opacity-0 ' + colors;
            toast.innerText = message;
            container.appendChild(toast);
            requestAnimationFrame(() => {
                toast.classList.remove('-translate-y-full', 'opacity-0');
            });
            setTimeout(() => {
                toast.classList.add('-translate-y-full', 'opacity-0');
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        }

        function customConfirm(message) {
            return new Promise((resolve) => {
                const modal = document.getElementById('custom-confirm-modal');
                const card = document.getElementById('custom-confirm-card');
                const msgEl = document.getElementById('custom-confirm-message');
                const btnOk = document.getElementById('custom-confirm-ok');
                const btnCancel = document.getElementById('custom-confirm-cancel');

                msgEl.innerText = message;
                modal.classList.remove('opacity-0', 'pointer-events-none');
                modal.classList.add('opacity-100', 'pointer-events-auto');
                card.classList.remove('scale-95');
                card.classList.add('scale-100');

                const cleanup = () => {
                    modal.classList.remove('opacity-100', 'pointer-events-auto');
                    modal.classList.add('opacity-0', 'pointer-events-none');
                    card.classList.remove('scale-100');
                    card.classList.add('scale-95');
                    btnOk.removeEventListener('click', onOk);
                    btnCancel.removeEventListener('click', onCancel);
                };

                const onOk = () => { cleanup(); resolve(true); };
                const onCancel = () => { cleanup(); resolve(false); };

                btnOk.addEventListener('click', onOk);
                btnCancel.addEventListener('click', onCancel);
            });
        }

        window.alert = function(message) {
            const msgStr = message ? message.toString() : '';
            if (msgStr.includes('خطا') || msgStr.includes('⚠️') || msgStr.includes('❌')) {
                showToast(msgStr, 'error');
            } else {
                showToast(msgStr, 'success');
            }
        };

        function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

        function toggleToken() {
            const tokenInput = document.getElementById('apiToken');
            const eyeIcon = document.getElementById('eyeIcon');
            if (tokenInput.type === 'password') {
                tokenInput.type = 'text';
                eyeIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>';
            } else {
                tokenInput.type = 'password';
                eyeIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>';
            }
        }

        function toggleUpdateModal(show) {
            const modal = document.getElementById('update-modal');
            const card = document.getElementById('update-modal-card');
            if (show) {
                modal.classList.remove('opacity-0', 'pointer-events-none');
                modal.classList.add('opacity-100', 'pointer-events-auto');
                card.classList.remove('opacity-0', 'scale-95');
                card.classList.add('opacity-100', 'scale-100');
            } else {
                modal.classList.remove('opacity-100', 'pointer-events-auto');
                modal.classList.add('opacity-0', 'pointer-events-none');
                card.classList.remove('opacity-100', 'scale-100');
                card.classList.add('opacity-0', 'scale-95');
            }
        }

        // ===== DEPLOY =====
        async function startDeploy() {
            const token = document.getElementById('apiToken').value.trim();
            const btn = document.getElementById('deployBtn');
            const statusContainer = document.getElementById('status-container');
            const statusText = document.getElementById('status-text');
            const statusPct = document.getElementById('status-pct');
            const progressBar = document.getElementById('progressBar');
            const errorBox = document.getElementById('error-box');

            const oldText = document.getElementById('successTxt');
            if (oldText) oldText.remove();
            const oldSuccessLink = document.getElementById('successBtn');
            if (oldSuccessLink) oldSuccessLink.remove();

            if (!token) {
                errorBox.classList.remove('hidden');
                errorBox.innerText = 'لطفاً ابتدا توکن را وارد کنید.';
                return;
            }

            errorBox.classList.add('hidden');
            btn.disabled = true;
            document.getElementById('apiToken').disabled = true;
            btn.innerText = 'در حال پردازش...';

            statusContainer.classList.remove('hidden');
            statusText.innerText = 'در حال بررسی توکن...';
            statusPct.innerText = '۱۵٪';
            progressBar.style.width = '15%';
            await sleep(500);

            statusText.innerText = 'در حال ارتباط با کلودفلر...';
            statusPct.innerText = '۳۰٪';
            progressBar.style.width = '30%';
            await sleep(500);

            statusText.innerText = 'در حال ایجاد دیتابیس D1...';
            statusPct.innerText = '۵۰٪';
            progressBar.style.width = '50%';

            try {
                const response = await fetch('/api/deploy', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token })
                });

                statusText.innerText = 'در حال دریافت پنل SR...';
                statusPct.innerText = '۷۵٪';
                progressBar.style.width = '75%';
                await sleep(600);

                statusText.innerText = 'در حال فعال‌سازی لینک...';
                statusPct.innerText = '۹۰٪';
                progressBar.style.width = '90%';
                await sleep(500);

                const result = await response.json();

                if (result.success) {
                    progressBar.style.width = '100%';
                    statusPct.innerText = '۱۰۰٪';
                    statusText.innerText = 'تکمیل شد!';
                    await sleep(400);
                    statusContainer.classList.add('hidden');

                    const successText = document.createElement('div');
                    successText.id = 'successTxt';
                    successText.className = 'text-center mt-6 font-bold text-sm text-gold-500 mb-3';
                    successText.innerText = '✅ پنل ساخته شد لطفا 5 دقیقه صبر کنید و سپس وارد شوید';
                    document.getElementById('mainCard').appendChild(successText);

                    const linkBox = document.createElement('div');
                    linkBox.className = 'flex flex-col items-center justify-center p-3 bg-gold-500/10 border border-gold-500/50 rounded-xl mb-3';
                    const linkDisplay = document.createElement('span');
                    linkDisplay.className = 'text-sm font-mono text-gold-500 mb-2 text-center break-all';
                    linkDisplay.innerText = result.url;
                    linkDisplay.dir = 'ltr';

                    const copyBtn = document.createElement('button');
                    copyBtn.className = 'px-6 py-1.5 bg-gold-500 hover:bg-gold-600 text-[#0a0806] font-bold rounded-lg text-sm transition duration-300 shadow-[0_0_20px_rgba(201,168,76,0.2)]';
                    copyBtn.innerText = 'کپی لینک پنل';
                    copyBtn.onclick = () => {
                        navigator.clipboard.writeText(result.url);
                        copyBtn.innerText = 'کپی شد!';
                        copyBtn.style.opacity = '0.7';
                        setTimeout(() => {
                            copyBtn.innerText = 'کپی لینک پنل';
                            copyBtn.style.opacity = '1';
                        }, 2000);
                    };

                    linkBox.appendChild(linkDisplay);
                    linkBox.appendChild(copyBtn);
                    document.getElementById('mainCard').appendChild(linkBox);

                    const successLink = document.createElement('a');
                    successLink.href = result.url;
                    successLink.target = '_blank';
                    successLink.className = 'block w-full py-3.5 bg-gold-500 hover:bg-gold-600 text-[#0a0806] text-center font-bold rounded-xl transition duration-300 shadow-[0_0_30px_rgba(201,168,76,0.2)]';
                    successLink.id = 'successBtn';
                    successLink.innerText = 'ورود به پنل';
                    document.getElementById('mainCard').appendChild(successLink);

                } else {
                    throw new Error(result.error);
                }

            } catch (e) {
                statusContainer.classList.add('hidden');
                errorBox.classList.remove('hidden');
                btn.disabled = false;
                document.getElementById('apiToken').disabled = false;
                btn.innerText = 'ساخت پنل';

                const errorMsg = e.message;
                const rawError = errorMsg.includes('|') ? errorMsg.split('|')[1] : errorMsg;

                if (errorMsg.includes("databases per account") || errorMsg.includes("limit reached")) {
                    errorBox.innerHTML = '<div class="mb-2 font-bold">شما به سقف مجاز ساخت دیتابیس D1 رسیده‌اید.</div>' +
                        '<div class="text-[11px] opacity-70 mb-3" dir="ltr">' + rawError + '</div>' +
                        '<a href="https://dash.cloudflare.com/?to=/:account/workers/d1" target="_blank" class="inline-block bg-gold-500 text-[#0a0806] px-4 py-2 rounded-lg font-bold text-xs">مدیریت دیتابیس‌ها</a>';
                } else if (errorMsg.includes("script limit") || errorMsg.includes("scripts per account")) {
                    errorBox.innerHTML = '<div class="mb-2 font-bold">شما به سقف مجاز ساخت ورکر رسیده‌اید.</div>' +
                        '<div class="text-[11px] opacity-70 mb-3" dir="ltr">' + rawError + '</div>' +
                        '<a href="https://dash.cloudflare.com/?to=/:account/workers/services" target="_blank" class="inline-block bg-gold-500 text-[#0a0806] px-4 py-2 rounded-lg font-bold text-xs">مدیریت ورکرها</a>';
                } else if (errorMsg.includes("اکانتی یافت نشد") || errorMsg.includes("Authentication") || errorMsg.includes("Invalid")) {
                    errorBox.innerHTML = '<div class="mb-2 font-bold">توکن دسترسی ندارد لطفا فقط با دکمه نارنجی «دریافت توکن» کار کنید.</div>' +
                        '<div class="text-[11px] opacity-70 mb-3" dir="ltr">' + rawError + '</div>' +
                        '<a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" class="inline-block bg-gold-500 text-[#0a0806] px-4 py-2 rounded-lg font-bold text-xs">مدیریت توکن‌ها</a>';
                } else {
                    errorBox.innerText = errorMsg;
                }
            }
        }

        // ===== MANAGEMENT FUNCTIONS =====
        async function checkExistingPanels() {
            const token = document.getElementById('updateApiToken').value.trim();
            const btn = document.getElementById('checkPanelsBtn');
            const listContainer = document.getElementById('panels-list-container');
            const statusBox = document.getElementById('update-status');

            if (!token) {
                statusBox.classList.remove('hidden');
                statusBox.className = 'mt-4 text-center text-sm font-bold p-3 rounded-xl bg-red-900/20 text-red-400';
                statusBox.innerText = 'توکن وارد نشده است';
                return;
            }

            btn.disabled = true;
            btn.innerText = 'در حال بررسی...';
            statusBox.classList.add('hidden');
            listContainer.classList.add('hidden');
            listContainer.innerHTML = '';

            try {
                const response = await fetch('/api/list-panels', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token })
                });
                const result = await response.json();

                if (result.success) {
                    const latestVersion = result.latestVersion || "Unknown";
                    const devSub = result.devSub || "";

                    if (result.panels.length === 0) {
                        statusBox.classList.remove('hidden');
                        statusBox.className = 'mt-4 text-center text-sm font-bold p-3 rounded-xl bg-yellow-900/20 text-yellow-400';
                        statusBox.innerText = 'هیچ پنلی یافت نشد';
                    } else {
                        result.panels.forEach(panel => {
                            const panelDiv = document.createElement('div');
                            panelDiv.className = 'flex flex-col gap-3 p-3 bg-[#1a140e] border border-gold-500/20 rounded-xl';
                            panelDiv.id = 'panel-item-' + panel.name;
                            panelDiv.innerHTML = '<div class="flex flex-col">' +
                                '<span class="font-bold text-gold-500 break-all">' + panel.name + '</span>' +
                                '<span id="version-text-' + panel.name + '" class="text-[11px] text-gold-500/70 font-medium mt-1 animate-pulse" dir="rtl">در حال بررسی...</span>' +
                            '</div>' +
                            '<div id="btn-container-' + panel.name + '" class="w-full">' +
                                '<div class="w-16 h-6 bg-[#0a0806] rounded-lg animate-pulse"></div>' +
                            '</div>';
                            listContainer.appendChild(panelDiv);
                            fetchPanelVersion(token, panel.name, latestVersion, devSub);
                        });
                        listContainer.classList.remove('hidden');
                    }
                } else {
                    throw new Error(result.error);
                }
            } catch (e) {
                statusBox.classList.remove('hidden');
                statusBox.className = 'mt-4 text-center text-sm font-bold p-3 rounded-xl bg-red-900/20 text-red-400';
                statusBox.innerText = 'خطا: ' + e.message;
            } finally {
                btn.disabled = false;
                btn.innerText = 'بررسی پنل‌های موجود';
            }
        }

        async function fetchPanelVersion(token, scriptName, latestVersion, devSub) {
            try {
                const response = await fetch('/api/get-panel-version', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token, scriptName })
                });
                const result = await response.json();
                const version = result.success ? result.version : "Unknown";
                const isLatest = (version === latestVersion && latestVersion !== "Unknown");
                const displayVersion = version === "Unknown" ? "نامشخص" : version;

                const versionText = document.getElementById('version-text-' + scriptName);
                const btnContainer = document.getElementById('btn-container-' + scriptName);

                if (versionText && btnContainer) {
                    versionText.className = 'text-[11px] text-[#b8a07c] font-medium mt-1';
                    versionText.innerText = displayVersion;

                    let panelUrl = "#";
                    if (devSub) {
                        panelUrl = "https://" + scriptName + "." + devSub + ".workers.dev/panel";
                    }

                    let buttonsHtml = '<div class="space-y-1.5 pt-1">';
                    buttonsHtml += '<div class="flex gap-2">';
                    if (isLatest) {
                        buttonsHtml += '<button disabled class="flex-1 px-4 py-1.5 border border-gold-500/50 text-gold-500 bg-gold-500/10 font-bold rounded-xl text-[11px] cursor-not-allowed shadow-sm">آپدیت شده ✓</button>';
                    } else {
                        buttonsHtml += '<button data-name="' + scriptName + '" onclick="updateSRPanel(this.dataset.name)" class="flex-1 px-4 py-1.5 border border-gold-500/50 text-gold-500 bg-gold-500/10 hover:bg-gold-500/20 font-bold rounded-xl text-[11px] transition shadow-sm">آپدیت پنل</button>';
                    }
                    if (devSub) {
                        buttonsHtml += '<a href="' + panelUrl + '" target="_blank" class="flex-1 px-4 py-1.5 border border-gold-500/50 text-gold-500 bg-gold-500/10 hover:bg-gold-500/20 font-bold rounded-xl text-[11px] transition shadow-sm flex items-center justify-center">ورود به پنل</a>';
                    } else {
                        buttonsHtml += '<button disabled class="flex-1 px-4 py-1.5 border border-gray-700 text-gray-500 bg-gray-900/20 font-bold rounded-xl text-[11px] cursor-not-allowed shadow-sm">ورود به پنل</button>';
                    }
                    buttonsHtml += '</div>';
                    buttonsHtml += '<div class="flex gap-2">';
                    buttonsHtml += '<button data-name="' + scriptName + '" onclick="resetPanelPassword(this.dataset.name)" class="flex-1 px-5 py-1.5 border border-yellow-700 text-yellow-500 bg-yellow-900/20 hover:bg-yellow-900/40 font-bold rounded-xl text-[11px] transition shadow-sm whitespace-nowrap min-w-[110px]">بازیابی رمز</button>';
                    buttonsHtml += '<button data-name="' + scriptName + '" onclick="reloadSRPanel(this.dataset.name)" class="flex-1 px-5 py-1.5 border border-cyan-700 text-cyan-500 bg-cyan-900/20 hover:bg-cyan-900/40 font-bold rounded-xl text-[11px] transition shadow-sm whitespace-nowrap min-w-[110px]">ری استارت</button>';
                    buttonsHtml += '</div>';
                    buttonsHtml += '<div class="flex gap-2">';
                    buttonsHtml += '<button data-name="' + scriptName + '" onclick="deleteSRPanel(this.dataset.name)" class="flex-1 px-5 py-1.5 border border-red-700 text-red-500 bg-red-900/20 hover:bg-red-900/40 font-bold rounded-xl text-[11px] transition shadow-sm whitespace-nowrap min-w-[110px]">حذف پنل</button>';
                    buttonsHtml += '</div></div>';
                    btnContainer.innerHTML = buttonsHtml;
                }
            } catch (e) {
                const versionText = document.getElementById('version-text-' + scriptName);
                if (versionText) {
                    versionText.className = 'text-[11px] text-red-500 font-medium mt-1';
                    versionText.innerText = 'خطا';
                }
            }
        }

        async function updateSRPanel(scriptName) {
            const token = document.getElementById('updateApiToken').value.trim();
            if (!(await customConfirm('آیا از آپدیت پنل ' + scriptName + ' مطمئن هستید؟'))) return;
            showToast('در حال آپدیت ' + scriptName + '...');
            try {
                const response = await fetch('/api/do-update', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token, scriptName })
                });
                const result = await response.json();
                if (result.success) {
                    showToast('✅ پنل ' + scriptName + ' با موفقیت آپدیت شد!');
                    setTimeout(() => checkExistingPanels(), 2000);
                } else {
                    throw new Error(result.error);
                }
            } catch (e) {
                showToast('خطا: ' + e.message, 'error');
            }
        }

        async function deleteSRPanel(scriptName) {
            const token = document.getElementById('updateApiToken').value.trim();
            if (!(await customConfirm('آیا از حذف پنل ' + scriptName + ' مطمئن هستید؟'))) return;
            showToast('در حال حذف ' + scriptName + '...');
            try {
                const response = await fetch('/api/delete-panel', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token, scriptName })
                });
                const result = await response.json();
                if (result.success) {
                    showToast('✅ پنل با موفقیت حذف شد');
                    setTimeout(() => checkExistingPanels(), 2000);
                } else {
                    throw new Error(result.error);
                }
            } catch (e) {
                showToast('خطا: ' + e.message, 'error');
            }
        }

        async function resetPanelPassword(scriptName) {
            const token = document.getElementById('updateApiToken').value.trim();
            if (!(await customConfirm('بازیابی رمز عبور پنل ' + scriptName + '؟'))) return;
            showToast('در حال بازیابی رمز عبور ' + scriptName + '...');
            try {
                const response = await fetch('/api/reset-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token, scriptName })
                });
                const result = await response.json();
                if (result.success) {
                    showToast('✅ رمز عبور بازنشانی شد');
                    setTimeout(() => checkExistingPanels(), 2000);
                } else {
                    throw new Error(result.error);
                }
            } catch (e) {
                showToast('خطا: ' + e.message, 'error');
            }
        }

        async function reloadSRPanel(scriptName) {
            const token = document.getElementById('updateApiToken').value.trim();
            if (!(await customConfirm('آیا پنل مجدداً دیپلوی شود؟ کاربران شما باقی می‌مانند.'))) return;
            showToast('در حال ریلود پنل ' + scriptName + '...');
            try {
                const response = await fetch('/api/do-update', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token, scriptName })
                });
                const result = await response.json();
                if (result.success) {
                    showToast('✅ پنل با موفقیت ریلود شد');
                    setTimeout(() => checkExistingPanels(), 2000);
                } else {
                    throw new Error(result.error);
                }
            } catch (e) {
                showToast('خطا: ' + e.message, 'error');
            }
        }
    </script>
</body>
</html>
    `;
}