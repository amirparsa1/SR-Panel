export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);
		if (request.method === "GET" && url.pathname === "/") {
			return new Response(getHtmlContent(), {
				headers: { "Content-Type": "text/html;charset=UTF-8" },
			});
		}
		if (request.method === "POST" && url.pathname === "/api/deploy") {
			try {
				const { token } = await request.json();
				if (!token) throw new Error("توکن نمی‌تواند خالی باشد.");
				const headers = {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				};
				const accRes = await fetch("https://api.cloudflare.com/client/v4/accounts", { headers });
				const accData = await accRes.json();
				if (!accData.success || accData.result.length === 0) {
					throw new Error("فقط با دکمه نارنجی «دریافت توکن» توکن بسازید.");
				}
				const accountId = accData.result[0].id;
				let devSub = null;
				const subRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/subdomain`, { headers });
				const subData = await subRes.json();
				if (subData.success && subData.result && subData.result.subdomain) {
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
						const cfError = createSubData.errors && createSubData.errors.length > 0 ? createSubData.errors[0].message : "نامشخص";
						throw new Error(`CF_TOS_ERROR|${cfError}`);
					}
					devSub = newSub;
				}
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
					const cfError = dbData.errors && dbData.errors.length > 0 ? dbData.errors[0].message : "نامشخص";
					throw new Error(`CF_DB_ERROR|${cfError}`);
				}
				const dbUuid = dbData.result.uuid;
				await new Promise((resolve) => setTimeout(resolve, 1000));
				const githubRes = await fetch("https://raw.githubusercontent.com/amirparsa1/SR-Panel/refs/heads/main/sr-panel.js?t=" + Date.now());
				if (!githubRes.ok) throw new Error("خطا در دریافت سورس از گیت‌هاب.");
				const panelCode = await githubRes.text();
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
				formData.append("sr-panel.js", new Blob([panelCode], { type: "application/javascript+module" }), "sr-panel.js");
				const deployRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${workerName}`, {
					method: "PUT",
					headers: { Authorization: `Bearer ${token}` },
					body: formData,
				});
				const deployData = await deployRes.json();
				if (!deployData.success) {
					const cfError = deployData.errors && deployData.errors.length > 0 ? deployData.errors[0].message : "نامشخص";
					throw new Error(`CF_DEPLOY_ERROR|${cfError}`);
				}
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
		if (request.method === "POST" && url.pathname === "/api/list-panels") {
			try {
				const { token } = await request.json();
				if (!token) throw new Error("Token cannot be empty");
				const headers = {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				};
				const accRes = await fetch("https://api.cloudflare.com/client/v4/accounts", { headers });
				const accData = await accRes.json();
				if (!accData.success || accData.result.length === 0) {
					throw new Error("Account not found");
				}
				const accountId = accData.result[0].id;
				const subRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/subdomain`, { headers });
				const subData = await subRes.json();
				const devSub = subData.success && subData.result && subData.result.subdomain ? subData.result.subdomain : "";
				const scriptsRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts`, { headers });
				const scriptsData = await scriptsRes.json();
				if (!scriptsData.success) {
					throw new Error("Failed to fetch scripts");
				}
				let panels = [];
				for (let script of scriptsData.result) {
					if (script.id.startsWith("sr-panel") || script.id.startsWith("sr-")) {
						panels.push({ name: script.id });
					}
				}
				let latestVersion = "Unknown";
				try {
					const ghRes = await fetch("https://raw.githubusercontent.com/amirparsa1/SR-Panel/main/sr-panel.js?t=" + Date.now());
					if (ghRes.ok) {
						const ghText = await ghRes.text();
						const match = ghText.match(/CURRENT_VERSION\s*=\s*['"]([0-9.]+)['"]/);
						if (match && match[1]) latestVersion = "v" + match[1];
					}
				} catch (e) {}
				return new Response(JSON.stringify({ success: true, panels, latestVersion, devSub }), {
					headers: { "Content-Type": "application/json" },
				});
			} catch (error) {
				return new Response(JSON.stringify({ success: false, error: error.message }), {
					status: 400,
					headers: { "Content-Type": "application/json" },
				});
			}
		}
		if (request.method === "POST" && url.pathname === "/api/get-panel-version") {
			try {
				const { token, scriptName } = await request.json();
				const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
				const accRes = await fetch("https://api.cloudflare.com/client/v4/accounts", { headers });
				const accData = await accRes.json();
				const accountId = accData.result[0].id;
				const contentRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${scriptName}`, { headers });
				const contentText = await contentRes.text();
				let version = "Unknown";
				const varMatch = contentText.match(/CURRENT_VERSION\s*=\s*['"]([0-9.]+)['"]/);
				if (varMatch && varMatch[1]) version = "v" + varMatch[1];
				return new Response(JSON.stringify({ success: true, version }), { headers: { "Content-Type": "application/json" } });
			} catch (e) {
				return new Response(JSON.stringify({ success: false, version: "Unknown" }), { headers: { "Content-Type": "application/json" } });
			}
		}
		if (request.method === "POST" && url.pathname === "/api/do-update") {
			try {
				const { token, scriptName } = await request.json();
				if (!token || !scriptName) throw new Error("Token or script name missing");
				const headers = {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				};
				const accRes = await fetch("https://api.cloudflare.com/client/v4/accounts", { headers });
				const accData = await accRes.json();
				if (!accData.success || accData.result.length === 0) {
					throw new Error("Account not found");
				}
				const accountId = accData.result[0].id;
				const githubRes = await fetch("https://raw.githubusercontent.com/amirparsa1/SR-Panel/refs/heads/main/sr-panel.js?t=" + Date.now());
				if (!githubRes.ok) throw new Error("Failed to fetch source from GitHub");
				const newCode = await githubRes.text();
				const bindingsRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${scriptName}/bindings`, { headers });
				const bindingsData = await bindingsRes.json();
				if (!bindingsData.success) throw new Error("Failed to fetch bindings");
				const newBindings = [];
				for (const b of bindingsData.result) {
					if (b.type === "d1") {
						newBindings.push({ type: "d1", name: b.name, id: b.database_id || b.id });
					} else if (b.name === "CF_API_TOKEN") {
						newBindings.push({ type: "secret_text", name: "CF_API_TOKEN", text: token });
					} else if (b.name === "CF_ACCOUNT_ID") {
						newBindings.push({ type: "secret_text", name: "CF_ACCOUNT_ID", text: accountId });
					}
				}
				const metadata = {
					main_module: "sr-panel.js",
					compatibility_date: "2024-02-08",
					bindings: newBindings,
				};
				const formData = new FormData();
				formData.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
				formData.append("sr-panel.js", new Blob([newCode], { type: "application/javascript+module" }), "sr-panel.js");
				const deployRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${scriptName}`, {
					method: "PUT",
					headers: { Authorization: `Bearer ${token}` },
					body: formData,
				});
				const deployData = await deployRes.json();
				if (!deployData.success) {
					const cfError = deployData.errors && deployData.errors.length > 0 ? deployData.errors[0].message : "Unknown error";
					throw new Error(cfError);
				}
				return new Response(JSON.stringify({ success: true }), {
					headers: { "Content-Type": "application/json" },
				});
			} catch (error) {
				return new Response(JSON.stringify({ success: false, error: error.message }), {
					status: 400,
					headers: { "Content-Type": "application/json" },
				});
			}
		}
		if (request.method === "POST" && url.pathname === "/api/reset-password") {
			try {
				const { token, scriptName } = await request.json();
				if (!token || !scriptName) throw new Error("Token or script name missing");
				const headers = {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				};
				const accRes = await fetch("https://api.cloudflare.com/client/v4/accounts", { headers });
				const accData = await accRes.json();
				if (!accData.success || accData.result.length === 0) {
					throw new Error("Account not found");
				}
				const accountId = accData.result[0].id;
				const bindingsRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${scriptName}/bindings`, { headers });
				const bindingsData = await bindingsRes.json();
				if (!bindingsData.success) throw new Error("Failed to fetch bindings");
				const dbBinding = bindingsData.result.find((b) => b.type === "d1");
				if (!dbBinding) throw new Error("D1 binding not found");
				const dbId = dbBinding.database_id || dbBinding.id;
				const queryRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${dbId}/query`, {
					method: "POST",
					headers,
					body: JSON.stringify({ sql: "DELETE FROM settings WHERE key = 'panel_password'" }),
				});
				const queryData = await queryRes.json();
				if (!queryData.success) {
					throw new Error("Database query failed");
				}
				const githubRes = await fetch("https://raw.githubusercontent.com/amirparsa1/SR-Panel/refs/heads/main/sr-panel.js?t=" + Date.now());
				if (!githubRes.ok) throw new Error("Failed to fetch source from GitHub");
				const newCode = await githubRes.text();
				const newBindings = [];
				for (const b of bindingsData.result) {
					if (b.type === "d1") {
						newBindings.push({ type: "d1", name: b.name, id: b.database_id || b.id });
					} else if (b.name === "CF_API_TOKEN") {
						newBindings.push({ type: "secret_text", name: "CF_API_TOKEN", text: token });
					} else if (b.name === "CF_ACCOUNT_ID") {
						newBindings.push({ type: "secret_text", name: "CF_ACCOUNT_ID", text: accountId });
					}
				}
				if (!newBindings.some(b => b.name === "CF_API_TOKEN")) {
					newBindings.push({ type: "secret_text", name: "CF_API_TOKEN", text: token });
				}
				if (!newBindings.some(b => b.name === "CF_ACCOUNT_ID")) {
					newBindings.push({ type: "secret_text", name: "CF_ACCOUNT_ID", text: accountId });
				}
				const metadata = {
					main_module: "sr-panel.js",
					compatibility_date: "2024-02-08",
					bindings: newBindings,
				};
				const formData = new FormData();
				formData.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
				formData.append("sr-panel.js", new Blob([newCode], { type: "application/javascript+module" }), "sr-panel.js");
				const deployRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${scriptName}`, {
					method: "PUT",
					headers: { Authorization: `Bearer ${token}` },
					body: formData,
				});
				const deployData = await deployRes.json();
				if (!deployData.success) {
					throw new Error("Failed to restart worker");
				}
				return new Response(JSON.stringify({ success: true }), {
					headers: { "Content-Type": "application/json" },
				});
			} catch (error) {
				return new Response(JSON.stringify({ success: false, error: error.message }), {
					status: 400,
					headers: { "Content-Type": "application/json" },
				});
			}
		}
		if (request.method === "POST" && url.pathname === "/api/delete-panel") {
			try {
				const { token, scriptName } = await request.json();
				if (!token || !scriptName) throw new Error("Token or script name missing");
				const headers = {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				};
				const accRes = await fetch("https://api.cloudflare.com/client/v4/accounts", { headers });
				const accData = await accRes.json();
				if (!accData.success || accData.result.length === 0) {
					throw new Error("Account not found");
				}
				const accountId = accData.result[0].id;
				const deleteRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${scriptName}`, {
					method: "DELETE",
					headers,
				});
				const deleteData = await deleteRes.json();
				if (!deleteData.success) {
					const cfError = deleteData.errors && deleteData.errors.length > 0 ? deleteData.errors[0].message : "Unknown error";
					throw new Error(cfError);
				}
				return new Response(JSON.stringify({ success: true }), {
					headers: { "Content-Type": "application/json" },
				});
			} catch (error) {
				return new Response(JSON.stringify({ success: false, error: error.message }), {
					status: 400,
					headers: { "Content-Type": "application/json" },
				});
			}
		}
		return new Response("Not Found", { status: 404 });
	},
};

function getHtmlContent() {
	return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SR Panel Deployer</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
    <style>
        body { font-family: 'Vazirmatn', sans-serif; background: #0a0a0f; }
        .glass { background: rgba(255,255,255,0.05); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.08); }
        .gradient-bg { background: linear-gradient(135deg, #7c3aed, #3b82f6); }
        .gradient-text { background: linear-gradient(135deg, #7c3aed, #3b82f6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .input-glow:focus { box-shadow: 0 0 30px rgba(124, 58, 237, 0.2); }
        .hover-glow:hover { box-shadow: 0 0 40px rgba(124, 58, 237, 0.15); }
        .card { transition: all 0.3s ease; }
        .card:hover { transform: translateY(-4px); }
    </style>
</head>
<body class="min-h-screen flex flex-col items-center justify-center p-4">
    <div class="glass rounded-2xl p-8 max-w-md w-full card hover-glow">
        <div class="text-center mb-6">
            <div class="w-16 h-16 mx-auto bg-gradient-to-br from-purple-600 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-500/20">
                <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                </svg>
            </div>
            <h1 class="text-3xl font-bold gradient-text mt-3">SR Panel</h1>
            <p class="text-gray-400 text-sm">نصب خودکار پنل روی کلودفلر</p>
            <p class="text-xs text-purple-400/60 mt-1">🔥 روزانه ۱۰ تا ۱۰۰ گیگ کانفیگ رایگان</p>
        </div>
        
        <div class="space-y-4">
            <a href="https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=%5B%7B%22key%22%3A%22workers_scripts%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22workers_kv_storage%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22d1%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22account_settings%22%2C%22type%22%3A%22read%22%7D%2C%7B%22key%22%3A%22workers_subdomain%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22account_analytics%22%2C%22type%22%3A%22read%22%7D%5D&accountId=*&zoneId=all&name=SR-Deployer-Token" target="_blank" class="w-full py-3 bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 font-bold rounded-xl transition flex items-center justify-center gap-2">
                <i class="fas fa-key"></i> دریافت توکن کلودفلر
            </a>
            
            <p class="text-[10px] text-gray-500 text-center leading-relaxed">
                در کلودفلر لاگین کنید، دکمه <span class="text-orange-400">دریافت توکن</span> را بزنید،
                در صفحه بعد روی <span class="text-blue-400">Continue to summary</span> کلیک کرده و توکن را کپی کنید.
            </p>
            
            <div class="relative">
                <input type="password" id="apiToken" placeholder="توکن خود را وارد کنید" class="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 input-glow transition text-white placeholder-gray-500 font-mono text-sm">
                <button onclick="toggleToken()" class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition">
                    <i class="fas fa-eye" id="eyeIcon"></i>
                </button>
            </div>
            
            <button onclick="startDeploy()" id="deployBtn" class="w-full py-3 gradient-bg text-white font-bold rounded-xl hover:shadow-lg hover:shadow-purple-500/30 transition flex items-center justify-center gap-2">
                <i class="fas fa-rocket"></i> ساخت پنل
            </button>
            
            <button onclick="toggleUpdateModal(true)" class="w-full py-3 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 font-bold rounded-xl transition flex items-center justify-center gap-2">
                <i class="fas fa-cogs"></i> مدیریت پنل‌ها
            </button>
            
            <div id="status-container" class="hidden mt-4 glass rounded-xl p-4">
                <div class="flex justify-between text-sm mb-2">
                    <span id="status-text" class="text-gray-300">شروع...</span>
                    <span id="status-pct" class="text-purple-400 font-bold">۰%</span>
                </div>
                <div class="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div id="progressBar" class="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full transition-all duration-300" style="width:0%"></div>
                </div>
            </div>
            
            <div id="error-box" class="hidden p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm text-center"></div>
        </div>
    </div>
    
    <div class="flex gap-4 mt-6">
        <a href="https://github.com/amirparsa1/SR-Panel" target="_blank" class="text-gray-500 hover:text-white transition">
            <i class="fab fa-github text-xl"></i>
        </a>
        <a href="https://t.me/SR_Panel_IR_BOT" target="_blank" class="text-gray-500 hover:text-blue-400 transition">
            <i class="fab fa-telegram text-xl"></i>
        </a>
        <a href="https://sr-deployer.ir-srroot.workers.dev/" target="_blank" class="text-gray-500 hover:text-amber-400 transition">
            <i class="fas fa-rocket text-xl"></i>
        </a>
    </div>
    
    <!-- Update Modal -->
    <div id="update-modal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 opacity-0 pointer-events-none transition-all duration-300">
        <div class="glass rounded-2xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto transition-all transform scale-95 opacity-0" id="update-modal-card">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-xl font-bold glow-text"><i class="fas fa-cogs ml-2"></i> مدیریت پنل‌ها</h3>
                <button onclick="toggleUpdateModal(false)" class="text-gray-400 hover:text-white transition">
                    <i class="fas fa-times text-xl"></i>
                </button>
            </div>
            
            <a href="https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=%5B%7B%22key%22%3A%22workers_scripts%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22workers_kv_storage%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22d1%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22account_settings%22%2C%22type%22%3A%22read%22%7D%2C%7B%22key%22%3A%22workers_subdomain%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22account_analytics%22%2C%22type%22%3A%22read%22%7D%5D&accountId=*&zoneId=all&name=SR-Deployer-Token" target="_blank" class="w-full py-2 bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 font-bold rounded-xl transition flex items-center justify-center gap-2 text-sm mb-4">
                <i class="fas fa-key"></i> دریافت توکن کلودفلر
            </a>
            
            <input type="password" id="updateApiToken" placeholder="توکن را وارد کنید" class="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 transition text-white placeholder-gray-500 font-mono text-sm mb-3">
            
            <button onclick="checkExistingPanels()" id="checkPanelsBtn" class="w-full py-2 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 font-bold rounded-xl transition">
                <i class="fas fa-search ml-1"></i> بررسی پنل‌های موجود
            </button>
            
            <div id="panels-list-container" class="hidden mt-4 space-y-3 max-h-60 overflow-y-auto"></div>
            <div id="update-status" class="hidden mt-4 text-center text-sm font-bold p-3 rounded-xl"></div>
        </div>
    </div>
    
    <script>
        function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
        
        function toggleToken() {
            const input = document.getElementById('apiToken');
            const icon = document.getElementById('eyeIcon');
            if (input.type === 'password') {
                input.type = 'text';
                icon.className = 'fas fa-eye-slash';
            } else {
                input.type = 'password';
                icon.className = 'fas fa-eye';
            }
        }
        
        function toggleUpdateModal(show) {
            const modal = document.getElementById('update-modal');
            const card = document.getElementById('update-modal-card');
            if (show) {
                modal.classList.remove('opacity-0', 'pointer-events-none');
                card.classList.remove('scale-95', 'opacity-0');
                card.classList.add('scale-100', 'opacity-100');
            } else {
                modal.classList.add('opacity-0', 'pointer-events-none');
                card.classList.remove('scale-100', 'opacity-100');
                card.classList.add('scale-95', 'opacity-0');
                document.getElementById('panels-list-container').classList.add('hidden');
                document.getElementById('update-status').classList.add('hidden');
            }
        }
        
        function showToast(msg, type = 'success') {
            const container = document.createElement('div');
            container.className = \`fixed top-4 left-1/2 -translate-x-1/2 z-[9999] px-6 py-3 glass rounded-xl font-bold text-sm transition-all duration-300 \${type === 'error' ? 'border-red-500/30 text-red-400' : 'border-green-500/30 text-green-400'}\`;
            container.innerText = msg;
            document.body.appendChild(container);
            setTimeout(() => {
                container.classList.add('opacity-0', 'scale-95');
                setTimeout(() => container.remove(), 300);
            }, 3000);
        }
        
        async function customConfirm(msg) {
            return new Promise((resolve) => {
                const modal = document.createElement('div');
                modal.className = 'fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70';
                modal.innerHTML = \`
                    <div class="glass rounded-2xl p-6 max-w-sm w-full text-center">
                        <h3 class="font-bold text-lg mb-3">تأیید</h3>
                        <p class="text-gray-300 text-sm mb-6">\${msg}</p>
                        <div class="flex gap-3">
                            <button onclick="this.closest('.fixed').remove(); resolve(false)" class="flex-1 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 font-bold rounded-xl transition">انصراف</button>
                            <button onclick="this.closest('.fixed').remove(); resolve(true)" class="flex-1 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-purple-500/30 transition">تأیید</button>
                        </div>
                    </div>
                \`;
                document.body.appendChild(modal);
            });
        }
        
        async function checkExistingPanels() {
            const token = document.getElementById('updateApiToken').value.trim();
            const btn = document.getElementById('checkPanelsBtn');
            const listContainer = document.getElementById('panels-list-container');
            const statusBox = document.getElementById('update-status');
            if (!token) {
                statusBox.classList.remove('hidden');
                statusBox.className = 'mt-4 text-center text-sm font-bold p-3 rounded-xl bg-red-500/20 border border-red-500/30 text-red-400';
                statusBox.innerText = 'لطفاً توکن را وارد کنید';
                return;
            }
            btn.disabled = true;
            btn.innerText = 'در حال بررسی...';
            statusBox.classList.add('hidden');
            listContainer.classList.add('hidden');
            listContainer.innerHTML = '';
            try {
                const res = await fetch('/api/list-panels', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token })
                });
                const data = await res.json();
                if (data.success) {
                    if (data.panels.length === 0) {
                        statusBox.classList.remove('hidden');
                        statusBox.className = 'mt-4 text-center text-sm font-bold p-3 rounded-xl bg-yellow-500/20 border border-yellow-500/30 text-yellow-400';
                        statusBox.innerText = 'هیچ پنلی یافت نشد';
                    } else {
                        listContainer.classList.remove('hidden');
                        data.panels.forEach(p => {
                            const div = document.createElement('div');
                            div.className = 'glass rounded-xl p-3';
                            div.innerHTML = \`
                                <div class="flex justify-between items-center">
                                    <span class="font-bold text-sm">\${p.name}</span>
                                    <span id="version-\${p.name}" class="text-xs text-gray-400">در حال بررسی...</span>
                                </div>
                                <div class="flex gap-2 mt-2 flex-wrap">
                                    <button onclick="updatePanel('\${p.name}')" class="px-3 py-1 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 rounded-lg text-xs transition">آپدیت</button>
                                    <button onclick="resetPassword('\${p.name}')" class="px-3 py-1 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 rounded-lg text-xs transition">بازیابی رمز</button>
                                    <button onclick="deletePanel('\${p.name}')" class="px-3 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-xs transition">حذف</button>
                                    <a href="https://\${p.name}.\${data.devSub}.workers.dev/panel" target="_blank" class="px-3 py-1 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg text-xs transition">ورود</a>
                                </div>
                            \`;
                            listContainer.appendChild(div);
                            getPanelVersion(token, p.name);
                        });
                    }
                } else {
                    throw new Error(data.error);
                }
            } catch(e) {
                statusBox.classList.remove('hidden');
                statusBox.className = 'mt-4 text-center text-sm font-bold p-3 rounded-xl bg-red-500/20 border border-red-500/30 text-red-400';
                statusBox.innerText = 'خطا: ' + e.message;
            }
            btn.disabled = false;
            btn.innerText = 'بررسی پنل‌های موجود';
        }
        
        async function getPanelVersion(token, name) {
            try {
                const res = await fetch('/api/get-panel-version', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token, scriptName: name })
                });
                const data = await res.json();
                document.getElementById('version-' + name).innerText = data.success ? data.version : 'نامشخص';
            } catch(e) {
                document.getElementById('version-' + name).innerText = 'خطا';
            }
        }
        
        async function updatePanel(name) {
            const token = document.getElementById('updateApiToken').value.trim();
            if (!await customConfirm('آپدیت پنل ' + name + '؟')) return;
            showToast('در حال آپدیت...');
            try {
                const res = await fetch('/api/do-update', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token, scriptName: name })
                });
                const data = await res.json();
                if (data.success) {
                    showToast('✅ پنل آپدیت شد');
                    setTimeout(() => checkExistingPanels(), 2000);
                } else {
                    showToast('❌ خطا: ' + data.error, 'error');
                }
            } catch(e) { showToast('❌ خطا در ارتباط با سرور', 'error'); }
        }
        
        async function resetPassword(name) {
            const token = document.getElementById('updateApiToken').value.trim();
            if (!await customConfirm('بازیابی رمز پنل ' + name + '؟')) return;
            showToast('در حال بازیابی رمز...');
            try {
                const res = await fetch('/api/reset-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token, scriptName: name })
                });
                const data = await res.json();
                if (data.success) {
                    showToast('✅ رمز بازنشانی شد');
                    setTimeout(() => checkExistingPanels(), 2000);
                } else {
                    showToast('❌ خطا: ' + data.error, 'error');
                }
            } catch(e) { showToast('❌ خطا در ارتباط با سرور', 'error'); }
        }
        
        async function deletePanel(name) {
            const token = document.getElementById('updateApiToken').value.trim();
            if (!await customConfirm('حذف پنل ' + name + '؟')) return;
            showToast('در حال حذف...');
            try {
                const res = await fetch('/api/delete-panel', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token, scriptName: name })
                });
                const data = await res.json();
                if (data.success) {
                    showToast('✅ پنل حذف شد');
                    setTimeout(() => checkExistingPanels(), 2000);
                } else {
                    showToast('❌ خطا: ' + data.error, 'error');
                }
            } catch(e) { showToast('❌ خطا در ارتباط با سرور', 'error'); }
        }
        
        async function startDeploy() {
            const token = document.getElementById('apiToken').value.trim();
            const btn = document.getElementById('deployBtn');
            const statusContainer = document.getElementById('status-container');
            const statusText = document.getElementById('status-text');
            const statusPct = document.getElementById('status-pct');
            const progressBar = document.getElementById('progressBar');
            const errorBox = document.getElementById('error-box');
            
            if (!token) {
                errorBox.classList.remove('hidden');
                errorBox.innerText = 'لطفاً توکن را وارد کنید';
                return;
            }
            errorBox.classList.add('hidden');
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> در حال پردازش...';
            statusContainer.classList.remove('hidden');
            
            try {
                statusText.innerText = 'بررسی توکن...';
                statusPct.innerText = '۱۵%';
                progressBar.style.width = '15%';
                await sleep(500);
                
                statusText.innerText = 'ارتباط با کلودفلر...';
                statusPct.innerText = '۳۰%';
                progressBar.style.width = '30%';
                await sleep(500);
                
                statusText.innerText = 'ساخت دیتابیس D1...';
                statusPct.innerText = '۵۰%';
                progressBar.style.width = '50%';
                
                const res = await fetch('/api/deploy', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token })
                });
                
                statusText.innerText = 'دریافت پنل...';
                statusPct.innerText = '۷۵%';
                progressBar.style.width = '75%';
                await sleep(600);
                
                statusText.innerText = 'فعال‌سازی لینک...';
                statusPct.innerText = '۹۰%';
                progressBar.style.width = '90%';
                await sleep(500);
                
                const data = await res.json();
                if (data.success) {
                    statusPct.innerText = '۱۰۰%';
                    progressBar.style.width = '100%';
                    statusText.innerText = '✅ تکمیل شد!';
                    await sleep(400);
                    statusContainer.classList.add('hidden');
                    
                    const successDiv = document.createElement('div');
                    successDiv.className = 'mt-4 p-4 glass rounded-xl text-center';
                    successDiv.innerHTML = \`
                        <p class="text-green-400 font-bold mb-2">✅ پنل ساخته شد!</p>
                        <p class="text-xs text-gray-400 mb-3">لطفاً ۵ دقیقه صبر کنید و سپس وارد شوید</p>
                        <div class="flex flex-col gap-2">
                            <input type="text" value="\${data.url}" readonly class="w-full px-3 py-2 bg-white/5 rounded-lg text-sm font-mono text-center text-purple-400">
                            <button onclick="navigator.clipboard.writeText('\${data.url}')" class="w-full py-2 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 rounded-lg transition text-sm font-bold">کپی لینک</button>
                            <a href="\${data.url}" target="_blank" class="w-full py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold rounded-lg hover:shadow-lg hover:shadow-purple-500/30 transition text-sm">ورود به پنل</a>
                        </div>
                    \`;
                    document.querySelector('.glass').appendChild(successDiv);
                } else {
                    throw new Error(data.error);
                }
            } catch(e) {
                statusContainer.classList.add('hidden');
                errorBox.classList.remove('hidden');
                errorBox.innerText = e.message || 'خطای ناشناخته';
            }
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-rocket"></i> ساخت پنل';
        }
    </script>
</body>
</html>`;
}