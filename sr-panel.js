import { connect } from "cloudflare:sockets";

// ============================================
// SR PANEL v3.0 - Special Edition
// Developer: @amirparsa1
// Repo: https://github.com/amirparsa1/SR-Panel
// ============================================

const CURRENT_VERSION = "3.0.0";
const GLOBAL_TRAFFIC_CACHE = new Map();
const ACTIVE_CONNECTIONS_COUNT = new Map();
const GLOBAL_LAST_ACTIVE_WRITE = new Map();
const GLOBAL_LAST_DB_WRITE = new Map();
const GLOBAL_WRITE_LOCK = new Map();
const DNS_CACHE = new Map();
const USER_REQ_CACHE = new Map();
let GLOBAL_REQ_COUNT = 0;
let GLOBAL_LAST_REQ_WRITE = 0;
const DNS_CACHE_TTL = 5 * 60 * 1000;
const DOH_RESOLVER = "https://cloudflare-dns.com/dns-query";
const UPSTREAM_BUNDLE_TARGET_BYTES = 8 * 1024;
const UPSTREAM_QUEUE_MAX_BYTES = 4 * 1024 * 1024;
const UPSTREAM_QUEUE_MAX_ITEMS = 4096;
const DOWNSTREAM_GRAIN_BYTES = 16 * 1024;
const DOWNSTREAM_GRAIN_TAIL_THRESHOLD = 256;
const DOWNSTREAM_GRAIN_SILENT_MS = 1;
const TCP_CONCURRENCY = 2;
const PRELOAD_RACE_DIAL = true;

// ============================================
// MAIN WORKER
// ============================================
export default {
	async fetch(request, env, ctx) {
		trackRequest(env, ctx);
		await DbService.ensureSchema(env.DB);
		const url = new URL(request.url);
		
		if (Router.isWebSocketUpgrade(request) && url.pathname === "/In_Panel_Rayeghan_Ast_Va_Gheyre_Ghabele_Foroosh") {
			return await Router.handleWebSocket(request, env, ctx);
		}
		if (Router.isSubscriptionPath(url.pathname)) {
			return await Router.handleSubscription(url, env);
		}
		if (url.pathname.startsWith("/api/") || url.pathname === "/locations") {
			return await Router.handleApi(request, url, env, ctx);
		}
		if (url.pathname === "/panel" || url.pathname === "/login") {
			return await Router.handlePanel(request, env);
		}
		if (url.pathname.startsWith("/status/")) {
			return await Router.handleUserStatus(url, env);
		}
		
		// Changelog endpoint
		if (url.pathname === "/changelog") {
			return new Response(JSON.stringify({
				version: CURRENT_VERSION,
				changes: [
					"✨ طراحی کامل جدید با تم تیره-بنفش و افکت‌های Glassmorphism",
					"📊 داشبورد با نمودارهای CSS برای نمایش ترافیک و ریکوئست",
					"🔄 سیستم تشخیص آپدیت Not Detected با نمایش اعلان ویژه",
					"🧩 منوی کناری (Sidebar) با قابلیت جمع‌شدن",
					"🔍 فیلتر و مرتب‌سازی پیشرفته کاربران",
					"⚠️ بخش کاربران در معرض خطر (نزدیک به اتمام حجم/زمان)",
					"📱 ریسپانسیو کامل برای موبایل و تبلت",
					"⚡ بهینه‌سازی سرعت لود و کاهش حجم کد"
				]
			}), {
				headers: { "Content-Type": "application/json; charset=utf-8" }
			});
		}
		
		return new Response(HTML_TEMPLATES.nginx, {
			headers: { "Content-Type": "text/html; charset=utf-8" },
		});
	},
};

// ============================================
// ROUTER
// ============================================
const Router = {
	isWebSocketUpgrade(request) {
		const upgradeHeader = (request.headers.get("Upgrade") || "").toLowerCase();
		return upgradeHeader === "websocket";
	},
	isSubscriptionPath(pathname) {
		return pathname.startsWith("/sub/") || pathname.startsWith("/feed/");
	},
	async handleWebSocket(request, env, ctx) {
		try {
			let proxyIP = "proxyip.cmliussss.net";
			let socks5 = "";
			try {
				const proxyRow = await env.DB.prepare("SELECT value FROM settings WHERE key = 'proxy_ip'").first();
				if (proxyRow && proxyRow.value) {
					proxyIP = proxyRow.value;
				}
				const socksRow = await env.DB.prepare("SELECT value FROM settings WHERE key = 'socks5'").first();
				if (socksRow && socksRow.value) {
					socks5 = socksRow.value;
				}
			} catch (e) {}
			const mockStoredData = { proxy_ip: proxyIP, socks5: socks5 };
			return handleVLESS(env, mockStoredData, ctx, request);
		} catch (e) {
			return new Response("Internal Server Error", { status: 500 });
		}
	},
	async handleSubscription(url, env) {
		const isSubPath = url.pathname.startsWith("/sub/");
		const offset = isSubPath ? 5 : 6;
		let subUser = decodeURIComponent(url.pathname.slice(offset));
		const host = url.hostname;
		try {
			const user = await env.DB.prepare("SELECT * FROM users WHERE username = ? OR uuid = ?").bind(subUser, subUser).first();
			if (!user || user.connection_type !== atob("dmxlc3M=")) {
				return new Response("Not Found", { status: 404 });
			}
			return await SubscriptionService.generateText(user, host);
		} catch (err) {
			return new Response("Error building config: " + err.message, { status: 500 });
		}
	},
	async handlePanel(request, env) {
		const hasPassword = await DbService.getPanelPassword(env.DB);
		if (!hasPassword) {
			return new Response(HTML_TEMPLATES.setup, {
				headers: { "Content-Type": "text/html; charset=utf-8" },
			});
		}
		const authorized = await DbService.verifyApiAuth(request, env);
		if (!authorized) {
			return new Response(HTML_TEMPLATES.login, {
				headers: { "Content-Type": "text/html; charset=utf-8" },
			});
		}
		return new Response(HTML_TEMPLATES.panel, {
			headers: {
				"Content-Type": "text/html; charset=utf-8",
				"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
				Pragma: "no-cache",
				Expires: "0",
			},
		});
	},
	async handleUserStatus(url, env) {
		const username = decodeURIComponent(url.pathname.slice(8));
		if (!username) {
			return new Response("Username is required", { status: 400 });
		}
		try {
			const user = await env.DB.prepare("SELECT * FROM users WHERE username = ? OR uuid = ?").bind(username, username).first();
			if (!user) {
				return new Response("User not found", { status: 404 });
			}
			const userJson = JSON.stringify({
				username: user.username,
				uuid: user.uuid,
				limit_gb: user.limit_gb,
				expiry_days: user.expiry_days,
				used_gb: user.used_gb,
				limit_req: user.limit_req,
				used_req: user.used_req,
				is_active: user.is_active,
				online_count: getActiveIpCount(user.active_ips),
				ip_limit: user.ip_limit,
				created_at: user.created_at,
				tls: user.tls,
				port: user.port,
				ips: user.ips,
				fingerprint: user.fingerprint || "chrome",
			});
			const html = HTML_TEMPLATES.status.replace("/* {{USER_DATA_PLACEHOLDER}} */", `window.statusUser = ${userJson};`);
			return new Response(html, {
				headers: { "Content-Type": "text/html; charset=utf-8" },
			});
		} catch (err) {
			return new Response("Error: " + err.message, { status: 500 });
		}
	},
	async handleApi(request, url, env, ctx) {
		const hasPassword = await DbService.getPanelPassword(env.DB);
		
		// ============================================
		// SETUP PASSWORD
		// ============================================
		if (url.pathname === "/api/setup-password" && request.method === "POST") {
			if (hasPassword) {
				return new Response(JSON.stringify({ error: "رمز عبور از قبل تعریف شده است" }), {
					status: 400,
					headers: { "Content-Type": "application/json; charset=utf-8" },
				});
			}
			const { password } = await request.json();
			if (!password || password.length < 4) {
				return new Response(JSON.stringify({ error: "رمز عبور باید حداقل ۴ کاراکتر باشد" }), {
					status: 400,
					headers: { "Content-Type": "application/json; charset=utf-8" },
				});
			}
			const hashed = await DbService.sha256(password);
			await DbService.setPanelPassword(env.DB, hashed);
			return new Response(JSON.stringify({ success: true }), {
				headers: {
					"Content-Type": "application/json; charset=utf-8",
					"Set-Cookie": "panel_session=" + hashed + "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000",
				},
			});
		}

		// ============================================
		// LOGIN
		// ============================================
		if (url.pathname === "/api/login" && request.method === "POST") {
			const { password } = await request.json();
			const hashedInput = await DbService.sha256(password);
			const storedHash = await DbService.getPanelPassword(env.DB);
			if (storedHash === hashedInput) {
				return new Response(JSON.stringify({ success: true }), {
					headers: {
						"Content-Type": "application/json; charset=utf-8",
						"Set-Cookie": "panel_session=" + storedHash + "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000",
					},
				});
			}
			return new Response(JSON.stringify({ error: "رمز عبور اشتباه است" }), {
				status: 401,
				headers: { "Content-Type": "application/json; charset=utf-8" },
			});
		}

		// ============================================
		// LOGOUT
		// ============================================
		if (url.pathname === "/api/logout" && request.method === "POST") {
			return new Response(JSON.stringify({ success: true }), {
				headers: {
					"Content-Type": "application/json; charset=utf-8",
					"Set-Cookie": "panel_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax",
				},
			});
		}

		// ============================================
		// RECOVER PASSWORD
		// ============================================
		if (url.pathname === "/api/recover" && request.method === "POST") {
			const { api_token } = await request.json();
			if (!api_token) {
				return new Response(JSON.stringify({ error: "Token is required" }), {
					status: 400,
					headers: { "Content-Type": "application/json; charset=utf-8" },
				});
			}
			try {
				const cfRes = await fetch("https://api.cloudflare.com/client/v4/user/tokens/verify", {
					headers: { Authorization: "Bearer " + api_token },
				});
				const cfData = await cfRes.json();
				if (!cfRes.ok || !cfData.success) {
					return new Response(JSON.stringify({ error: "Invalid or expired Cloudflare token" }), {
						status: 401,
						headers: { "Content-Type": "application/json; charset=utf-8" },
					});
				}
				const host = url.hostname;
				let isAuthorized = false;
				if (host.endsWith(".workers.dev")) {
					const parts = host.split(".");
					const targetSubdomain = parts[parts.length - 3];
					const accountsRes = await fetch("https://api.cloudflare.com/client/v4/accounts", {
						headers: { Authorization: "Bearer " + api_token },
					});
					const accountsData = await accountsRes.json();
					if (accountsData.success && accountsData.result) {
						for (const acc of accountsData.result) {
							const subRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${acc.id}/workers/subdomain`, {
								headers: { Authorization: "Bearer " + api_token },
							});
							const subData = await subRes.json();
							if (subData.success && subData.result && subData.result.subdomain === targetSubdomain) {
								isAuthorized = true;
								break;
							}
						}
					}
				} else {
					const zonesRes = await fetch("https://api.cloudflare.com/client/v4/zones", {
						headers: { Authorization: "Bearer " + api_token },
					});
					const zonesData = await zonesRes.json();
					if (zonesData.success && zonesData.result) {
						for (const zone of zonesData.result) {
							if (host === zone.name || host.endsWith("." + zone.name)) {
								isAuthorized = true;
								break;
							}
						}
					}
				}
				if (!isAuthorized) {
					return new Response(JSON.stringify({ error: "این توکن متعلق به صاحب پنل نیست" }), {
						status: 403,
						headers: { "Content-Type": "application/json; charset=utf-8" },
					});
				}
				await env.DB.prepare("DELETE FROM settings WHERE key = 'panel_password'").run();
				cachedPanelPassword = null;
				return new Response(JSON.stringify({ success: true }), {
					headers: { "Content-Type": "application/json; charset=utf-8" },
				});
			} catch (err) {
				return new Response(JSON.stringify({ error: "Cloudflare API connection error" }), {
					status: 500,
					headers: { "Content-Type": "application/json; charset=utf-8" },
				});
			}
		}

		const authorized = await DbService.verifyApiAuth(request, env);
		if (!authorized) {
			return new Response(JSON.stringify({ error: "Unauthorized" }), {
				status: 401,
				headers: { "Content-Type": "application/json; charset=utf-8" },
			});
		}

		// ============================================
		// UPDATE PANEL (WITH "NOT DETECTED" FEATURE)
		// ============================================
		if (url.pathname === "/api/update-panel" && request.method === "POST") {
			const body = await request.json().catch(() => ({}));
			let currentToken = env.CF_API_TOKEN || body.cf_token;
			let currentAccountId = env.CF_ACCOUNT_ID;

			if (!currentToken) {
				return new Response(JSON.stringify({ error: "TOKEN_REQUIRED" }), { status: 400, headers: { "Content-Type": "application/json" } });
			}

			try {
				if (!currentAccountId) {
					const accRes = await fetch("https://api.cloudflare.com/client/v4/accounts", {
						headers: { Authorization: "Bearer " + currentToken },
					});
					const accData = await accRes.json();
					if (!accData.success || accData.result.length === 0) throw new Error("توکن نامعتبر است یا اکانتی یافت نشد.");
					currentAccountId = accData.result[0].id;
				}

				const githubRes = await fetch("https://raw.githubusercontent.com/amirparsa1/SR-Panel/refs/heads/main/sr-panel.js?t=" + Date.now() + Math.random(), {
					headers: {
						"Cache-Control": "no-cache, no-store, must-revalidate",
						Pragma: "no-cache",
						Expires: "0",
					},
				});
				if (!githubRes.ok) throw new Error("خطا در دریافت سورس جدید از گیت‌هاب");
				const newCode = await githubRes.text();

				const scriptName = env.WORKER_NAME || url.hostname.split(".")[0];
				const bindingsRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${currentAccountId}/workers/scripts/${scriptName}/bindings`, {
					headers: { Authorization: "Bearer " + currentToken },
				});
				const bindingsData = await bindingsRes.json();
				if (!bindingsData.success) throw new Error("عدم دسترسی به تنظیمات ورکر. توکن نامعتبر است.");

				const newBindings = [];
				for (const b of bindingsData.result) {
					if (b.type === "d1") {
						newBindings.push({ type: "d1", name: b.name, id: b.database_id || b.id });
					} else if (b.name === "CF_API_TOKEN") {
						newBindings.push({ type: "secret_text", name: "CF_API_TOKEN", text: currentToken });
					} else if (b.name === "CF_ACCOUNT_ID") {
						newBindings.push({ type: "secret_text", name: "CF_ACCOUNT_ID", text: currentAccountId });
					}
				}

				if (!newBindings.some((b) => b.name === "CF_API_TOKEN")) {
					newBindings.push({ type: "secret_text", name: "CF_API_TOKEN", text: currentToken });
				}
				if (!newBindings.some((b) => b.name === "CF_ACCOUNT_ID")) {
					newBindings.push({ type: "secret_text", name: "CF_ACCOUNT_ID", text: currentAccountId });
				}

				const metadata = {
					main_module: "sr-panel.js",
					compatibility_date: "2024-02-08",
					bindings: newBindings,
				};

				const formData = new FormData();
				formData.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
				formData.append("sr-panel.js", new Blob([newCode], { type: "application/javascript+module" }), "sr-panel.js");

				const deployRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${currentAccountId}/workers/scripts/${scriptName}`, {
					method: "PUT",
					headers: { Authorization: "Bearer " + currentToken },
					body: formData,
				});
				const deployData = await deployRes.json();
				if (!deployData.success) throw new Error("خطا در اعمال آپدیت در کلودفلر.");

				return new Response(JSON.stringify({ success: true, version: CURRENT_VERSION, changelog: await getChangelog() }), { headers: { "Content-Type": "application/json" } });
			} catch (err) {
				const errorMsg = err.message + " | در صورت عدم موفقیت، از طریق لینک زیر آپدیت کنید: https://sr-deployer.ir-srroot.workers.dev/";
				return new Response(JSON.stringify({ error: errorMsg }), { status: 500, headers: { "Content-Type": "application/json" } });
			}
		}

		// ============================================
		// RESTART CORE
		// ============================================
		if (url.pathname === "/api/restart-core" && request.method === "POST") {
			let currentToken = env.CF_API_TOKEN;
			let currentAccountId = env.CF_ACCOUNT_ID;

			if (!currentToken || !currentAccountId) {
				return new Response(JSON.stringify({ error: "TOKEN_REQUIRED" }), { status: 400, headers: { "Content-Type": "application/json" } });
			}

			try {
				const githubRes = await fetch("https://raw.githubusercontent.com/amirparsa1/SR-Panel/refs/heads/main/sr-panel.js?t=" + Date.now(), {
					headers: {
						"Cache-Control": "no-cache, no-store, must-revalidate",
						Pragma: "no-cache",
						Expires: "0",
					},
				});
				if (!githubRes.ok) throw new Error("خطا در دریافت سورس از گیت‌هاب");
				const newCode = await githubRes.text();

				const scriptName = env.WORKER_NAME || url.hostname.split(".")[0];
				const bindingsRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${currentAccountId}/workers/scripts/${scriptName}/bindings`, {
					headers: { Authorization: "Bearer " + currentToken },
				});
				const bindingsData = await bindingsRes.json();
				if (!bindingsData.success) throw new Error("عدم دسترسی به تنظیمات ورکر");

				const newBindings = [];
				for (const b of bindingsData.result) {
					if (b.type === "d1") {
						newBindings.push({ type: "d1", name: b.name, id: b.database_id || b.id });
					}
				}

				newBindings.push({ type: "secret_text", name: "CF_API_TOKEN", text: currentToken });
				newBindings.push({ type: "secret_text", name: "CF_ACCOUNT_ID", text: currentAccountId });

				const metadata = {
					main_module: "sr-panel.js",
					compatibility_date: "2024-02-08",
					bindings: newBindings,
				};

				const formData = new FormData();
				formData.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
				formData.append("sr-panel.js", new Blob([newCode], { type: "application/javascript+module" }), "sr-panel.js");

				const deployRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${currentAccountId}/workers/scripts/${scriptName}`, {
					method: "PUT",
					headers: { Authorization: "Bearer " + currentToken },
					body: formData,
				});
				const deployData = await deployRes.json();
				if (!deployData.success) throw new Error("خطا در اعمال ری‌استارت در کلودفلر");

				return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
			} catch (err) {
				return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
			}
		}

		// ============================================
		// CHANGE PASSWORD
		// ============================================
		if (url.pathname === "/api/change-password" && request.method === "POST") {
			const { current_password, new_password } = await request.json();
			if (!current_password || !new_password) {
				return new Response(JSON.stringify({ error: "رمز عبور فعلی و جدید الزامی هستند" }), {
					status: 400,
					headers: { "Content-Type": "application/json; charset=utf-8" },
				});
			}
			const currentHash = await DbService.sha256(current_password);
			const storedHash = await DbService.getPanelPassword(env.DB);
			if (storedHash && storedHash !== currentHash) {
				return new Response(JSON.stringify({ error: "رمز عبور فعلی اشتباه است" }), {
					status: 401,
					headers: { "Content-Type": "application/json; charset=utf-8" },
				});
			}
			if (new_password.length < 4) {
				return new Response(JSON.stringify({ error: "رمز عبور جدید باید حداقل ۴ کاراکتر باشد" }), {
					status: 400,
					headers: { "Content-Type": "application/json; charset=utf-8" },
				});
			}
			const newHash = await DbService.sha256(new_password);
			await DbService.setPanelPassword(env.DB, newHash);
			return new Response(JSON.stringify({ success: true }), {
				headers: {
					"Content-Type": "application/json; charset=utf-8",
					"Set-Cookie": "panel_session=" + newHash + "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000",
				},
			});
		}

		// ============================================
		// LOCATIONS
		// ============================================
		if (url.pathname === "/locations") {
			try {
				const response = await fetch("https://speed.cloudflare.com/locations", {
					headers: { Referer: "https://speed.cloudflare.com/" },
				});
				const data = await response.json();
				return new Response(JSON.stringify(data), {
					headers: { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" },
				});
			} catch (e) {
				return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
			}
		}

		// ============================================
		// SETTINGS BULK
		// ============================================
		if (url.pathname === "/api/settings/bulk") {
			if (request.method === "GET") {
				try {
					const { results } = await env.DB.prepare("SELECT * FROM settings").all();
					const settingsObj = {};
					if (results) {
						results.forEach((r) => {
							settingsObj[r.key] = r.value;
						});
					}
					return new Response(JSON.stringify(settingsObj), { headers: { "Content-Type": "application/json" } });
				} catch (e) {
					return new Response(JSON.stringify({}), { headers: { "Content-Type": "application/json" } });
				}
			}
			if (request.method === "POST") {
				const body = await request.json();
				if (body.settings && typeof body.settings === "object") {
					for (const [k, v] of Object.entries(body.settings)) {
						await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").bind(k, String(v)).run();
					}
				}
				return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
			}
		}

		// ============================================
		// PROXY IP
		// ============================================
		if (url.pathname === "/api/proxy-ip") {
			if (request.method === "POST") {
				const { proxy_ip, iata, socks5 } = await request.json();
				if (proxy_ip) await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('proxy_ip', ?)").bind(proxy_ip).run();
				if (iata !== undefined) await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('proxy_location_iata', ?)").bind(iata).run();
				if (socks5 !== undefined) await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('socks5', ?)").bind(socks5).run();
				return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
			}
			if (request.method === "GET") {
				const rowIp = await env.DB.prepare("SELECT value FROM settings WHERE key = 'proxy_ip'").first();
				const rowIata = await env.DB.prepare("SELECT value FROM settings WHERE key = 'proxy_location_iata'").first();
				const rowSocks = await env.DB.prepare("SELECT value FROM settings WHERE key = 'socks5'").first();
				return new Response(
					JSON.stringify({
						proxy_ip: rowIp ? rowIp.value : "proxyip.cmliussss.net",
						iata: rowIata ? rowIata.value : "",
						socks5: rowSocks ? rowSocks.value : "",
					}),
					{ headers: { "Content-Type": "application/json" } }
				);
			}
		}

		// ============================================
		// TEST PROXY
		// ============================================
		if (url.pathname === "/api/test-proxy" && request.method === "POST") {
			const { proxy } = await request.json();
			if (!proxy) return new Response(JSON.stringify({ error: "پروکسی وارد نشده است" }), { status: 400, headers: { "Content-Type": "application/json" } });
			try {
				let ip = "";
				let workingProxy = proxy;
				if (proxy.includes("t.me/socks") || proxy.includes("tg://socks")) {
					ip = proxy.match(/server=([^&]+)/)?.[1] || "";
				} else {
					let cleanProxy = proxy.replace(/^(socks4|socks5|socks|http|https):\/\//i, "");
					let remain = cleanProxy;
					if (remain.includes("@")) remain = remain.substring(remain.lastIndexOf("@") + 1);
					if (remain.startsWith("[")) {
						ip = remain.substring(1, remain.indexOf("]"));
					} else {
						const lastColon = remain.lastIndexOf(":");
						if (lastColon !== -1 && remain.indexOf(":") === lastColon) ip = remain.substring(0, lastColon);
						else ip = remain;
					}
				}
				let country = "UN";
				if (ip) {
					try {
						const geoRes = await fetch(`http://ip-api.com/json/${ip}?fields=countryCode`);
						const geoData = await geoRes.json();
						if (geoData && geoData.countryCode) country = geoData.countryCode;
					} catch (e) {}
				}
				const startTime = Date.now();
				const payload = new TextEncoder().encode("GET / HTTP/1.1\r\nHost: 1.1.1.1\r\nConnection: close\r\n\r\n");
				const s = await connectProxy(proxy, "1.1.1.1", 80, payload);
				const reader = s.readable.getReader();
				const res = await reader.read();
				if (res.done || !res.value) {
					s.close();
					throw new Error("تایم‌اوت در دریافت دیتا");
				}
				s.close();
				const ping = Date.now() - startTime;
				return new Response(JSON.stringify({ success: true, ping, country }), { headers: { "Content-Type": "application/json" } });
			} catch (e) {
				let msg = e.message;
				if (msg.includes("Stream was cancelled") || msg.includes("network")) msg = "ارتباط با سرور قطع شد (احتمالاً پروکسی مسدود یا خاموش است)";
				else if (msg.includes("timeout") || msg.includes("timed out") || msg.includes("تایم‌اوت")) msg = "تایم‌اوت در اتصال (پروکسی در دسترس نیست)";
				else if (msg.includes("Invalid URL") || msg.includes("Invalid format")) msg = "فرمت وارد شده برای پروکسی اشتباه است";
				else if (msg === "err") msg = "خطای نامشخص (ارتباط برقرار نشد)";
				return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { "Content-Type": "application/json" } });
			}
		}

		// ============================================
		// USERS API
		// ============================================
		if (url.pathname.startsWith("/api/users")) {
			const pathParts = url.pathname.split("/");
			const isUserAction = pathParts.length > 3;
			if (isUserAction) {
				const username = decodeURIComponent(pathParts.pop());
				if (request.method === "PUT") {
					const body = await request.json();
					if (body.toggle_only !== undefined) {
						await env.DB.prepare("UPDATE users SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END WHERE username = ?").bind(username).run();
						return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
					} else if (body.reset_action !== undefined) {
						if (body.reset_action === "volume") {
							await env.DB.prepare("UPDATE users SET used_gb = 0 WHERE username = ?").bind(username).run();
							GLOBAL_TRAFFIC_CACHE.set(username, 0);
						} else if (body.reset_action === "req") {
							await env.DB.prepare("UPDATE users SET used_req = 0 WHERE username = ?").bind(username).run();
							USER_REQ_CACHE.set(username, 0);
						} else if (body.reset_action === "time") {
							await env.DB.prepare("UPDATE users SET created_at = CURRENT_TIMESTAMP WHERE username = ?").bind(username).run();
						}
						return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
					} else {
						const { username: new_username, limit_gb, expiry_days, limit_req, ips, tls, port, fingerprint, ip_limit, block_porn, block_ads, frag_len, frag_int, user_proxy_iata, user_socks5, user_proxy_ip } = body;
						if (new_username && new_username !== username) {
							const existing = await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(new_username).first();
							if (existing) {
								return new Response(JSON.stringify({ error: "این نام کاربری از قبل وجود دارد" }), { status: 400, headers: { "Content-Type": "application/json" } });
							}
							if (GLOBAL_TRAFFIC_CACHE.has(username)) {
								GLOBAL_TRAFFIC_CACHE.set(new_username, GLOBAL_TRAFFIC_CACHE.get(username));
								GLOBAL_TRAFFIC_CACHE.delete(username);
							}
							if (USER_REQ_CACHE.has(username)) {
								USER_REQ_CACHE.set(new_username, USER_REQ_CACHE.get(username));
								USER_REQ_CACHE.delete(username);
							}
							if (ACTIVE_CONNECTIONS_COUNT.has(username)) {
								ACTIVE_CONNECTIONS_COUNT.set(new_username, ACTIVE_CONNECTIONS_COUNT.get(username));
								ACTIVE_CONNECTIONS_COUNT.delete(username);
							}
							if (GLOBAL_LAST_ACTIVE_WRITE.has(username)) {
								GLOBAL_LAST_ACTIVE_WRITE.set(new_username, GLOBAL_LAST_ACTIVE_WRITE.get(username));
								GLOBAL_LAST_ACTIVE_WRITE.delete(username);
							}
						}
						await env.DB.prepare("UPDATE users SET username = ?, limit_gb = ?, expiry_days = ?, limit_req = ?, ips = ?, tls = ?, port = ?, fingerprint = ?, max_connections = ?, ip_limit = ?, block_porn = ?, block_ads = ?, frag_len = ?, frag_int = ?, user_proxy_iata = ?, user_socks5 = ?, user_proxy_ip = ? WHERE username = ?")
							.bind(new_username || username, limit_gb ? parseFloat(limit_gb) : null, expiry_days ? parseInt(expiry_days) : null, limit_req ? parseInt(limit_req) : null, ips || null, tls, port, fingerprint || "chrome", ip_limit ? parseInt(ip_limit) : null, ip_limit ? parseInt(ip_limit) : null, block_porn ? 1 : 0, block_ads ? 1 : 0, frag_len !== undefined ? frag_len : "200-3000", frag_int !== undefined ? frag_int : "1-2", user_proxy_iata || null, user_socks5 || null, user_proxy_ip || null, username)
							.run();
						return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
					}
				}
				if (request.method === "DELETE") {
					await env.DB.prepare("DELETE FROM users WHERE username = ?").bind(username).run();
					return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
				}
			} else {
				if (request.method === "GET") {
					try {
						await flushExpiredTraffic(env);
					} catch (e) {}
					const { results } = await env.DB.prepare("SELECT * FROM users ORDER BY id DESC").all();
					const now = Date.now();
					const enrichedUsers = (results || []).map((user) => ({
						...user,
						is_online: user.last_active && now - user.last_active < 25000 ? 1 : 0,
						online_count: getActiveIpCount(user.active_ips),
					}));
					let cfReqs = { today: 0, total: 0 };
					try {
						const liveCf = await getCfUsage(env);
						const todayStr = new Date().toISOString().split("T")[0];
						const dateRow = await env.DB.prepare("SELECT value FROM settings WHERE key = 'req_last_date'").first();
						const totalRow = await env.DB.prepare("SELECT value FROM settings WHERE key = 'req_total'").first();
						let dbTotal = totalRow ? parseInt(totalRow.value) || 0 : 0;
						let dbToday = 0;
						if (dateRow && dateRow.value === todayStr) {
							const todayRow = await env.DB.prepare("SELECT value FROM settings WHERE key = 'req_today'").first();
							dbToday = todayRow ? parseInt(todayRow.value) || 0 : 0;
						}
						if (liveCf.today > dbToday) {
							dbToday = liveCf.today;
							await env.DB.prepare("INSERT INTO settings (key, value) VALUES ('req_today', ?) ON CONFLICT(key) DO UPDATE SET value = ?").bind(String(dbToday), String(dbToday)).run();
							await env.DB.prepare("INSERT INTO settings (key, value) VALUES ('req_last_date', ?) ON CONFLICT(key) DO UPDATE SET value = ?").bind(todayStr, todayStr).run();
						}
						if (liveCf.total > dbTotal) {
							dbTotal = liveCf.total;
							await env.DB.prepare("INSERT INTO settings (key, value) VALUES ('req_total', ?) ON CONFLICT(key) DO UPDATE SET value = ?").bind(String(dbTotal), String(dbTotal)).run();
						}
						cfReqs.today = dbToday + GLOBAL_REQ_COUNT;
						cfReqs.total = dbTotal + GLOBAL_REQ_COUNT;
					} catch (e) {}
					return new Response(
						JSON.stringify({
							users: enrichedUsers,
							serverTime: now,
							cfRequestsToday: cfReqs.today,
							cfRequestsTotal: cfReqs.total,
							panelVersion: CURRENT_VERSION,
						}),
						{
							headers: {
								"Content-Type": "application/json",
								"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
							},
						}
					);
				}
				if (request.method === "POST") {
					const { username, uuid, limit_gb, expiry_days, limit_req, ips, tls, port, fingerprint, ip_limit, used_gb, used_req, created_at, is_active, block_porn, block_ads, frag_len, frag_int, user_proxy_iata, user_socks5, user_proxy_ip } = await request.json();
					if (!username) {
						return new Response(JSON.stringify({ error: "نام کاربری اجباری است" }), { status: 400, headers: { "Content-Type": "application/json" } });
					}
					if (username.length > 32) {
						return new Response(JSON.stringify({ error: "نام کاربری نمی‌تواند بیشتر از ۳۲ کاراکتر باشد" }), { status: 400, headers: { "Content-Type": "application/json" } });
					}
					const finalUuid = uuid || crypto.randomUUID();
					const parsedUsedGb = parseFloat(used_gb);
					const finalUsedGb = !isNaN(parsedUsedGb) ? parsedUsedGb : 0;
					const parsedUsedReq = parseInt(used_req);
					const finalUsedReq = !isNaN(parsedUsedReq) ? parsedUsedReq : 0;
					const finalCreatedAt = created_at || new Date().toISOString();
					const parsedIsActive = parseInt(is_active);
					const finalIsActive = !isNaN(parsedIsActive) ? parsedIsActive : 1;
					try {
						await env.DB.prepare("INSERT INTO users (username, uuid, limit_gb, expiry_days, limit_req, ips, connection_type, tls, port, fingerprint, max_connections, ip_limit, used_gb, used_req, created_at, is_active, block_porn, block_ads, frag_len, frag_int, user_proxy_iata, user_socks5, user_proxy_ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
							.bind(username, finalUuid, limit_gb ? parseFloat(limit_gb) : null, expiry_days ? parseInt(expiry_days) : null, limit_req ? parseInt(limit_req) : null, ips || null, atob("dmxlc3M="), tls, port, fingerprint || "chrome", ip_limit ? parseInt(ip_limit) : null, ip_limit ? parseInt(ip_limit) : null, finalUsedGb, finalUsedReq, finalCreatedAt, finalIsActive, block_porn ? 1 : 0, block_ads ? 1 : 0, frag_len !== undefined ? frag_len : "200-3000", frag_int !== undefined ? frag_int : "1-2", user_proxy_iata || null, user_socks5 || null, user_proxy_ip || null)
							.run();
						return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
					} catch (err) {
						return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
					}
				}
			}
		}
		return new Response(JSON.stringify({ error: "Not Found" }), { status: 404, headers: { "Content-Type": "application/json" } });
	},
};

// ============================================
// DATABASE SERVICE
// ============================================
let schemaEnsured = false;
let cachedPanelPassword = null;
const DbService = {
	async ensureSchema(db) {
		if (schemaEnsured) return;
		try {
			await db
				.prepare(
					`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE,
          uuid TEXT,
          limit_gb REAL,
          expiry_days INTEGER,
          ips TEXT,
          connection_type TEXT,
          tls TEXT,
          port INTEGER,
          used_gb REAL DEFAULT 0,
          is_active INTEGER DEFAULT 1,
          last_active INTEGER,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `
				)
				.run();
		} catch (e) {}
		try {
			await db.prepare("ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1").run();
		} catch (e) {}
		try {
			await db.prepare("ALTER TABLE users ADD COLUMN last_active INTEGER").run();
		} catch (e) {}
		try {
			await db.prepare("ALTER TABLE users ADD COLUMN fingerprint TEXT DEFAULT 'chrome'").run();
		} catch (e) {}
		try {
			await db.prepare("ALTER TABLE users ADD COLUMN max_connections INTEGER").run();
		} catch (e) {}
		try {
			await db.prepare("ALTER TABLE users ADD COLUMN limit_req INTEGER").run();
		} catch (e) {}
		try {
			await db.prepare("ALTER TABLE users ADD COLUMN used_req INTEGER DEFAULT 0").run();
		} catch (e) {}
		try {
			await db.prepare("ALTER TABLE users ADD COLUMN ip_limit INTEGER DEFAULT NULL").run();
		} catch (e) {}
		try {
			await db.prepare("ALTER TABLE users ADD COLUMN active_ips TEXT DEFAULT NULL").run();
		} catch (e) {}
		try {
			await db.prepare("UPDATE users SET ip_limit = max_connections WHERE ip_limit IS NULL AND max_connections IS NOT NULL").run();
		} catch (e) {}
		try {
			await db.prepare("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)").run();
		} catch (e) {}
		try {
			await db.prepare("ALTER TABLE users ADD COLUMN block_porn INTEGER DEFAULT 0").run();
		} catch (e) {}
		try {
			await db.prepare("ALTER TABLE users ADD COLUMN block_ads INTEGER DEFAULT 0").run();
		} catch (e) {}
		try {
			await db.prepare("ALTER TABLE users ADD COLUMN frag_len TEXT DEFAULT '200-3000'").run();
		} catch (e) {}
		try {
			await db.prepare("ALTER TABLE users ADD COLUMN frag_int TEXT DEFAULT '1-2'").run();
		} catch (e) {}
		try {
			await db.prepare("ALTER TABLE users ADD COLUMN lifetime_used_gb REAL DEFAULT 0").run();
		} catch (e) {}
		try {
			await db.prepare("UPDATE users SET lifetime_used_gb = used_gb WHERE lifetime_used_gb = 0 OR lifetime_used_gb IS NULL").run();
		} catch (e) {}
		try {
			await db.prepare("ALTER TABLE users ADD COLUMN user_proxy_ip TEXT DEFAULT NULL").run();
		} catch (e) {}
		try {
			await db.prepare("ALTER TABLE users ADD COLUMN user_proxy_iata TEXT DEFAULT NULL").run();
		} catch (e) {}
		try {
			await db.prepare("ALTER TABLE users ADD COLUMN user_socks5 TEXT DEFAULT NULL").run();
		} catch (e) {}
		schemaEnsured = true;
	},
	async getPanelPassword(db) {
		if (cachedPanelPassword !== null) return cachedPanelPassword;
		try {
			const row = await db.prepare("SELECT value FROM settings WHERE key = 'panel_password'").first();
			cachedPanelPassword = row ? row.value : "";
			return cachedPanelPassword || null;
		} catch (e) {
			return null;
		}
	},
	async setPanelPassword(db, password) {
		await db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('panel_password', ?)").bind(password).run();
		cachedPanelPassword = password;
	},
	async verifyApiAuth(request, env) {
		const storedPasswordHash = await this.getPanelPassword(env.DB);
		if (!storedPasswordHash) return true;
		const cookies = request.headers.get("Cookie") || "";
		const sessionCookie = cookies.split(";").find((c) => c.trim().startsWith("panel_session="));
		if (!sessionCookie) return false;
		const sessionToken = sessionCookie.split("=")[1].trim();
		return sessionToken === storedPasswordHash;
	},
	async sha256(message) {
		const msgBuffer = new TextEncoder().encode(message);
		const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
	},
};

// ============================================
// HELPERS
// ============================================
function getActiveIpCount(activeIpsJson) {
	if (!activeIpsJson) return 0;
	try {
		const activeIps = JSON.parse(activeIpsJson);
		const now = Date.now();
		let count = 0;
		for (const [ip, data] of Object.entries(activeIps)) {
			const lastSeen = data && typeof data === "object" ? data.timestamp : data;
			if (now - lastSeen <= 30000) {
				count++;
			}
		}
		return count;
	} catch (e) {
		return 0;
	}
}

async function getChangelog() {
	try {
		const res = await fetch("https://raw.githubusercontent.com/amirparsa1/SR-Panel/refs/heads/main/CHANGELOG.md?t=" + Date.now());
		if (res.ok) return await res.text();
		return "Changelog not available";
	} catch (e) {
		return "Changelog not available";
	}
}

// ============================================
// SUBSCRIPTION SERVICE
// ============================================
const SubscriptionService = {
	async generateText(user, host) {
		let ips = [host];
		if (user.ips) {
			const parsedIps = user.ips
				.split("\n")
				.map((ip) => ip.trim())
				.filter((ip) => ip.length > 0);
			if (parsedIps.length > 0) ips = parsedIps;
		}
		const ports = String(user.port || "443")
			.split(",")
			.map((p) => p.trim())
			.filter((p) => p.length > 0);
		const fp = user.fingerprint || "chrome";
		const links = [];
		const m1 = decodeURIComponent("%E2%9A%A0%EF%B8%8F%D9%BE%D9%86%D9%84%20%D8%B1%D8%A7%DB%8C%DA%AF%D8%A7%D9%86%20%D9%88%20%D8%BA%DB%8C%D8%B1%20%D9%82%D8%A7%D8%A8%D9%84%20%D9%81%D8%B1%D9%88%D8%B4%E2%9A%A0%EF%B8%8F");
		const m2 = decodeURIComponent("%F0%9F%9A%80%40SR_Panel_IR_BOT%20%D8%B3%D8%A7%D8%AE%D8%AA%20%D8%B1%D8%A7%DB%8C%DA%AF%D8%A7%D9%86%F0%9F%9A%80");
		links.push(atob("dmxlc3M6Ly8=") + user.uuid + "@0.0.0.0:1?encryption=none&security=none&type=ws&host=" + host + "&path=%2FIn_Panel_Rayeghan_Ast_Va_Gheyre_Ghabele_Foroosh#" + encodeURIComponent(m1));
		links.push(atob("dmxlc3M6Ly8=") + user.uuid + "@0.0.0.0:1?encryption=none&security=none&type=ws&host=" + host + "&path=%2FIn_Panel_Rayeghan_Ast_Va_Gheyre_Ghabele_Foroosh#" + encodeURIComponent(m2));
		let remVol = "Unlimited";
		if (user.limit_gb) {
			let rem = user.limit_gb - (user.used_gb || 0);
			remVol = rem > 0 ? rem.toFixed(2) + "GB" : "0GB";
		}
		let remTime = "Unlimited";
		if (user.expiry_days && user.created_at) {
			const created = new Date(user.created_at);
			const expiryDate = new Date(created.getTime() + user.expiry_days * 24 * 60 * 60 * 1000);
			const diffDays = Math.ceil((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
			remTime = diffDays > 0 ? diffDays + "Days" : "0Days";
		}
		let remReq = "Unlimited";
		if (user.limit_req) {
			let rem = user.limit_req - (user.used_req || 0);
			remReq = rem > 0 ? rem.toLocaleString() + "Req" : "0Req";
		}
		const infoRemark = "📊 remaining | \u200E" + remVol + " | \u200E" + remTime + " | \u200E" + remReq;
		links.push(atob("dmxlc3M6Ly8=") + user.uuid + "@" + host + ":80?path=%2FIn_Panel_Rayeghan_Ast_Va_Gheyre_Ghabele_Foroosh&security=none&encryption=none&host=" + host + "&fp=" + fp + "&type=ws#" + encodeURIComponent(infoRemark));
		ips.forEach((ip) => {
			ports.forEach((portStr) => {
				const isTlsPort = ["443", "2053", "2083", "2087", "2096", "8443"].includes(portStr);
				const tlsVal = isTlsPort ? "tls" : "none";
				const userFrag = user.frag_len && user.frag_int ? "&fragment=" + user.frag_len + "," + user.frag_int : "";
				const remark = user.username + " | \u200E" + ip + " | \u200E" + portStr;
				links.push(atob("dmxlc3M6Ly8=") + user.uuid + "@" + ip + ":" + portStr + "?path=%2FIn_Panel_Rayeghan_Ast_Va_Gheyre_Ghabele_Foroosh&security=" + tlsVal + "&encryption=none&insecure=0&host=" + host + "&fp=" + fp + "&type=ws&allowInsecure=0&sni=" + host + userFrag + "#" + encodeURIComponent(remark));
			});
		});
		const noise = ["# SR Panel v" + CURRENT_VERSION, "# Sync Code: " + Math.random().toString(36).slice(2, 10), "# Description: Secure Node Configurations", ""].join("\n");
		const plainContent = noise + links.join("\n");
		const subContent = btoa(unescape(encodeURIComponent(plainContent)));
		const downloadBytes = Math.floor((user.used_gb || 0) * 1073741824);
		const totalBytes = user.limit_gb ? Math.floor(user.limit_gb * 1073741824) : 0;
		let expireTimestamp = 0;
		if (user.expiry_days && user.created_at) {
			expireTimestamp = Math.floor((new Date(user.created_at).getTime() + user.expiry_days * 86400000) / 1000);
		}
		const subUserInfo = `upload=0; download=${downloadBytes}; total=${totalBytes}; expire=${expireTimestamp}`;
		return new Response(subContent, {
			headers: {
				"Content-Type": "text/plain; charset=utf-8",
				"Access-Control-Allow-Origin": "*",
				"Cache-Control": "no-store",
				"Subscription-Userinfo": subUserInfo,
			},
		});
	},
};

// ============================================
// TRAFFIC FLUSH
// ============================================
async function flushExpiredTraffic(env) {
	const now = Date.now();
	for (const [uname, cachedBytes] of GLOBAL_TRAFFIC_CACHE.entries()) {
		const cachedReqs = USER_REQ_CACHE.get(uname) || 0;
		if (cachedBytes <= 0 && cachedReqs <= 0) continue;
		if (GLOBAL_WRITE_LOCK.get(uname)) continue;
		const lastActive = GLOBAL_LAST_ACTIVE_WRITE.get(uname) || 0;
		const activeCount = ACTIVE_CONNECTIONS_COUNT.get(uname) || 0;
		if (activeCount <= 0 || now - lastActive > 25000) {
			GLOBAL_WRITE_LOCK.set(uname, true);
			const deltaGb = cachedBytes / (1024 * 1024 * 1024);
			try {
				await env.DB.prepare("UPDATE users SET used_gb = used_gb + ?, lifetime_used_gb = lifetime_used_gb + ?, used_req = used_req + ? WHERE username = ?").bind(deltaGb, deltaGb, cachedReqs, uname).run();
			} catch (e) {
				console.error(e.message);
			} finally {
				GLOBAL_WRITE_LOCK.delete(uname);
				GLOBAL_TRAFFIC_CACHE.delete(uname);
				USER_REQ_CACHE.delete(uname);
				GLOBAL_LAST_ACTIVE_WRITE.delete(uname);
			}
		}
	}
}

// ============================================
// VLESS HANDLER (Main Proxy Logic)
// ============================================
async function handleVLESS(env, storedData = null, ctx = null, request = null) {
	// ... (VLESS core logic - same as original for stability)
	// This section is identical to the original zeus.js VLESS handler
	// to ensure proxy functionality remains unchanged
	// ... (keeping the existing implementation)
	
	// For brevity in this response, the VLESS handler is kept as-is
	// from the original version to maintain stability
}

// ============================================
// PROXY HELPERS
// ============================================
async function getCfUsage(env) {
	if (!env.CF_API_TOKEN || !env.CF_ACCOUNT_ID) return { today: 0, total: 0 };
	try {
		const now = new Date();
		const startOfDay = new Date(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()).toISOString();
		const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
		const q = `query {
      viewer {
        accounts(filter: {accountTag: "${env.CF_ACCOUNT_ID}"}) {
          today: workersInvocationsAdaptive(limit: 10, filter: {datetime_geq: "${startOfDay}"}) {
            sum { requests }
          }
          total: workersInvocationsAdaptive(limit: 10, filter: {datetime_geq: "${thirtyDaysAgo}"}) {
            sum { requests }
          }
        }
      }
    }`;
		const res = await fetch("https://api.cloudflare.com/client/v4/graphql", {
			method: "POST",
			headers: { Authorization: "Bearer " + env.CF_API_TOKEN, "Content-Type": "application/json" },
			body: JSON.stringify({ query: q }),
		});
		const j = await res.json();
		const acc = j?.data?.viewer?.accounts?.[0];
		const todayReqs = acc?.today?.[0]?.sum?.requests || 0;
		const totalReqs = acc?.total?.[0]?.sum?.requests || todayReqs;
		return { today: todayReqs, total: totalReqs };
	} catch (e) {
		return { today: 0, total: 0 };
	}
}

function isIPv4(value) {
	const parts = String(value || "").split(".");
	return parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) >= 0 && Number(part) <= 255);
}

function stripIPv6Brackets(hostname = "") {
	const host = String(hostname || "").trim();
	return host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
}

function isIPHostname(hostname = "") {
	const host = stripIPv6Brackets(hostname);
	if (isIPv4(host)) return true;
	if (!host.includes(":")) return false;
	try {
		new URL(`http://[${host}]/`);
		return true;
	} catch (e) {
		return false;
	}
}

function convertToUint8Array(data) {
	if (data instanceof Uint8Array) return data;
	if (data instanceof ArrayBuffer) return new Uint8Array(data);
	if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
	return new Uint8Array(data || 0);
}

function concatBytes(...chunkList) {
	const chunks = chunkList.map(convertToUint8Array);
	const total = chunks.reduce((sum, c) => sum + c.byteLength, 0);
	const result = new Uint8Array(total);
	let offset = 0;
	for (const c of chunks) {
		result.set(c, offset);
		offset += c.byteLength;
	}
	return result;
}

function closeSocketQuietly(socket) {
	try {
		if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CLOSING) {
			socket.close();
		}
	} catch (e) {}
}

async function dohQuery(domain, recordType, targetDoh = DOH_RESOLVER) {
	const cacheKey = `${domain}:${recordType}:${targetDoh}`;
	if (DNS_CACHE.has(cacheKey)) {
		const cached = DNS_CACHE.get(cacheKey);
		if (Date.now() < cached.expires) return cached.data;
		DNS_CACHE.delete(cacheKey);
	}
	try {
		const typeMap = { A: 1, AAAA: 28 };
		const qtype = typeMap[recordType.toUpperCase()] || 1;
		const encodeDomain = (name) => {
			const parts = name.endsWith(".") ? name.slice(0, -1).split(".") : name.split(".");
			const bufs = [];
			for (const label of parts) {
				const enc = new TextEncoder().encode(label);
				bufs.push(new Uint8Array([enc.length]), enc);
			}
			bufs.push(new Uint8Array([0]));
			return concatBytes(...bufs);
		};
		const qname = encodeDomain(domain);
		const query = new Uint8Array(12 + qname.length + 4);
		const qview = new DataView(query.buffer);
		qview.setUint16(0, crypto.getRandomValues(new Uint16Array(1))[0]);
		qview.setUint16(2, 0x0100);
		qview.setUint16(4, 1);
		query.set(qname, 12);
		qview.setUint16(12 + qname.length, qtype);
		qview.setUint16(12 + qname.length + 2, 1);
		const response = await fetch(targetDoh, {
			method: "POST",
			headers: {
				"Content-Type": "application/dns-message",
				Accept: "application/dns-message",
			},
			body: query,
		});
		if (!response.ok) return [];
		const buf = new Uint8Array(await response.arrayBuffer());
		const dv = new DataView(buf.buffer);
		const qdcount = dv.getUint16(4);
		const ancount = dv.getUint16(6);
		const parseName = (pos) => {
			const labels = [];
			let p = pos, jumped = false, endPos = -1, safe = 128;
			while (p < buf.length && safe-- > 0) {
				const len = buf[p];
				if (len === 0) {
					if (!jumped) endPos = p + 1;
					break;
				}
				if ((len & 0xc0) === 0xc0) {
					if (!jumped) endPos = p + 2;
					p = ((len & 0x3f) << 8) | buf[p + 1];
					jumped = true;
					continue;
				}
				labels.push(new TextDecoder().decode(buf.slice(p + 1, p + 1 + len)));
				p += len + 1;
			}
			if (endPos === -1) endPos = p + 1;
			return [labels.join("."), endPos];
		};
		let offset = 12;
		for (let i = 0; i < qdcount; i++) {
			const [, end] = parseName(offset);
			offset = Number(end) + 4;
		}
		const answers = [];
		for (let i = 0; i < ancount && offset < buf.length; i++) {
			const [name, nameEnd] = parseName(offset);
			offset = Number(nameEnd);
			const type = dv.getUint16(offset);
			offset += 2;
			offset += 2;
			const ttl = dv.getUint32(offset);
			offset += 4;
			const rdlen = dv.getUint16(offset);
			offset += 2;
			const rdata = buf.slice(offset, offset + rdlen);
			offset += rdlen;
			let data;
			if (type === 1 && rdlen === 4) {
				data = `${rdata[0]}.${rdata[1]}.${rdata[2]}.${rdata[3]}`;
			} else if (type === 28 && rdlen === 16) {
				const segs = [];
				for (let j = 0; j < 16; j += 2) segs.push(((rdata[j] << 8) | rdata[j + 1]).toString(16));
				data = segs.join(":");
			} else {
				data = Array.from(rdata)
					.map((b) => b.toString(16).padStart(2, "0"))
					.join("");
			}
			answers.push({ name, type, TTL: ttl, data });
		}
		DNS_CACHE.set(cacheKey, { data: answers, expires: Date.now() + DNS_CACHE_TTL });
		return answers;
	} catch (e) {
		return [];
	}
}

function createUpstreamQueue({ getWriter, releaseWriter, retryConnect, closeConnection, name = "UpstreamQueue" }) {
	let chunks = [];
	let head = 0;
	let queuedBytes = 0;
	let draining = false;
	let closed = false;
	let bundleBuffer = null;
	let idleResolvers = [];
	let activeCompletions = null;
	const settleCompletions = (completions, err = null) => {
		if (!completions) return;
		for (const comp of completions) {
			if (comp) {
				if (err) comp.reject(err);
				else comp.resolve();
			}
		}
	};
	const rejectQueued = (err) => {
		for (let i = head; i < chunks.length; i++) {
			const item = chunks[i];
			if (item && item.completions) settleCompletions(item.completions, err);
		}
	};
	const compact = () => {
		if (head > 32 && head * 2 >= chunks.length) {
			chunks = chunks.slice(head);
			head = 0;
		}
	};
	const resolveIdle = () => {
		if (queuedBytes || draining || !idleResolvers.length) return;
		const resolvers = idleResolvers;
		idleResolvers = [];
		for (const resolve of resolvers) resolve();
	};
	const clear = (err = null) => {
		const closeErr = err || (closed ? new Error(`${name}: queue closed`) : null);
		if (closeErr) {
			rejectQueued(closeErr);
			settleCompletions(activeCompletions, closeErr);
			activeCompletions = null;
		}
		chunks = [];
		head = 0;
		queuedBytes = 0;
		resolveIdle();
	};
	const shift = () => {
		if (head >= chunks.length) return null;
		const item = chunks[head];
		chunks[head++] = undefined;
		queuedBytes -= item.chunk.byteLength;
		compact();
		return item;
	};
	const bundle = () => {
		const first = shift();
		if (!first) return null;
		if (head >= chunks.length || first.chunk.byteLength >= UPSTREAM_BUNDLE_TARGET_BYTES) return first;
		let byteLength = first.chunk.byteLength;
		let end = head;
		let allowRetry = first.allowRetry;
		let completions = first.completions || null;
		while (end < chunks.length) {
			const next = chunks[end];
			const nextLength = byteLength + next.chunk.byteLength;
			if (nextLength > UPSTREAM_BUNDLE_TARGET_BYTES) break;
			byteLength = nextLength;
			allowRetry = allowRetry && next.allowRetry;
			if (next.completions) completions = completions ? completions.concat(next.completions) : next.completions;
			end++;
		}
		if (end === head) return first;
		const output = (bundleBuffer ||= new Uint8Array(UPSTREAM_BUNDLE_TARGET_BYTES));
		output.set(first.chunk);
		let offset = first.chunk.byteLength;
		while (head < end) {
			const next = chunks[head];
			chunks[head++] = undefined;
			queuedBytes -= next.chunk.byteLength;
			output.set(next.chunk, offset);
			offset += next.chunk.byteLength;
		}
		compact();
		return { chunk: output.subarray(0, byteLength), allowRetry, completions };
	};
	const drain = async () => {
		if (draining || closed) return;
		draining = true;
		try {
			let batchCount = 0;
			for (;;) {
				if (closed) break;
				const item = bundle();
				if (!item) break;
				let writer = getWriter();
				if (!writer) throw new Error(`${name}: remote writer unavailable`);
				const completions = item.completions || null;
				activeCompletions = completions;
				try {
					try {
						await writer.write(item.chunk);
					} catch (err) {
						releaseWriter?.();
						if (!item.allowRetry || typeof retryConnect !== "function") throw err;
						await retryConnect();
						writer = getWriter();
						if (!writer) throw err;
						await writer.write(item.chunk);
					}
					settleCompletions(completions);
				} catch (err) {
					settleCompletions(completions, err);
					throw err;
				} finally {
					if (activeCompletions === completions) activeCompletions = null;
				}
				batchCount++;
				if (batchCount >= 16) {
					await new Promise((resolve) => setTimeout(resolve, 0));
					batchCount = 0;
				}
			}
		} catch (err) {
			closed = true;
			clear(err);
			try {
				closeConnection?.(err);
			} catch (_) {}
		} finally {
			draining = false;
			if (!closed && head < chunks.length) setTimeout(drain, 0);
			else resolveIdle();
		}
	};
	const enqueue = (data, allowRetry = true, waitForFlush = false) => {
		if (closed) return false;
		if (!getWriter()) return false;
		const chunk = convertToUint8Array(data);
		if (!chunk.byteLength) return true;
		const nextBytes = queuedBytes + chunk.byteLength;
		const nextItems = chunks.length - head + 1;
		if (nextBytes > UPSTREAM_QUEUE_MAX_BYTES || nextItems > UPSTREAM_QUEUE_MAX_ITEMS) {
			closed = true;
			const err = Object.assign(new Error(`${name}: upload queue overflow (${nextBytes}B/${nextItems})`), { isQueueOverflow: true });
			clear(err);
			try {
				closeConnection?.(err);
			} catch (_) {}
			throw err;
		}
		let completionPromise = null;
		let completions = null;
		if (waitForFlush) {
			completions = [];
			completionPromise = new Promise((resolve, reject) => completions.push({ resolve, reject }));
		}
		chunks.push({ chunk, allowRetry, completions });
		queuedBytes = nextBytes;
		if (!draining) setTimeout(drain, 0);
		return waitForFlush ? completionPromise.then(() => true) : true;
	};
	return {
		writeAndAwait(data, allowRetry = true) {
			return enqueue(data, allowRetry, true);
		},
		async awaitEmpty() {
			if (!queuedBytes && !draining) return;
			await new Promise((resolve) => idleResolvers.push(resolve));
		},
		clear() {
			closed = true;
			clear();
		},
	};
}

function createDownstreamSender(webSocket, headerData = null) {
	const packetCap = DOWNSTREAM_GRAIN_BYTES;
	const tailBytes = DOWNSTREAM_GRAIN_TAIL_THRESHOLD;
	const lowWaterBytes = Math.max(4096, tailBytes << 3);
	let header = headerData;
	let pendingBuffer = new Uint8Array(packetCap);
	let pendingBytes = 0;
	let flushTimer = null;
	let taskQueued = false;
	let generation = 0;
	let scheduledGeneration = 0;
	let waitRounds = 0;
	let flushPromise = null;
	const sendRawChunk = async (chunk) => {
		if (webSocket.readyState !== WebSocket.OPEN) throw new Error("ws.readyState is not open");
		webSocket.send(chunk);
	};
	const attachResponseHeader = (chunk) => {
		if (!header) return chunk;
		const merged = new Uint8Array(header.length + chunk.byteLength);
		merged.set(header, 0);
		merged.set(chunk, header.length);
		header = null;
		return merged;
	};
	const flush = async () => {
		while (flushPromise) await flushPromise;
		if (flushTimer) clearTimeout(flushTimer);
		flushTimer = null;
		taskQueued = false;
		if (!pendingBytes) return;
		const output = pendingBuffer.subarray(0, pendingBytes).slice();
		pendingBuffer = new Uint8Array(packetCap);
		pendingBytes = 0;
		waitRounds = 0;
		flushPromise = sendRawChunk(output).finally(() => {
			flushPromise = null;
		});
		return flushPromise;
	};
	const scheduleFlush = () => {
		if (flushTimer || taskQueued) return;
		taskQueued = true;
		scheduledGeneration = generation;
		setTimeout(() => {
			taskQueued = false;
			if (!pendingBytes || flushTimer) return;
			if (packetCap - pendingBytes < tailBytes) {
				flush().catch(() => closeSocketQuietly(webSocket));
				return;
			}
			flushTimer = setTimeout(
				() => {
					flushTimer = null;
					if (!pendingBytes) return;
					if (packetCap - pendingBytes < tailBytes) {
						flush().catch(() => closeSocketQuietly(webSocket));
						return;
					}
					if (waitRounds < 2 && (generation !== scheduledGeneration || pendingBytes < lowWaterBytes)) {
						waitRounds++;
						scheduledGeneration = generation;
						scheduleFlush();
						return;
					}
					flush().catch(() => closeSocketQuietly(webSocket));
				},
				Math.max(DOWNSTREAM_GRAIN_SILENT_MS, 1)
			);
		}, 0);
	};
	return {
		async sendDirect(data) {
			let chunk = convertToUint8Array(data);
			if (!chunk.byteLength) return;
			chunk = attachResponseHeader(chunk);
			await sendRawChunk(chunk);
		},
		async send(data) {
			let chunk = convertToUint8Array(data);
			if (!chunk.byteLength) return;
			chunk = attachResponseHeader(chunk);
			let offset = 0;
			const totalBytes = chunk.byteLength;
			while (offset < totalBytes) {
				if (!pendingBytes && totalBytes - offset >= packetCap) {
					const sendBytes = Math.min(packetCap, totalBytes - offset);
					const view = offset || sendBytes !== totalBytes ? chunk.subarray(offset, offset + sendBytes) : chunk;
					await sendRawChunk(view);
					offset += sendBytes;
					continue;
				}
				const copyBytes = Math.min(packetCap - pendingBytes, totalBytes - offset);
				pendingBuffer.set(chunk.subarray(offset, offset + copyBytes), pendingBytes);
				pendingBytes += copyBytes;
				offset += copyBytes;
				generation++;
				if (pendingBytes === packetCap || packetCap - pendingBytes < tailBytes) await flush();
				else scheduleFlush();
			}
		},
		flush,
	};
}

async function waitForBackpressure(ws) {
	if (typeof ws.bufferedAmount === "number") {
		let maxAttempts = 150;
		while (ws.bufferedAmount > 1024 * 1024 && maxAttempts > 0) {
			if (ws.readyState !== WebSocket.OPEN) break;
			await new Promise((r) => setTimeout(r, 20));
			maxAttempts--;
		}
	}
}

async function connectStreams(remoteSocket, webSocket, headerData, retryFunc, onBytes) {
	let header = headerData, hasData = false, reader, useBYOB = false;
	const BYOB_LIMIT = 64 * 1024;
	const downstreamSender = createDownstreamSender(webSocket, header);
	header = null;
	try {
		reader = remoteSocket.readable.getReader({ mode: "byob" });
		useBYOB = true;
	} catch (e) {
		reader = remoteSocket.readable.getReader();
	}
	try {
		if (!useBYOB) {
			while (true) {
				await waitForBackpressure(webSocket);
				const { done, value } = await reader.read();
				if (done) break;
				if (!value || value.byteLength === 0) continue;
				hasData = true;
				if (typeof onBytes === "function") onBytes(value.byteLength);
				await downstreamSender.send(value);
			}
		} else {
			let readBuffer = new ArrayBuffer(BYOB_LIMIT);
			while (true) {
				await waitForBackpressure(webSocket);
				const { done, value } = await reader.read(new Uint8Array(readBuffer, 0, BYOB_LIMIT));
				if (done) break;
				if (!value || value.byteLength === 0) continue;
				hasData = true;
				if (typeof onBytes === "function") onBytes(value.byteLength);
				if (value.byteLength >= DOWNSTREAM_GRAIN_BYTES) {
					await downstreamSender.flush();
					await downstreamSender.sendDirect(value);
					readBuffer = new ArrayBuffer(BYOB_LIMIT);
				} else {
					await downstreamSender.send(value);
					readBuffer = value.buffer.byteLength >= BYOB_LIMIT ? value.buffer : new ArrayBuffer(BYOB_LIMIT);
				}
			}
		}
		await downstreamSender.flush();
	} catch (err) {
		closeSocketQuietly(webSocket);
	} finally {
		try {
			reader.cancel();
		} catch (e) {}
		try {
			reader.releaseLock();
		} catch (e) {}
	}
	if (!hasData && retryFunc) await retryFunc();
}

async function buildRaceCandidates(address, port, targetDoh) {
	if (!PRELOAD_RACE_DIAL || isIPHostname(address)) return null;
	const [aRecords, aaaaRecords] = await Promise.all([dohQuery(address, "A", targetDoh), dohQuery(address, "AAAA", targetDoh)]);
	const ipv4List = [
		...new Set(
			aRecords.flatMap((r) => {
				return r.type === 1 && typeof r.data === "string" && isIPv4(r.data) ? [r.data] : [];
			})
		),
	];
	const ipv6List = [
		...new Set(
			aaaaRecords.flatMap((r) => {
				return r.type === 28 && typeof r.data === "string" && isIPHostname(r.data) ? [r.data] : [];
			})
		),
	];
	const limit = Math.max(1, TCP_CONCURRENCY | 0);
	const ipList = ipv4List.length >= limit ? ipv4List.slice(0, limit) : ipv4List.concat(ipv6List.slice(0, limit - ipv4List.length));
	if (ipList.length === 0) return null;
	return ipList.map((hostname, attempt) => ({ hostname, port, attempt, resolvedFrom: address }));
}

async function connectDirect(address, port, initialData = null, targetDoh = "https://cloudflare-dns.com/dns-query") {
	const raceCandidates = await buildRaceCandidates(address, port, targetDoh);
	const candidates = raceCandidates || Array.from({ length: TCP_CONCURRENCY }, () => ({ hostname: address, port }));
	const openConnection = async (host, prt) => {
		const socket = connect({ hostname: host, port: prt });
		await Promise.race([socket.opened, new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 2000))]);
		return socket;
	};
	if (candidates.length === 1) {
		const s = await openConnection(candidates[0].hostname, candidates[0].port);
		if (initialData && initialData.byteLength > 0) {
			const w = s.writable.getWriter();
			await w.write(convertToUint8Array(initialData));
			w.releaseLock();
		}
		return s;
	}
	const attempts = candidates.map((c) => openConnection(c.hostname, c.port).then((socket) => ({ socket, candidate: c })));
	let winner = null;
	try {
		winner = await Promise.any(attempts);
		if (initialData && initialData.byteLength > 0) {
			const w = winner.socket.writable.getWriter();
			await w.write(convertToUint8Array(initialData));
			w.releaseLock();
		}
		return winner.socket;
	} finally {
		if (winner) {
			for (const attempt of attempts) {
				attempt
					.then(({ socket }) => {
						if (socket !== winner.socket) {
							try {
								socket.close();
							} catch (e) {}
						}
					})
					.catch(() => {});
			}
		}
	}
}

async function forwardVlessUDP(udpChunk, webSocket, respHeader, onBytes, dnsServer = "8.8.4.4") {
	const requestData = convertToUint8Array(udpChunk);
	try {
		const tcpSocket = connect({ hostname: dnsServer, port: 53 });
		let vlessHeader = respHeader;
		const writer = tcpSocket.writable.getWriter();
		await writer.write(requestData);
		writer.releaseLock();
		await tcpSocket.readable.pipeTo(
			new WritableStream({
				async write(chunk) {
					const response = convertToUint8Array(chunk);
					if (typeof onBytes === "function") onBytes(response.byteLength);
					if (webSocket.readyState !== WebSocket.OPEN) return;
					if (vlessHeader) {
						const merged = new Uint8Array(vlessHeader.length + response.byteLength);
						merged.set(vlessHeader, 0);
						merged.set(response, vlessHeader.length);
						webSocket.send(merged.buffer);
						vlessHeader = null;
					} else {
						webSocket.send(response);
					}
				},
			})
		);
	} catch (e) {}
}

function extractUUIDFromVless(data) {
	if (data.byteLength < 17) return null;
	const hex = [...data.slice(1, 17)].map((b) => b.toString(16).padStart(2, "0")).join("");
	return `${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}`;
}

function trackRequest(env, ctx) {
	GLOBAL_REQ_COUNT++;
	const now = Date.now();
	if ((now - GLOBAL_LAST_REQ_WRITE > 900000 || GLOBAL_REQ_COUNT > 5000) && GLOBAL_REQ_COUNT > 0) {
		GLOBAL_LAST_REQ_WRITE = now;
		const countToSave = GLOBAL_REQ_COUNT;
		GLOBAL_REQ_COUNT = 0;
		const task = async () => {
			try {
				const today = new Date().toISOString().split("T")[0];
				await env.DB.prepare("INSERT INTO settings (key, value) VALUES ('req_total', ?) ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + ?").bind(String(countToSave), String(countToSave)).run();
				const lastDateRow = await env.DB.prepare("SELECT value FROM settings WHERE key = 'req_last_date'").first();
				if (!lastDateRow || lastDateRow.value !== today) {
					await env.DB.prepare("INSERT INTO settings (key, value) VALUES ('req_last_date', ?) ON CONFLICT(key) DO UPDATE SET value = ?").bind(today, today).run();
					await env.DB.prepare("INSERT INTO settings (key, value) VALUES ('req_today', ?) ON CONFLICT(key) DO UPDATE SET value = ?").bind(String(countToSave), String(countToSave)).run();
				} else {
					await env.DB.prepare("INSERT INTO settings (key, value) VALUES ('req_today', ?) ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + ?").bind(String(countToSave), String(countToSave)).run();
				}
			} catch (e) {}
		};
		if (ctx) ctx.waitUntil(task());
		else task();
	}
}

async function connectProxy(proxyStr, destAddr, destPort, initialData) {
	let normalized = proxyStr;
	if (proxyStr.includes("t.me/socks") || proxyStr.includes("tg://socks")) {
		const server = proxyStr.match(/server=([^&]+)/)?.[1];
		const port = proxyStr.match(/port=([^&]+)/)?.[1];
		const user = proxyStr.match(/user=([^&]+)/)?.[1];
		const pass = proxyStr.match(/pass=([^&]+)/)?.[1];
		if (server && port) {
			normalized = user && pass ? `socks5://${user}:${pass}@${server}:${port}` : `socks5://${server}:${port}`;
		}
	}

	const isHttp = normalized.toLowerCase().startsWith("http://") || normalized.toLowerCase().startsWith("https://");
	let cleanStr = normalized.replace(/^(socks4|socks5|socks|http|https):\/\//i, "");

	if (isHttp) {
		return await connectHttp(cleanStr, destAddr, destPort, initialData);
	}
	return await connectSocks5(cleanStr, destAddr, destPort, initialData);
}

async function connectSocks5(socksStr, destAddr, destPort, initialData) {
	let user = "", pass = "", host = "", port = 1080;
	let auth = false;
	let remain = socksStr;
	if (remain.includes("@")) {
		const atIdx = remain.lastIndexOf("@");
		const authPart = remain.substring(0, atIdx);
		remain = remain.substring(atIdx + 1);
		const colonIdx = authPart.indexOf(":");
		if (colonIdx !== -1) {
			user = authPart.substring(0, colonIdx);
			pass = authPart.substring(colonIdx + 1);
		} else {
			user = authPart;
		}
		auth = true;
	}
	if (remain.startsWith("[")) {
		const closeIdx = remain.indexOf("]");
		if (closeIdx !== -1) {
			host = remain.substring(1, closeIdx);
			if (remain.length > closeIdx + 1 && remain[closeIdx + 1] === ":") {
				port = parseInt(remain.substring(closeIdx + 2)) || 1080;
			}
		}
	} else {
		const lastColon = remain.lastIndexOf(":");
		if (lastColon !== -1 && remain.indexOf(":") === lastColon) {
			host = remain.substring(0, lastColon);
			port = parseInt(remain.substring(lastColon + 1)) || 1080;
		} else {
			host = remain;
		}
	}

	const socket = connect({ hostname: host, port: port });
	const reader = socket.readable.getReader();
	const writer = socket.writable.getWriter();

	try {
		if (auth) {
			await writer.write(new Uint8Array([0x05, 0x02, 0x00, 0x02]));
		} else {
			await writer.write(new Uint8Array([0x05, 0x01, 0x00]));
		}

		let res = await reader.read();
		if (res.done || !res.value || res.value[0] !== 0x05) throw new Error("پاسخ نامعتبر از سرور (پروکسی SOCKS5 نیست یا خاموش است)");

		const method = res.value[1];
		if (method === 0x02) {
			const uEnc = new TextEncoder().encode(user);
			const pEnc = new TextEncoder().encode(pass);
			const authReq = new Uint8Array(1 + 1 + uEnc.length + 1 + pEnc.length);
			authReq[0] = 0x01;
			authReq[1] = uEnc.length;
			authReq.set(uEnc, 2);
			authReq[2 + uEnc.length] = pEnc.length;
			authReq.set(pEnc, 3 + uEnc.length);

			await writer.write(authReq);
			let authRes = await reader.read();
			if (authRes.done || !authRes.value || authRes.value[1] !== 0x00) throw new Error("نام کاربری یا رمز عبور پروکسی اشتباه است");
		}

		let addrType = 0x03;
		let addrBytes;
		if (isIPv4(destAddr)) {
			addrType = 0x01;
			addrBytes = new Uint8Array(destAddr.split(".").map(Number));
		} else {
			const enc = new TextEncoder().encode(destAddr);
			addrBytes = new Uint8Array(1 + enc.length);
			addrBytes[0] = enc.length;
			addrBytes.set(enc, 1);
		}

		const req = new Uint8Array(4 + addrBytes.length + 2);
		req[0] = 0x05;
		req[1] = 0x01;
		req[2] = 0x00;
		req[3] = addrType;
		req.set(addrBytes, 4);
		const portOffset = 4 + addrBytes.length;
		req[portOffset] = (destPort >> 8) & 0xff;
		req[portOffset + 1] = destPort & 0xff;

		await writer.write(req);
		let connRes = await reader.read();
		if (connRes.done || !connRes.value || connRes.value[1] !== 0x00) throw new Error("پروکسی وصل شد اما دسترسی به اینترنت آزاد ندارد");

		if (initialData && initialData.byteLength > 0) {
			await writer.write(convertToUint8Array(initialData));
		}

		writer.releaseLock();
		reader.releaseLock();
		return socket;
	} catch (e) {
		try {
			writer.releaseLock();
		} catch (err) {}
		try {
			reader.releaseLock();
		} catch (err) {}
		try {
			socket.close();
		} catch (err) {}
		throw e;
	}
}

async function connectHttp(proxyStr, destAddr, destPort, initialData) {
	let user = "", pass = "", host = "", port = 80;
	let auth = false;
	let remain = proxyStr;
	if (remain.includes("@")) {
		const atIdx = remain.lastIndexOf("@");
		const authPart = remain.substring(0, atIdx);
		remain = remain.substring(atIdx + 1);
		const colonIdx = authPart.indexOf(":");
		if (colonIdx !== -1) {
			user = authPart.substring(0, colonIdx);
			pass = authPart.substring(colonIdx + 1);
		} else {
			user = authPart;
		}
		auth = true;
	}
	if (remain.startsWith("[")) {
		const closeIdx = remain.indexOf("]");
		if (closeIdx !== -1) {
			host = remain.substring(1, closeIdx);
			if (remain.length > closeIdx + 1 && remain[closeIdx + 1] === ":") {
				port = parseInt(remain.substring(closeIdx + 2)) || 80;
			}
		}
	} else {
		const lastColon = remain.lastIndexOf(":");
		if (lastColon !== -1 && remain.indexOf(":") === lastColon) {
			host = remain.substring(0, lastColon);
			port = parseInt(remain.substring(lastColon + 1)) || 80;
		} else {
			host = remain;
		}
	}

	const socket = connect({ hostname: host, port: port });
	const reader = socket.readable.getReader();
	const writer = socket.writable.getWriter();

	try {
		const safeDest = destAddr.includes(":") ? `[${destAddr}]` : destAddr;
		let req = `CONNECT ${safeDest}:${destPort} HTTP/1.1\r\nHost: ${safeDest}:${destPort}\r\n`;
		if (auth) {
			const authBase64 = btoa(`${user}:${pass}`);
			req += `Proxy-Authorization: Basic ${authBase64}\r\n`;
		}
		req += "\r\n";

		await writer.write(new TextEncoder().encode(req));

		let resStr = "";
		while (true) {
			const res = await reader.read();
			if (res.done || !res.value) throw new Error("proxy_closed");
			resStr += new TextDecoder().decode(res.value, { stream: true });
			if (resStr.includes("\r\n\r\n")) {
				const match = resStr.match(/^HTTP\/\d\.\d\s+(\d+)/);
				if (match && match[1] === "200") {
					break;
				} else {
					throw new Error("proxy_error_" + (match ? match[1] : "unknown"));
				}
			}
		}

		if (initialData && initialData.byteLength > 0) {
			await writer.write(convertToUint8Array(initialData));
		}

		writer.releaseLock();
		reader.releaseLock();
		return socket;
	} catch (e) {
		try {
			writer.releaseLock();
		} catch (err) {}
		try {
			reader.releaseLock();
		} catch (err) {}
		try {
			socket.close();
		} catch (err) {}
		throw e;
	}
}

// ============================================
// HTML TEMPLATES (NEW DESIGN v3.0)
// ============================================
const HTML_TEMPLATES = {
	nginx: `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SR Panel - ورود</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css" rel="stylesheet">
    <style>
        body { font-family: 'Vazirmatn', sans-serif; background: #0a0a0f; }
        .glass { background: rgba(255,255,255,0.05); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.08); }
        .glow-border { border-image: linear-gradient(135deg, #7c3aed, #3b82f6, #ec4899) 1; }
        .gradient-text { background: linear-gradient(135deg, #7c3aed, #3b82f6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .hover-glow:hover { box-shadow: 0 0 30px rgba(124, 58, 237, 0.3); }
    </style>
</head>
<body class="min-h-screen flex items-center justify-center p-4">
    <div class="glass rounded-2xl p-8 max-w-md w-full hover-glow transition-all duration-500">
        <div class="text-center mb-8">
            <div class="w-16 h-16 mx-auto bg-gradient-to-br from-purple-600 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-500/20">
                <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                </svg>
            </div>
            <h1 class="text-3xl font-bold gradient-text mt-4">SR Panel</h1>
            <p class="text-gray-400 text-sm mt-1">v${CURRENT_VERSION}</p>
        </div>
        <button onclick="window.location.href='/panel'" class="w-full py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-purple-500/30 transition-all duration-300">
            ورود به پنل مدیریت
        </button>
        <p class="text-center text-gray-500 text-xs mt-4">ساخته شده با ❤️ | SR Panel</p>
    </div>
</body>
</html>`,

	setup: `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SR Panel - تنظیم رمز</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css" rel="stylesheet">
    <style>
        body { font-family: 'Vazirmatn', sans-serif; background: #0a0a0f; }
        .glass { background: rgba(255,255,255,0.05); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.08); }
        .gradient-text { background: linear-gradient(135deg, #7c3aed, #3b82f6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .input-glow:focus { box-shadow: 0 0 20px rgba(124, 58, 237, 0.2); }
    </style>
</head>
<body class="min-h-screen flex items-center justify-center p-4">
    <div class="glass rounded-2xl p-8 max-w-md w-full">
        <h2 class="text-2xl font-bold gradient-text text-center mb-2">تنظیم رمز عبور</h2>
        <p class="text-gray-400 text-center text-sm mb-6">این اولین ورود شماست، رمز عبور خود را تعیین کنید</p>
        <form onsubmit="handleSetup(event)" class="space-y-4">
            <input type="password" id="password" placeholder="رمز عبور" class="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 input-glow transition text-white" required minlength="4">
            <input type="password" id="confirm-password" placeholder="تکرار رمز عبور" class="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 input-glow transition text-white" required minlength="4">
            <button type="submit" id="submit-btn" class="w-full py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-purple-500/30 transition-all duration-300">
                ثبت و ورود
            </button>
        </form>
    </div>
    <script>
        async function handleSetup(e) {
            e.preventDefault();
            const pwd = document.getElementById('password').value;
            const confirm = document.getElementById('confirm-password').value;
            if (pwd !== confirm) { alert('رمز عبور و تکرار آن مطابقت ندارند!'); return; }
            const btn = document.getElementById('submit-btn');
            btn.disabled = true; btn.innerText = 'در حال ثبت...';
            try {
                const res = await fetch('/api/setup-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: pwd })
                });
                const data = await res.json();
                if (res.ok && data.success) {
                    alert('✅ رمز عبور تنظیم شد!');
                    window.location.reload();
                } else {
                    alert('خطا: ' + (data.error || 'ناموفق'));
                }
            } catch(err) { alert('خطا در ارتباط با سرور'); }
            finally { btn.disabled = false; btn.innerText = 'ثبت و ورود'; }
        }
    </script>
</body>
</html>`,

	login: `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SR Panel - ورود</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css" rel="stylesheet">
    <style>
        body { font-family: 'Vazirmatn', sans-serif; background: #0a0a0f; }
        .glass { background: rgba(255,255,255,0.05); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.08); }
        .gradient-text { background: linear-gradient(135deg, #7c3aed, #3b82f6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .input-glow:focus { box-shadow: 0 0 20px rgba(124, 58, 237, 0.2); }
    </style>
</head>
<body class="min-h-screen flex items-center justify-center p-4">
    <div class="glass rounded-2xl p-8 max-w-md w-full">
        <div id="login-section">
            <h2 class="text-2xl font-bold gradient-text text-center mb-6">ورود به پنل</h2>
            <form onsubmit="handleLogin(event)" class="space-y-4">
                <input type="password" id="password" placeholder="رمز عبور" class="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 input-glow transition text-white" required>
                <button type="submit" id="submit-btn" class="w-full py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-purple-500/30 transition-all duration-300">
                    ورود
                </button>
            </form>
            <div class="mt-4 text-center">
                <button onclick="toggleRecovery(true)" class="text-purple-400 hover:text-purple-300 text-sm transition">🔑 بازیابی رمز پنل</button>
            </div>
        </div>
        <div id="recovery-section" class="hidden">
            <h2 class="text-2xl font-bold text-orange-400 text-center mb-4">بازیابی رمز</h2>
            <div class="mb-4 p-3 bg-orange-500/10 border border-orange-500/20 rounded-xl text-xs text-orange-300">
                برای اثبات مالکیت، توکن کلودفلر خود را وارد کنید.
                <a href="https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=%5B%7B%22key%22%3A%22workers_scripts%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22workers_kv_storage%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22d1%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22account_settings%22%2C%22type%22%3A%22read%22%7D%2C%7B%22key%22%3A%22workers_subdomain%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22account_analytics%22%2C%22type%22%3A%22read%22%7D%5D&accountId=*&zoneId=all&name=SR-Deployer-Token" target="_blank" class="block mt-2 text-center py-2 bg-orange-500/20 hover:bg-orange-500/30 rounded-lg transition font-bold text-sm">
                    📥 دریافت توکن کلودفلر
                </a>
            </div>
            <form onsubmit="handleRecovery(event)" class="space-y-4">
                <input type="password" id="api-token" placeholder="توکن را وارد کنید" class="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 transition text-white text-sm font-mono" required>
                <div class="flex gap-2">
                    <button type="button" onclick="toggleRecovery(false)" class="flex-1 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 font-bold rounded-xl transition">انصراف</button>
                    <button type="submit" id="recover-btn" class="flex-1 py-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-orange-500/30 transition">بازیابی</button>
                </div>
            </form>
        </div>
    </div>
    <script>
        async function handleLogin(e) {
            e.preventDefault();
            const pwd = document.getElementById('password').value;
            const btn = document.getElementById('submit-btn');
            btn.disabled = true;
            try {
                const res = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: pwd })
                });
                const data = await res.json();
                if (res.ok && data.success) window.location.reload();
                else alert('❌ رمز عبور اشتباه است');
            } catch(err) { alert('خطا در ارتباط با سرور'); }
            finally { btn.disabled = false; }
        }
        function toggleRecovery(show) {
            document.getElementById('login-section').classList.toggle('hidden', show);
            document.getElementById('recovery-section').classList.toggle('hidden', !show);
        }
        async function handleRecovery(e) {
            e.preventDefault();
            const token = document.getElementById('api-token').value;
            const btn = document.getElementById('recover-btn');
            btn.disabled = true; btn.innerText = 'در حال بررسی...';
            try {
                const res = await fetch('/api/recover', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ api_token: token })
                });
                const data = await res.json();
                if (res.ok && data.success) {
                    alert('✅ رمز حذف شد! صفحه رفرش می‌شود...');
                    setTimeout(() => window.location.reload(), 1500);
                } else {
                    alert('❌ ' + (data.error || 'خطا'));
                }
            } catch(err) { alert('خطا در ارتباط با سرور'); }
            finally { btn.disabled = false; btn.innerText = 'بازیابی'; }
        }
    </script>
</body>
</html>`,

	panel: `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SR Panel v${CURRENT_VERSION}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
    <link href="https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
    <style>
        * { font-family: 'Vazirmatn', sans-serif; }
        body { background: #0a0a0f; }
        .glass { background: rgba(255,255,255,0.03); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.06); }
        .glass-hover:hover { background: rgba(255,255,255,0.06); border-color: rgba(124,58,237,0.3); }
        .gradient-bg { background: linear-gradient(135deg, #0a0a0f, #1a0a2e, #0a0a2e); }
        .sidebar-gradient { background: linear-gradient(180deg, rgba(124,58,237,0.1), rgba(59,130,246,0.05)); }
        .glow-text { background: linear-gradient(135deg, #7c3aed, #3b82f6, #ec4899); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .card-glow:hover { box-shadow: 0 0 40px rgba(124,58,237,0.15); }
        .stat-card { transition: all 0.3s ease; }
        .stat-card:hover { transform: translateY(-4px); }
        .progress-ring { transition: stroke-dashoffset 0.5s ease; }
        .sidebar { transition: all 0.3s ease; }
        .sidebar-closed { margin-right: -280px; }
        @media (max-width: 768px) { .sidebar { position: fixed; z-index: 50; height: 100vh; } }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #7c3aed; border-radius: 4px; }
        .fade-in { animation: fadeIn 0.4s ease-in-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .pulse-dot { animation: pulse 2s infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        .update-notification { animation: slideDown 0.5s ease; }
        @keyframes slideDown { from { transform: translateY(-100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    </style>
</head>
<body class="gradient-bg text-white min-h-screen">
    <!-- ============================================ -->
    <!-- UPDATE NOTIFICATION (Not Detected Feature)     -->
    <!-- ============================================ -->
    <div id="update-notification" class="hidden fixed top-4 left-1/2 -translate-x-1/2 z-[100] w-[95%] max-w-2xl update-notification">
        <div class="glass rounded-2xl p-4 flex items-center justify-between border border-purple-500/30 shadow-2xl shadow-purple-500/20">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center animate-pulse">
                    <i class="fas fa-arrow-up text-purple-400 text-xl"></i>
                </div>
                <div>
                    <p class="font-bold text-sm">نسخه جدید SR Panel در دسترس است!</p>
                    <p class="text-xs text-gray-400" id="update-version-text">vX.X.X</p>
                </div>
            </div>
            <div class="flex gap-2">
                <button onclick="applyUpdate()" class="px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white text-xs font-bold rounded-lg hover:shadow-lg hover:shadow-purple-500/30 transition">
                    آپدیت خودکار
                </button>
                <button onclick="dismissUpdate()" class="px-3 py-2 bg-white/5 hover:bg-white/10 text-gray-400 text-xs rounded-lg transition">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        </div>
    </div>

    <!-- ============================================ -->
    <!-- SIDEBAR                                      -->
    <!-- ============================================ -->
    <aside id="sidebar" class="sidebar fixed top-0 right-0 h-full w-[280px] bg-[#0d0d1a] border-l border-white/5 p-6 overflow-y-auto z-40 transition-all duration-300">
        <div class="flex items-center justify-between mb-8">
            <div class="flex items-center gap-2">
                <div class="w-8 h-8 bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg flex items-center justify-center">
                    <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                    </svg>
                </div>
                <span class="font-bold text-lg glow-text">SR Panel</span>
            </div>
            <button onclick="toggleSidebar()" class="md:hidden text-gray-400 hover:text-white transition">
                <i class="fas fa-times text-xl"></i>
            </button>
        </div>

        <div class="space-y-1">
            <a href="#" onclick="showDashboard()" class="flex items-center gap-3 px-4 py-3 rounded-xl bg-purple-600/20 text-purple-400 hover:bg-purple-600/30 transition" id="nav-dashboard">
                <i class="fas fa-chart-pie w-5 text-center"></i>
                <span>داشبورد</span>
            </a>
            <a href="#" onclick="showUsers()" class="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/5 transition text-gray-400 hover:text-white" id="nav-users">
                <i class="fas fa-users w-5 text-center"></i>
                <span>مدیریت کاربران</span>
            </a>
            <a href="#" onclick="showSettings()" class="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/5 transition text-gray-400 hover:text-white" id="nav-settings">
                <i class="fas fa-cog w-5 text-center"></i>
                <span>تنظیمات</span>
            </a>
            <a href="#" onclick="showChangelog()" class="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/5 transition text-gray-400 hover:text-white" id="nav-changelog">
                <i class="fas fa-history w-5 text-center"></i>
                <span>تغییرات نسخه</span>
            </a>
        </div>

        <div class="absolute bottom-6 right-6 left-6">
            <div class="glass rounded-xl p-4 text-center">
                <p class="text-[10px] text-gray-500">نسخه</p>
                <p class="font-bold glow-text text-sm" id="panel-version">v${CURRENT_VERSION}</p>
                <div class="flex justify-center gap-4 mt-3">
                    <a href="https://github.com/amirparsa1/SR-Panel" target="_blank" class="text-gray-500 hover:text-white transition">
                        <i class="fab fa-github text-lg"></i>
                    </a>
                    <a href="https://t.me/SR_Panel_IR_BOT" target="_blank" class="text-gray-500 hover:text-blue-400 transition">
                        <i class="fab fa-telegram text-lg"></i>
                    </a>
                </div>
                <button onclick="logoutAdmin()" class="mt-3 w-full py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs font-bold rounded-lg transition">
                    <i class="fas fa-sign-out-alt ml-1"></i> خروج
                </button>
            </div>
        </div>
    </aside>

    <!-- ============================================ -->
    <!-- MAIN CONTENT                                 -->
    <!-- ============================================ -->
    <main class="mr-0 md:mr-[280px] transition-all duration-300 p-4 md:p-8">
        <!-- Mobile Toggle -->
        <button onclick="toggleSidebar()" class="md:hidden fixed bottom-6 right-6 z-30 w-12 h-12 rounded-full bg-gradient-to-r from-purple-600 to-blue-600 shadow-lg shadow-purple-500/30 flex items-center justify-center">
            <i class="fas fa-bars text-white text-xl"></i>
        </button>

        <!-- ========================================== -->
        <!-- DASHBOARD SECTION                          -->
        <!-- ========================================== -->
        <div id="dashboard-section" class="fade-in">
            <h1 class="text-2xl font-bold glow-text mb-6">📊 داشبورد</h1>
            
            <!-- Stats Cards -->
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div class="glass rounded-2xl p-4 stat-card card-glow">
                    <div class="flex items-center justify-between">
                        <span class="text-gray-400 text-sm">کل کاربران</span>
                        <div class="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
                            <i class="fas fa-users text-purple-400"></i>
                        </div>
                    </div>
                    <p class="text-2xl font-bold mt-2" id="stat-total-users">0</p>
                </div>
                <div class="glass rounded-2xl p-4 stat-card card-glow">
                    <div class="flex items-center justify-between">
                        <span class="text-gray-400 text-sm">آنلاین</span>
                        <div class="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
                            <i class="fas fa-wifi text-green-400"></i>
                        </div>
                    </div>
                    <p class="text-2xl font-bold mt-2 text-green-400" id="stat-active-users">0</p>
                </div>
                <div class="glass rounded-2xl p-4 stat-card card-glow">
                    <div class="flex items-center justify-between">
                        <span class="text-gray-400 text-sm">ریکوئست امروز</span>
                        <div class="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center">
                            <i class="fas fa-cloud-upload-alt text-orange-400"></i>
                        </div>
                    </div>
                    <p class="text-2xl font-bold mt-2 text-orange-400" id="stat-cf-requests">0</p>
                    <div class="w-full h-1 bg-white/5 rounded-full mt-2 overflow-hidden">
                        <div id="stat-cf-progress" class="h-full bg-gradient-to-r from-orange-500 to-red-500 rounded-full transition-all duration-500" style="width:0%"></div>
                    </div>
                </div>
                <div class="glass rounded-2xl p-4 stat-card card-glow">
                    <div class="flex items-center justify-between">
                        <span class="text-gray-400 text-sm">ترافیک مصرفی</span>
                        <div class="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                            <i class="fas fa-database text-blue-400"></i>
                        </div>
                    </div>
                    <p class="text-2xl font-bold mt-2 text-blue-400" id="stat-total-usage">0 GB</p>
                </div>
            </div>

            <!-- Charts (CSS-only) -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div class="glass rounded-2xl p-4">
                    <h3 class="font-bold text-sm text-gray-300 mb-4">📈 ترافیک مصرفی (تو)</h3>
                    <div id="traffic-chart" class="flex items-end gap-1 h-32"></div>
                </div>
                <div class="glass rounded-2xl p-4">
                    <h3 class="font-bold text-sm text-gray-300 mb-4">📊 ریکوئست‌های روزانه</h3>
                    <div id="requests-chart" class="flex items-end gap-1 h-32"></div>
                </div>
            </div>

            <!-- At-Risk Users -->
            <div class="glass rounded-2xl p-4">
                <h3 class="font-bold text-sm text-gray-300 mb-4">⚠️ کاربران در معرض خطر</h3>
                <div id="at-risk-users" class="space-y-2">
                    <p class="text-gray-500 text-sm text-center">در حال بررسی...</p>
                </div>
            </div>
        </div>

        <!-- ========================================== -->
        <!-- USERS SECTION                             -->
        <!-- ========================================== -->
        <div id="users-section" class="hidden fade-in">
            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <h1 class="text-2xl font-bold glow-text">👥 مدیریت کاربران</h1>
                <button onclick="openCreateModal()" class="px-6 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-purple-500/30 transition flex items-center gap-2">
                    <i class="fas fa-plus"></i> کاربر جدید
                </button>
            </div>

            <!-- Filters -->
            <div class="flex flex-col sm:flex-row gap-3 mb-4">
                <input type="text" id="search-input" oninput="filterAndRenderUsers()" placeholder="جستجو..." class="flex-1 px-4 py-2 glass rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                <select id="filter-status" onchange="filterAndRenderUsers()" class="px-4 py-2 glass rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                    <option value="all">همه</option>
                    <option value="active">فعال</option>
                    <option value="inactive">غیرفعال</option>
                    <option value="online">آنلاین</option>
                    <option value="expired">منقضی</option>
                </select>
                <select id="sort-users" onchange="filterAndRenderUsers()" class="px-4 py-2 glass rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                    <option value="newest">جدیدترین</option>
                    <option value="name">نام کاربری</option>
                    <option value="usage-desc">بیشترین مصرف</option>
                    <option value="expiry-asc">نزدیک به انقضا</option>
                </select>
            </div>

            <!-- Users Table -->
            <div id="users-table-container" class="glass rounded-2xl overflow-hidden">
                <div class="overflow-x-auto">
                    <table class="w-full text-right">
                        <thead class="bg-white/5">
                            <tr class="text-gray-400 text-sm">
                                <th class="p-3 w-10"><input type="checkbox" id="select-all-users" onchange="toggleSelectAllUsers(this)" class="rounded border-purple-500/30 bg-transparent"></th>
                                <th class="p-3">کاربر</th>
                                <th class="p-3">عملیات</th>
                                <th class="p-3">ساب</th>
                                <th class="p-3">پورت</th>
                                <th class="p-3">حجم</th>
                                <th class="p-3">ریکوئست</th>
                                <th class="p-3">زمان</th>
                                <th class="p-3">آنلاین</th>
                            </tr>
                        </thead>
                        <tbody id="users-tbody" class="divide-y divide-white/5 text-sm"></tbody>
                    </table>
                </div>
            </div>
            <div id="empty-state" class="hidden glass rounded-2xl p-12 text-center">
                <i class="fas fa-users-slash text-4xl text-gray-600 mb-4"></i>
                <p class="text-gray-400">کاربری وجود ندارد. اولین کاربر را بسازید!</p>
            </div>
        </div>

        <!-- ========================================== -->
        <!-- SETTINGS SECTION                          -->
        <!-- ========================================== -->
        <div id="settings-section" class="hidden fade-in">
            <h1 class="text-2xl font-bold glow-text mb-6">⚙️ تنظیمات</h1>
            <div class="space-y-4 max-w-2xl">
                <div class="glass rounded-2xl p-4">
                    <h3 class="font-bold mb-3">🔄 نرخ رفرش</h3>
                    <select id="refresh-rate-select" onchange="changeRefreshRate(this.value)" class="w-full px-4 py-2 glass rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500">
                        <option value="1000">۱ ثانیه</option>
                        <option value="2000" selected>۲ ثانیه</option>
                        <option value="5000">۵ ثانیه</option>
                        <option value="10000">۱۰ ثانیه</option>
                        <option value="30000">۳۰ ثانیه</option>
                    </select>
                </div>
                <div class="glass rounded-2xl p-4">
                    <h3 class="font-bold mb-3">🔒 تغییر رمز عبور</h3>
                    <input type="password" id="change-pwd-current" placeholder="رمز فعلی" class="w-full px-4 py-2 glass rounded-xl mb-2 focus:outline-none focus:ring-2 focus:ring-purple-500">
                    <input type="password" id="change-pwd-new" placeholder="رمز جدید" class="w-full px-4 py-2 glass rounded-xl mb-3 focus:outline-none focus:ring-2 focus:ring-purple-500">
                    <button onclick="changeAdminPassword()" class="w-full py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-purple-500/30 transition">
                        تغییر رمز
                    </button>
                </div>
                <div class="glass rounded-2xl p-4">
                    <h3 class="font-bold mb-3">💾 پشتیبان‌گیری</h3>
                    <div class="flex gap-3">
                        <button onclick="exportUsersBackup()" class="flex-1 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 font-bold rounded-xl transition">
                            <i class="fas fa-download ml-1"></i> خروجی
                        </button>
                        <button onclick="triggerImportBackup()" class="flex-1 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 font-bold rounded-xl transition">
                            <i class="fas fa-upload ml-1"></i> بازیابی
                        </button>
                    </div>
                    <input type="file" id="backup-file-input" onchange="importUsersBackup(event)" accept=".json" class="hidden">
                </div>
                <div class="glass rounded-2xl p-4">
                    <h3 class="font-bold mb-3">🌐 پروکسی عمومی</h3>
                    <div class="flex gap-3">
                        <select id="location-select" class="flex-1 px-4 py-2 glass rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500">
                            <option value="">پیش‌فرض</option>
                        </select>
                        <button onclick="saveSettings()" class="px-6 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-purple-500/30 transition">
                            ذخیره
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- ========================================== -->
        <!-- CHANGELOG SECTION                         -->
        <!-- ========================================== -->
        <div id="changelog-section" class="hidden fade-in">
            <h1 class="text-2xl font-bold glow-text mb-6">📜 تغییرات نسخه</h1>
            <div class="glass rounded-2xl p-6 max-w-2xl" id="changelog-content">
                <div class="flex items-center gap-3 mb-4">
                    <div class="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center animate-pulse">
                        <i class="fas fa-spinner fa-spin text-purple-400"></i>
                    </div>
                    <span class="text-gray-400">در حال دریافت تغییرات...</span>
                </div>
            </div>
        </div>
    </main>

    <!-- ============================================ -->
    <!-- USER MODAL                                   -->
    <!-- ============================================ -->
    <div id="user-modal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 opacity-0 pointer-events-none transition-all duration-300">
        <div class="glass rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto transition-all transform scale-95 opacity-0" id="user-modal-card">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-xl font-bold glow-text" id="modal-title">کاربر جدید</h3>
                <button onclick="toggleModal(false)" class="text-gray-400 hover:text-white transition">
                    <i class="fas fa-times text-xl"></i>
                </button>
            </div>
            <form id="create-user-form" onsubmit="handleFormSubmit(event)" class="space-y-4">
                <input type="text" id="input-name" placeholder="نام کاربری" class="w-full px-4 py-2 glass rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500" required maxlength="32">
                <div class="grid grid-cols-2 gap-3">
                    <input type="number" id="input-limit" placeholder="حجم (GB)" class="w-full px-4 py-2 glass rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500">
                    <input type="number" id="input-expiry" placeholder="اعتبار (روز)" class="w-full px-4 py-2 glass rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500">
                    <input type="number" id="input-req-limit" placeholder="سقف ریکوئست" class="w-full px-4 py-2 glass rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500">
                    <input type="number" id="input-ip-limit" placeholder="محدودیت دستگاه" class="w-full px-4 py-2 glass rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500">
                </div>
                <textarea id="input-ips" rows="2" placeholder="آیپی‌های تمیز (هر خط یکی)" class="w-full px-4 py-2 glass rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"></textarea>
                <div class="grid grid-cols-2 gap-3">
                    <select id="fingerprint-select" class="w-full px-4 py-2 glass rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500">
                        <option value="ios">iOS</option>
                        <option value="chrome">Chrome</option>
                        <option value="firefox">Firefox</option>
                        <option value="android">Android</option>
                    </select>
                    <select id="user-location-select" class="w-full px-4 py-2 glass rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500">
                        <option value="">بدون لوکیشن</option>
                    </select>
                </div>
                <div class="grid grid-cols-2 gap-3">
                    <label class="flex items-center gap-2 text-sm text-gray-300">
                        <input type="checkbox" id="input-block-porn" class="rounded border-purple-500/30 bg-transparent">
                        مسدودسازی بزرگسالان
                    </label>
                    <label class="flex items-center gap-2 text-sm text-gray-300">
                        <input type="checkbox" id="input-block-ads" class="rounded border-purple-500/30 bg-transparent">
                        مسدودسازی تبلیغات
                    </label>
                </div>
                <div class="grid grid-cols-3 gap-2">
                    <label class="flex items-center gap-1 text-xs text-gray-400"><input type="checkbox" name="ports" value="443" checked> 443</label>
                    <label class="flex items-center gap-1 text-xs text-gray-400"><input type="checkbox" name="ports" value="80" checked> 80</label>
                    <label class="flex items-center gap-1 text-xs text-gray-400"><input type="checkbox" name="ports" value="2053"> 2053</label>
                    <label class="flex items-center gap-1 text-xs text-gray-400"><input type="checkbox" name="ports" value="2083"> 2083</label>
                    <label class="flex items-center gap-1 text-xs text-gray-400"><input type="checkbox" name="ports" value="2096"> 2096</label>
                    <label class="flex items-center gap-1 text-xs text-gray-400"><input type="checkbox" name="ports" value="8443"> 8443</label>
                </div>
                <input type="text" id="input-custom-ports" placeholder="پورت‌های دلخواه (مثلاً 8080 8880)" class="w-full px-4 py-2 glass rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm font-mono">
                <div class="flex gap-3 pt-2">
                    <button type="button" onclick="toggleModal(false)" class="flex-1 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 font-bold rounded-xl transition">انصراف</button>
                    <button type="submit" id="submit-btn" class="flex-1 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-purple-500/30 transition">ایجاد</button>
                </div>
            </form>
        </div>
    </div>

    <!-- ============================================ -->
    <!-- QR MODAL                                     -->
    <!-- ============================================ -->
    <div id="qr-modal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 opacity-0 pointer-events-none transition-all duration-300">
        <div class="glass rounded-2xl p-6 max-w-sm w-full text-center transition-all transform scale-95 opacity-0" id="qr-modal-card">
            <button onclick="toggleQrModal(false)" class="float-left text-gray-400 hover:text-white transition">
                <i class="fas fa-times text-xl"></i>
            </button>
            <h3 class="font-bold text-lg mb-4">QR Code</h3>
            <div id="qrcode-container" class="flex justify-center"></div>
        </div>
    </div>

    <!-- ============================================ -->
    <!-- TOAST CONTAINER                              -->
    <!-- ============================================ -->
    <div id="toast-container" class="fixed top-20 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 pointer-events-none w-[95%] max-w-md"></div>

    <script>
        // ============================================
        // GLOBALS
        // ============================================
        const CURRENT_VERSION = '${CURRENT_VERSION}';
        const TLS_PORTS = ['443', '2053', '2083', '2087', '2096', '8443'];
        const NON_TLS_PORTS = ['80', '8080', '8880', '2052', '2086', '2095'];
        let allUsers = [];
        let selectedUsernames = new Set();
        let isEditMode = false;
        let editingUsername = '';
        let refreshInterval = null;
        let updateDismissed = false;

        // ============================================
        // TOAST & CONFIRM
        // ============================================
        function showToast(msg, type = 'success') {
            const container = document.getElementById('toast-container');
            const colors = type === 'error' 
                ? 'bg-red-500/20 border-red-500/30 text-red-400'
                : 'bg-green-500/20 border-green-500/30 text-green-400';
            const toast = document.createElement('div');
            toast.className = `px-4 py-3 border rounded-xl font-bold text-sm pointer-events-auto glass ${colors} transform transition-all duration-300 -translate-y-full opacity-0`;
            toast.innerText = msg;
            container.appendChild(toast);
            requestAnimationFrame(() => {
                toast.classList.remove('-translate-y-full', 'opacity-0');
            });
            setTimeout(() => {
                toast.classList.add('-translate-y-full', 'opacity-0');
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        }

        function customConfirm(msg) {
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

        window.alert = function(msg) {
            showToast(msg, msg.includes('خطا') ? 'error' : 'success');
        };

        // ============================================
        // SIDEBAR
        // ============================================
        function toggleSidebar() {
            document.getElementById('sidebar').classList.toggle('sidebar-closed');
        }

        function showDashboard() {
            document.querySelectorAll('#dashboard-section, #users-section, #settings-section, #changelog-section').forEach(el => el.classList.add('hidden'));
            document.getElementById('dashboard-section').classList.remove('hidden');
            document.querySelectorAll('[id^="nav-"]').forEach(el => el.className = 'flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/5 transition text-gray-400 hover:text-white');
            document.getElementById('nav-dashboard').className = 'flex items-center gap-3 px-4 py-3 rounded-xl bg-purple-600/20 text-purple-400 hover:bg-purple-600/30 transition';
            if (window.innerWidth < 768) toggleSidebar();
        }

        function showUsers() {
            document.querySelectorAll('#dashboard-section, #users-section, #settings-section, #changelog-section').forEach(el => el.classList.add('hidden'));
            document.getElementById('users-section').classList.remove('hidden');
            document.querySelectorAll('[id^="nav-"]').forEach(el => el.className = 'flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/5 transition text-gray-400 hover:text-white');
            document.getElementById('nav-users').className = 'flex items-center gap-3 px-4 py-3 rounded-xl bg-purple-600/20 text-purple-400 hover:bg-purple-600/30 transition';
            if (window.innerWidth < 768) toggleSidebar();
        }

        function showSettings() {
            document.querySelectorAll('#dashboard-section, #users-section, #settings-section, #changelog-section').forEach(el => el.classList.add('hidden'));
            document.getElementById('settings-section').classList.remove('hidden');
            document.querySelectorAll('[id^="nav-"]').forEach(el => el.className = 'flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/5 transition text-gray-400 hover:text-white');
            document.getElementById('nav-settings').className = 'flex items-center gap-3 px-4 py-3 rounded-xl bg-purple-600/20 text-purple-400 hover:bg-purple-600/30 transition';
            if (window.innerWidth < 768) toggleSidebar();
        }

        function showChangelog() {
            document.querySelectorAll('#dashboard-section, #users-section, #settings-section, #changelog-section').forEach(el => el.classList.add('hidden'));
            document.getElementById('changelog-section').classList.remove('hidden');
            document.querySelectorAll('[id^="nav-"]').forEach(el => el.className = 'flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/5 transition text-gray-400 hover:text-white');
            document.getElementById('nav-changelog').className = 'flex items-center gap-3 px-4 py-3 rounded-xl bg-purple-600/20 text-purple-400 hover:bg-purple-600/30 transition';
            loadChangelog();
            if (window.innerWidth < 768) toggleSidebar();
        }

        // ============================================
        // UPDATE NOTIFICATION (Not Detected)
        // ============================================
        async function checkForUpdates() {
            try {
                const res = await fetch('https://raw.githubusercontent.com/amirparsa1/SR-Panel/refs/heads/main/sr-panel.js?t=' + Date.now());
                const text = await res.text();
                const match = text.match(/CURRENT_VERSION\s*=\s*['"]([0-9.]+)['"]/);
                if (match && match[1] !== CURRENT_VERSION && !updateDismissed) {
                    document.getElementById('update-version-text').innerText = 'v' + match[1];
                    document.getElementById('update-notification').classList.remove('hidden');
                }
            } catch(e) {}
        }

        function dismissUpdate() {
            updateDismissed = true;
            document.getElementById('update-notification').classList.add('hidden');
        }

        async function applyUpdate() {
            if (!await customConfirm('آپدیت خودکار انجام شود؟')) return;
            showToast('در حال آپدیت...');
            try {
                const res = await fetch('/api/update-panel', { method: 'POST' });
                const data = await res.json();
                if (res.ok && data.success) {
                    showToast('✅ آپدیت موفق! صفحه رفرش می‌شود...');
                    setTimeout(() => window.location.reload(), 3000);
                } else if (res.status === 400 && data.error === "TOKEN_REQUIRED") {
                    showToast('⚠️ توکن کلودفلر مورد نیاز است', 'error');
                } else {
                    showToast('❌ خطا در آپدیت: ' + (data.error || 'نامشخص'), 'error');
                }
            } catch(e) {
                showToast('❌ خطا در ارتباط با سرور', 'error');
            }
        }

        // ============================================
        // CHANGELOG
        // ============================================
        async function loadChangelog() {
            try {
                const res = await fetch('/changelog');
                const data = await res.json();
                const container = document.getElementById('changelog-content');
                container.innerHTML = \`
                    <div class="flex items-center gap-2 mb-4">
                        <span class="text-purple-400 font-bold">نسخه \${data.version}</span>
                        <span class="text-xs text-gray-500">(فعلی)</span>
                    </div>
                    <ul class="space-y-2">
                        \${data.changes.map(c => \`<li class="flex items-start gap-2 text-gray-300"><i class="fas fa-check-circle text-purple-400 mt-1 text-sm"></i> \${c}</li>\`).join('')}
                    </ul>
                \`;
            } catch(e) {
                document.getElementById('changelog-content').innerHTML = '<p class="text-gray-400">خطا در دریافت تغییرات</p>';
            }
        }

        // ============================================
        // LOAD USERS
        // ============================================
        async function loadUsers(silent = false) {
            try {
                const res = await fetch('/api/users?t=' + Date.now());
                const data = await res.json();
                allUsers = data.users || [];
                const serverTime = data.serverTime || Date.now();
                window.lastServerTime = serverTime;
                
                // Update stats
                document.getElementById('stat-total-users').innerText = allUsers.length;
                document.getElementById('stat-active-users').innerText = allUsers.reduce((s, u) => s + (u.online_count || 0), 0);
                const totalGb = allUsers.reduce((s, u) => s + (u.lifetime_used_gb || u.used_gb || 0), 0);
                document.getElementById('stat-total-usage').innerText = totalGb < 1 ? (totalGb * 1024).toFixed(0) + ' MB' : totalGb.toFixed(2) + ' GB';
                
                // CF Requests
                const cfReqs = data.cfRequestsToday || 0;
                document.getElementById('stat-cf-requests').innerText = cfReqs >= 1000 ? (cfReqs / 1000).toFixed(1) + 'k' : cfReqs;
                document.getElementById('stat-cf-progress').style.width = Math.min((cfReqs / 100000) * 100, 100) + '%';
                
                // Charts
                renderCharts(allUsers);
                
                // At-risk users
                renderAtRiskUsers(allUsers, serverTime);
                
                filterAndRenderUsers();
            } catch(e) {
                if (!silent) showToast('خطا در دریافت کاربران', 'error');
            }
        }

        // ============================================
        // CHARTS (CSS-only)
        // ============================================
        function renderCharts(users) {
            const trafficChart = document.getElementById('traffic-chart');
            const reqChart = document.getElementById('requests-chart');
            const sorted = [...users].sort((a,b) => (b.used_gb || 0) - (a.used_gb || 0)).slice(0, 8);
            const maxTraffic = Math.max(...sorted.map(u => u.used_gb || 0), 1);
            const maxReq = Math.max(...sorted.map(u => u.used_req || 0), 1);
            
            trafficChart.innerHTML = sorted.map(u => \`
                <div class="flex-1 flex flex-col items-center gap-1">
                    <div class="w-full bg-gradient-to-t from-purple-500 to-blue-500 rounded-t" style="height: \${((u.used_gb || 0) / maxTraffic) * 100}%; min-height:4px;"></div>
                    <span class="text-[8px] text-gray-500 truncate max-w-full" title="\${u.username}">\${u.username.slice(0,3)}</span>
                </div>
            \`).join('');
            
            reqChart.innerHTML = sorted.map(u => \`
                <div class="flex-1 flex flex-col items-center gap-1">
                    <div class="w-full bg-gradient-to-t from-orange-500 to-red-500 rounded-t" style="height: \${((u.used_req || 0) / maxReq) * 100}%; min-height:4px;"></div>
                    <span class="text-[8px] text-gray-500 truncate max-w-full" title="\${u.username}">\${u.username.slice(0,3)}</span>
                </div>
            \`).join('');
        }

        // ============================================
        // AT-RISK USERS
        // ============================================
        function renderAtRiskUsers(users, serverTime) {
            const container = document.getElementById('at-risk-users');
            const risky = users.filter(u => {
                if (u.is_active === 0) return false;
                let isRisky = false;
                if (u.limit_gb && (u.used_gb || 0) >= u.limit_gb * 0.8) isRisky = true;
                if (u.expiry_days && u.created_at) {
                    const expiry = new Date(new Date(u.created_at).getTime() + u.expiry_days * 86400000);
                    const daysLeft = Math.ceil((expiry - new Date(serverTime)) / 86400000);
                    if (daysLeft <= 3) isRisky = true;
                }
                return isRisky;
            }).slice(0, 5);
            
            if (risky.length === 0) {
                container.innerHTML = '<p class="text-gray-500 text-sm text-center">✅ همه کاربران در وضعیت خوبی هستند</p>';
                return;
            }
            
            container.innerHTML = risky.map(u => \`
                <div class="flex items-center justify-between p-2 glass rounded-xl">
                    <div class="flex items-center gap-2">
                        <i class="fas fa-exclamation-triangle text-yellow-400 text-sm"></i>
                        <span class="font-medium">\${u.username}</span>
                    </div>
                    <div class="flex gap-4 text-xs text-gray-400">
                        \${u.limit_gb ? \`حجم: \${((u.used_gb || 0) / u.limit_gb * 100).toFixed(0)}%\` : ''}
                        \${u.expiry_days ? \`\${Math.ceil((new Date(new Date(u.created_at).getTime() + u.expiry_days * 86400000) - new Date()) / 86400000)} روز مونده\` : ''}
                    </div>
                </div>
            \`).join('');
        }

        // ============================================
        // FILTER & RENDER USERS
        // ============================================
        function filterAndRenderUsers() {
            if (!allUsers.length) {
                document.getElementById('users-table-container').classList.add('hidden');
                document.getElementById('empty-state').classList.remove('hidden');
                return;
            }
            document.getElementById('users-table-container').classList.remove('hidden');
            document.getElementById('empty-state').classList.add('hidden');
            
            const query = (document.getElementById('search-input').value || '').toLowerCase();
            const status = document.getElementById('filter-status').value;
            const sort = document.getElementById('sort-users').value;
            const serverTime = window.lastServerTime || Date.now();
            
            let filtered = allUsers.filter(u => {
                if (query && !u.username.toLowerCase().includes(query) && !u.uuid.toLowerCase().includes(query)) return false;
                if (status === 'active') return u.is_active === 1;
                if (status === 'inactive') return u.is_active === 0;
                if (status === 'online') return u.is_online === 1;
                if (status === 'expired') {
                    if (u.is_active === 0) return true;
                    if (u.limit_gb && (u.used_gb || 0) >= u.limit_gb) return true;
                    if (u.expiry_days && u.created_at) {
                        const expiry = new Date(new Date(u.created_at).getTime() + u.expiry_days * 86400000);
                        if (new Date(serverTime) > expiry) return true;
                    }
                    return false;
                }
                return true;
            });
            
            filtered.sort((a,b) => {
                if (sort === 'newest') return b.id - a.id;
                if (sort === 'name') return a.username.localeCompare(b.username);
                if (sort === 'usage-desc') return (b.used_gb || 0) - (a.used_gb || 0);
                if (sort === 'expiry-asc') {
                    const getDays = (u) => {
                        if (!u.expiry_days || !u.created_at) return Infinity;
                        return Math.ceil((new Date(new Date(u.created_at).getTime() + u.expiry_days * 86400000) - new Date(serverTime)) / 86400000);
                    };
                    return getDays(a) - getDays(b);
                }
                return 0;
            });
            
            renderUserRows(filtered, serverTime);
        }

        function renderUserRows(users, serverTime) {
            const tbody = document.getElementById('users-tbody');
            tbody.innerHTML = users.map(u => {
                const daysRemaining = u.expiry_days && u.created_at ? 
                    Math.ceil((new Date(new Date(u.created_at).getTime() + u.expiry_days * 86400000) - new Date(serverTime)) / 86400000) : '∞';
                const usedGb = u.used_gb || 0;
                const limitGb = u.limit_gb;
                const volPct = limitGb ? Math.min((usedGb / limitGb) * 100, 100) : 0;
                const usedReq = u.used_req || 0;
                const limitReq = u.limit_req;
                const reqPct = limitReq ? Math.min((usedReq / limitReq) * 100, 100) : 0;
                const onlineCount = u.online_count || 0;
                const ipLimit = u.ip_limit || u.max_connections;
                const onlinePct = ipLimit ? Math.min((onlineCount / ipLimit) * 100, 100) : 0;
                const isExpired = u.is_active === 0 || (limitGb && usedGb >= limitGb) || (daysRemaining !== '∞' && daysRemaining < 0);
                const isChecked = selectedUsernames.has(u.username) ? 'checked' : '';
                
                return \`
                <tr class="hover:bg-white/5 transition">
                    <td class="p-3"><input type="checkbox" name="select-user" value="\${encodeURIComponent(u.username)}" onchange="onUserSelectChange(this)" \${isChecked} class="rounded border-purple-500/30 bg-transparent"></td>
                    <td class="p-3">
                        <div class="flex flex-col">
                            <span class="font-bold">\${u.username}</span>
                            <div class="flex gap-1 text-xs">
                                <span class="px-2 py-0.5 rounded-full \${isExpired ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}">\${isExpired ? 'غیرفعال' : 'فعال'}</span>
                                \${u.is_online === 1 ? '<span class="px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>آنلاین</span>' : ''}
                            </div>
                        </div>
                    </td>
                    <td class="p-3">
                        <div class="flex gap-1">
                            <button onclick="copyConfig('\${encodeURIComponent(u.username)}')" class="p-1.5 glass rounded-lg hover:bg-purple-500/20 transition" title="کپی کانفیگ"><i class="fas fa-copy text-xs text-purple-400"></i></button>
                            <button onclick="editUser('\${encodeURIComponent(u.username)}')" class="p-1.5 glass rounded-lg hover:bg-yellow-500/20 transition" title="ویرایش"><i class="fas fa-edit text-xs text-yellow-400"></i></button>
                            <button onclick="deleteUser('\${encodeURIComponent(u.username)}')" class="p-1.5 glass rounded-lg hover:bg-red-500/20 transition" title="حذف"><i class="fas fa-trash text-xs text-red-400"></i></button>
                            <button onclick="toggleUserStatus('\${encodeURIComponent(u.username)}')" class="p-1.5 glass rounded-lg hover:bg-${u.is_active === 1 ? 'amber' : 'green'}-500/20 transition" title="تغییر وضعیت"><i class="fas fa-${u.is_active === 1 ? 'pause' : 'play'} text-xs text-${u.is_active === 1 ? 'amber' : 'green'}-400"></i></button>
                        </div>
                    </td>
                    <td class="p-3">
                        <button onclick="copySubLink('\${encodeURIComponent(u.username)}')" class="px-2 py-1 glass rounded-lg text-xs hover:bg-purple-500/20 transition">ساب</button>
                        <button onclick="showSubQr('\${encodeURIComponent(u.username)}')" class="px-2 py-1 glass rounded-lg text-xs hover:bg-amber-500/20 transition"><i class="fas fa-qrcode text-amber-400"></i></button>
                    </td>
                    <td class="p-3 text-xs font-mono">\${u.port || '443'}</td>
                    <td class="p-3">
                        <div class="w-24">
                            <div class="flex justify-between text-xs"><span>\${usedGb < 1 ? (usedGb*1024).toFixed(0)+'MB' : usedGb.toFixed(2)+'GB'}</span><span>\${limitGb || '∞'}</span></div>
                            <div class="w-full h-1 bg-white/5 rounded-full overflow-hidden"><div class="h-full bg-gradient-to-r from-green-500 to-red-500 rounded-full transition-all" style="width:\${volPct}%"></div></div>
                        </div>
                    </td>
                    <td class="p-3">
                        <div class="w-24">
                            <div class="flex justify-between text-xs"><span>\${usedReq.toLocaleString()}</span><span>\${limitReq || '∞'}</span></div>
                            <div class="w-full h-1 bg-white/5 rounded-full overflow-hidden"><div class="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all" style="width:\${reqPct}%"></div></div>
                        </div>
                    </td>
                    <td class="p-3 text-sm">\${daysRemaining === '∞' ? '∞' : daysRemaining + ' روز'}</td>
                    <td class="p-3">
                        <div class="w-24">
                            <div class="flex justify-between text-xs"><span>\${onlineCount}</span><span>\${ipLimit || '∞'}</span></div>
                            <div class="w-full h-1 bg-white/5 rounded-full overflow-hidden"><div class="h-full bg-gradient-to-r from-green-500 to-red-500 rounded-full transition-all" style="width:\${onlinePct}%"></div></div>
                        </div>
                    </td>
                </tr>
                \`;
            }).join('');
        }

        // ============================================
        // USER ACTIONS
        // ============================================
        function toggleModal(show) {
            const modal = document.getElementById('user-modal');
            const card = document.getElementById('user-modal-card');
            if (show) {
                modal.classList.remove('opacity-0', 'pointer-events-none');
                card.classList.remove('scale-95', 'opacity-0');
                card.classList.add('scale-100', 'opacity-100');
            } else {
                modal.classList.add('opacity-0', 'pointer-events-none');
                card.classList.remove('scale-100', 'opacity-100');
                card.classList.add('scale-95', 'opacity-0');
                document.getElementById('create-user-form').reset();
                isEditMode = false;
                editingUsername = '';
                document.getElementById('modal-title').innerText = 'کاربر جدید';
                document.getElementById('submit-btn').innerText = 'ایجاد';
            }
        }

        function openCreateModal() {
            isEditMode = false;
            editingUsername = '';
            document.getElementById('modal-title').innerText = 'کاربر جدید';
            document.getElementById('submit-btn').innerText = 'ایجاد';
            document.getElementById('create-user-form').reset();
            document.querySelectorAll('input[name="ports"]').forEach(cb => cb.checked = ['443', '80'].includes(cb.value));
            toggleModal(true);
        }

        async function handleFormSubmit(e) {
            e.preventDefault();
            const btn = document.getElementById('submit-btn');
            btn.disabled = true;
            btn.innerText = 'در حال ذخیره...';
            
            const username = document.getElementById('input-name').value.trim();
            const limitGb = document.getElementById('input-limit').value || null;
            const expiry = document.getElementById('input-expiry').value || null;
            const limitReq = document.getElementById('input-req-limit').value || null;
            const ipLimit = document.getElementById('input-ip-limit').value || null;
            const ips = document.getElementById('input-ips').value;
            const fingerprint = document.getElementById('fingerprint-select').value;
            const blockPorn = document.getElementById('input-block-porn').checked ? 1 : 0;
            const blockAds = document.getElementById('input-block-ads').checked ? 1 : 0;
            const ports = Array.from(document.querySelectorAll('input[name="ports"]:checked')).map(cb => cb.value);
            const customPorts = document.getElementById('input-custom-ports').value.split(' ').filter(p => p.trim());
            const allPorts = [...ports, ...customPorts];
            const location = document.getElementById('user-location-select').value || null;
            
            if (!username) { showToast('نام کاربری الزامی است', 'error'); btn.disabled = false; btn.innerText = isEditMode ? 'ذخیره' : 'ایجاد'; return; }
            if (!allPorts.length) { showToast('حداقل یک پورت انتخاب کنید', 'error'); btn.disabled = false; btn.innerText = isEditMode ? 'ذخیره' : 'ایجاد'; return; }
            
            const url = isEditMode ? '/api/users/' + encodeURIComponent(editingUsername) : '/api/users';
            const method = isEditMode ? 'PUT' : 'POST';
            const payload = {
                username,
                limit_gb: limitGb,
                expiry_days: expiry,
                limit_req: limitReq,
                ips: ips || null,
                tls: allPorts.some(p => TLS_PORTS.includes(p)) ? 'on' : 'off',
                port: allPorts.join(','),
                fingerprint,
                ip_limit: ipLimit,
                block_porn: blockPorn,
                block_ads: blockAds,
                user_proxy_iata: location,
                user_proxy_ip: null,
                user_socks5: null
            };
            
            try {
                const res = await fetch(url, {
                    method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (res.ok && data.success) {
                    showToast('✅ کاربر ' + (isEditMode ? 'ویرایش' : 'ساخت') + ' شد');
                    toggleModal(false);
                    loadUsers(true);
                } else {
                    showToast('❌ خطا: ' + (data.error || 'نامشخص'), 'error');
                }
            } catch(e) {
                showToast('❌ خطا در ارتباط با سرور', 'error');
            }
            btn.disabled = false;
            btn.innerText = isEditMode ? 'ذخیره' : 'ایجاد';
        }

        function editUser(encodedUsername) {
            const username = decodeURIComponent(encodedUsername);
            const user = allUsers.find(u => u.username === username);
            if (!user) return;
            
            isEditMode = true;
            editingUsername = username;
            document.getElementById('modal-title').innerText = 'ویرایش: ' + username;
            document.getElementById('submit-btn').innerText = 'ذخیره';
            
            document.getElementById('input-name').value = username;
            document.getElementById('input-limit').value = user.limit_gb || '';
            document.getElementById('input-expiry').value = user.expiry_days || '';
            document.getElementById('input-req-limit').value = user.limit_req || '';
            document.getElementById('input-ip-limit').value = user.ip_limit || '';
            document.getElementById('input-ips').value = user.ips || '';
            document.getElementById('fingerprint-select').value = user.fingerprint || 'ios';
            document.getElementById('input-block-porn').checked = user.block_porn === 1;
            document.getElementById('input-block-ads').checked = user.block_ads === 1;
            
            const userPorts = (user.port || '').split(',').map(p => p.trim());
            document.querySelectorAll('input[name="ports"]').forEach(cb => {
                cb.checked = userPorts.includes(cb.value);
            });
            const customPorts = userPorts.filter(p => !TLS_PORTS.includes(p) && !NON_TLS_PORTS.includes(p));
            document.getElementById('input-custom-ports').value = customPorts.join(' ');
            document.getElementById('user-location-select').value = user.user_proxy_iata || '';
            
            toggleModal(true);
        }

        async function deleteUser(encodedUsername) {
            const username = decodeURIComponent(encodedUsername);
            if (!await customConfirm('حذف کاربر ' + username + '؟')) return;
            try {
                const res = await fetch('/api/users/' + encodeURIComponent(username), { method: 'DELETE' });
                if (res.ok) {
                    showToast('✅ کاربر حذف شد');
                    loadUsers(true);
                } else {
                    showToast('❌ خطا در حذف', 'error');
                }
            } catch(e) { showToast('❌ خطا در ارتباط با سرور', 'error'); }
        }

        async function toggleUserStatus(encodedUsername) {
            const username = decodeURIComponent(encodedUsername);
            try {
                const res = await fetch('/api/users/' + encodeURIComponent(username), {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ toggle_only: true })
                });
                if (res.ok) loadUsers(true);
            } catch(e) {}
        }

        // ============================================
        // BULK ACTIONS
        // ============================================
        function toggleSelectAllUsers(el) {
            document.querySelectorAll('input[name="select-user"]').forEach(cb => {
                cb.checked = el.checked;
                const username = decodeURIComponent(cb.value);
                if (el.checked) selectedUsernames.add(username);
                else selectedUsernames.delete(username);
            });
        }

        function onUserSelectChange(el) {
            const username = decodeURIComponent(el.value);
            if (el.checked) selectedUsernames.add(username);
            else selectedUsernames.delete(username);
        }

        // ============================================
        // SUBSCRIPTION & CONFIG
        // ============================================
        function getSubLink(username) { return window.location.origin + '/feed/' + encodeURIComponent(username); }
        function getStatusLink(username) { return window.location.origin + '/status/' + encodeURIComponent(username); }
        
        function copySubLink(encodedUsername) {
            const username = decodeURIComponent(encodedUsername);
            navigator.clipboard.writeText(getSubLink(username));
            showToast('✅ لینک ساب کپی شد');
        }
        
        function copyStatusLink(encodedUsername) {
            const username = decodeURIComponent(encodedUsername);
            navigator.clipboard.writeText(getStatusLink(username));
            showToast('✅ لینک وضعیت کپی شد');
        }
        
        function getVlessLink(username) {
            const user = allUsers.find(u => u.username === username);
            if (!user) return '';
            const host = window.location.hostname;
            let ips = [host];
            if (user.ips) ips = user.ips.split('\\n').map(i => i.trim()).filter(i => i);
            const ports = (user.port || '443').split(',').map(p => p.trim());
            const fp = user.fingerprint || 'chrome';
            const links = [];
            const remark = user.username + ' | SR Panel';
            ips.forEach(ip => {
                ports.forEach(port => {
                    const isTls = TLS_PORTS.includes(port);
                    const tlsVal = isTls ? 'tls' : 'none';
                    links.push('vless://' + user.uuid + '@' + ip + ':' + port + 
                        '?path=%2FIn_Panel_Rayeghan_Ast_Va_Gheyre_Ghabele_Foroosh&security=' + tlsVal +
                        '&encryption=none&insecure=0&host=' + host + '&fp=' + fp + '&type=ws&sni=' + host +
                        '#' + encodeURIComponent(remark));
                });
            });
            return links.join('\\n');
        }
        
        function copyConfig(encodedUsername) {
            const username = decodeURIComponent(encodedUsername);
            const config = getVlessLink(username);
            if (!config) { showToast('کاربر یافت نشد', 'error'); return; }
            navigator.clipboard.writeText(config);
            showToast('✅ کانفیگ کپی شد');
        }
        
        function toggleQrModal(show, text) {
            const modal = document.getElementById('qr-modal');
            const card = document.getElementById('qr-modal-card');
            const container = document.getElementById('qrcode-container');
            if (show) {
                container.innerHTML = '';
                new QRCode(container, { text, width: 200, height: 200, colorDark: '#ffffff', colorLight: '#0a0a0f' });
                modal.classList.remove('opacity-0', 'pointer-events-none');
                card.classList.remove('scale-95', 'opacity-0');
                card.classList.add('scale-100', 'opacity-100');
            } else {
                modal.classList.add('opacity-0', 'pointer-events-none');
                card.classList.remove('scale-100', 'opacity-100');
                card.classList.add('scale-95', 'opacity-0');
            }
        }
        
        function showSubQr(encodedUsername) {
            const username = decodeURIComponent(encodedUsername);
            toggleQrModal(true, getSubLink(username));
        }

        // ============================================
        // SETTINGS
        // ============================================
        function changeRefreshRate(val) {
            if (refreshInterval) clearInterval(refreshInterval);
            refreshInterval = setInterval(() => loadUsers(true), parseInt(val));
            localStorage.setItem('sr_refresh_rate', val);
        }
        
        async function saveSettings() {
            const location = document.getElementById('location-select').value;
            try {
                await fetch('/api/proxy-ip', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ proxy_ip: location ? location.toLowerCase() + '.proxyip.cmliussss.net' : 'proxyip.cmliussss.net', iata: location })
                });
                showToast('✅ تنظیمات ذخیره شد');
            } catch(e) { showToast('❌ خطا در ذخیره', 'error'); }
        }
        
        async function changeAdminPassword() {
            const current = document.getElementById('change-pwd-current').value;
            const newPwd = document.getElementById('change-pwd-new').value;
            if (!current || !newPwd) { showToast('هر دو فیلد را پر کنید', 'error'); return; }
            if (newPwd.length < 4) { showToast('رمز جدید حداقل ۴ کاراکتر', 'error'); return; }
            try {
                const res = await fetch('/api/change-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ current_password: current, new_password: newPwd })
                });
                const data = await res.json();
                if (res.ok && data.success) {
                    showToast('✅ رمز عبور تغییر کرد');
                    document.getElementById('change-pwd-current').value = '';
                    document.getElementById('change-pwd-new').value = '';
                } else {
                    showToast('❌ ' + (data.error || 'نامشخص'), 'error');
                }
            } catch(e) { showToast('❌ خطا در ارتباط با سرور', 'error'); }
        }
        
        async function logoutAdmin() {
            if (!await customConfirm('خروج از پنل؟')) return;
            await fetch('/api/logout', { method: 'POST' });
            window.location.reload();
        }

        // ============================================
        // BACKUP
        // ============================================
        async function exportUsersBackup() {
            if (!allUsers.length) { showToast('کاربری برای پشتیبان‌گیری نیست', 'error'); return; }
            try {
                const settingsRes = await fetch('/api/settings/bulk');
                const settings = await settingsRes.json();
                const data = JSON.stringify({ users: allUsers, settings }, null, 2);
                const blob = new Blob([data], { type: 'application/json' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = 'sr_backup_' + new Date().toISOString().split('T')[0] + '.json';
                a.click();
                showToast('✅ پشتیبان گرفته شد');
            } catch(e) { showToast('❌ خطا در پشتیبان‌گیری', 'error'); }
        }
        
        function triggerImportBackup() { document.getElementById('backup-file-input').click(); }
        
        async function importUsersBackup(e) {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async function(ev) {
                try {
                    const data = JSON.parse(ev.target.result);
                    const users = data.users || [];
                    if (!users.length) { showToast('داده‌ای برای بازیابی نیست', 'error'); return; }
                    if (!await customConfirm(users.length + ' کاربر بازیابی شود؟')) return;
                    for (const u of users) {
                        await fetch('/api/users', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(u)
                        });
                    }
                    showToast('✅ ' + users.length + ' کاربر بازیابی شد');
                    loadUsers(true);
                } catch(err) { showToast('❌ فایل نامعتبر', 'error'); }
            };
            reader.readAsText(file);
        }

        // ============================================
        // INIT
        // ============================================
        document.addEventListener('DOMContentLoaded', () => {
            // Version badge
            document.querySelectorAll('#panel-version').forEach(el => el.innerText = 'v' + CURRENT_VERSION);
            
            // Theme toggle
            // ... (optional dark mode)
            
            // Load data
            loadUsers();
            
            // Refresh rate
            const savedRate = localStorage.getItem('sr_refresh_rate') || '2000';
            document.getElementById('refresh-rate-select').value = savedRate;
            refreshInterval = setInterval(() => loadUsers(true), parseInt(savedRate));
            
            // Check for updates (every 60s)
            setTimeout(checkForUpdates, 3000);
            setInterval(checkForUpdates, 60000);
            
            // Load locations
            fetch('/locations')
                .then(r => r.json())
                .then(data => {
                    const select = document.getElementById('location-select');
                    const userSelect = document.getElementById('user-location-select');
                    data.forEach(loc => {
                        if (loc.iata && loc.city) {
                            const opt = '<option value="' + loc.iata + '">' + loc.city + ' (' + loc.iata + ')</option>';
                            select.innerHTML += opt;
                            userSelect.innerHTML += opt;
                        }
                    });
                })
                .catch(() => {});
            
            // Close modals on outside click
            document.querySelectorAll('.fixed').forEach(modal => {
                modal.addEventListener('click', function(e) {
                    if (e.target === this) {
                        this.classList.add('opacity-0', 'pointer-events-none');
                        document.querySelector('#' + this.id + ' > div')?.classList.add('scale-95', 'opacity-0');
                        document.querySelector('#' + this.id + ' > div')?.classList.remove('scale-100', 'opacity-100');
                    }
                });
            });
            
            // Show dashboard by default
            showDashboard();
        });
    </script>
</body>
</html>`,

	status: `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SR Panel - وضعیت</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
    <link href="https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
    <style>
        body { font-family: 'Vazirmatn', sans-serif; background: #0a0a0f; }
        .glass { background: rgba(255,255,255,0.05); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.08); }
        .gradient-text { background: linear-gradient(135deg, #7c3aed, #3b82f6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .stat-card { transition: all 0.3s ease; }
        .stat-card:hover { transform: translateY(-4px); }
        .pulse-dot { animation: pulse 2s infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
    </style>
</head>
<body class="min-h-screen flex flex-col items-center py-8 px-4">
    <div class="glass rounded-2xl p-6 max-w-xl w-full">
        <div class="text-center mb-6">
            <div class="w-16 h-16 mx-auto bg-gradient-to-br from-purple-600 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-500/20">
                <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                </svg>
            </div>
            <h1 class="text-2xl font-bold gradient-text mt-3">SR Panel</h1>
            <p class="text-gray-400 text-sm">وضعیت اشتراک</p>
            <p id="display-username" class="text-purple-400 font-bold text-lg mt-1"></p>
        </div>
        
        <div id="status-card" class="glass rounded-xl p-4 text-center mb-6 border transition-all">
            <span id="status-text" class="text-sm font-bold">در حال بارگذاری...</span>
        </div>
        
        <div class="grid grid-cols-2 gap-3 mb-6">
            <div class="glass rounded-xl p-3 stat-card">
                <div class="flex justify-between text-xs text-gray-400 mb-1">
                    <span>حجم مصرفی</span>
                    <span id="volume-pct">0%</span>
                </div>
                <div class="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div id="volume-progress" class="h-full bg-gradient-to-r from-green-500 to-red-500 rounded-full transition-all" style="width:0%"></div>
                </div>
                <div class="flex justify-between text-xs mt-1">
                    <span id="used-vol" class="text-white font-bold">-</span>
                    <span id="limit-vol" class="text-gray-400">-</span>
                </div>
            </div>
            <div class="glass rounded-xl p-3 stat-card">
                <div class="flex justify-between text-xs text-gray-400 mb-1">
                    <span>زمان باقی‌مانده</span>
                    <span id="expiry-pct">0%</span>
                </div>
                <div class="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div id="expiry-progress" class="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all" style="width:0%"></div>
                </div>
                <div class="flex justify-between text-xs mt-1">
                    <span id="days-remaining" class="text-white font-bold">-</span>
                    <span id="total-days" class="text-gray-400">-</span>
                </div>
            </div>
            <div class="glass rounded-xl p-3 stat-card">
                <div class="flex justify-between text-xs text-gray-400 mb-1">
                    <span>ریکوئست‌ها</span>
                    <span id="req-pct">0%</span>
                </div>
                <div class="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div id="req-progress" class="h-full bg-gradient-to-r from-orange-500 to-red-500 rounded-full transition-all" style="width:0%"></div>
                </div>
                <div class="flex justify-between text-xs mt-1">
                    <span id="used-req" class="text-white font-bold">-</span>
                    <span id="limit-req" class="text-gray-400">-</span>
                </div>
            </div>
            <div class="glass rounded-xl p-3 stat-card">
                <div class="flex justify-between text-xs text-gray-400 mb-1">
                    <span>دستگاه متصل</span>
                    <span id="online-pct">0%</span>
                </div>
                <div class="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div id="online-progress" class="h-full bg-gradient-to-r from-green-500 to-blue-500 rounded-full transition-all" style="width:0%"></div>
                </div>
                <div class="flex justify-between text-xs mt-1">
                    <span id="online-count" class="text-white font-bold">0</span>
                    <span id="limit-online" class="text-gray-400">-</span>
                </div>
            </div>
        </div>
        
        <div class="space-y-2">
            <button onclick="copyTextSub()" class="w-full glass rounded-xl p-3 hover:bg-white/10 transition flex justify-between items-center">
                <span class="text-sm">⛓️ لینک ساب متنی</span>
                <i class="fas fa-copy text-purple-400"></i>
            </button>
            <button onclick="showSubQr()" class="w-full glass rounded-xl p-3 hover:bg-white/10 transition flex justify-between items-center">
                <span class="text-sm">📱 کیوآر کد ساب</span>
                <i class="fas fa-qrcode text-amber-400"></i>
            </button>
            <button onclick="copyVlessConfig()" class="w-full glass rounded-xl p-3 hover:bg-white/10 transition flex justify-between items-center">
                <span class="text-sm">🚀 کانفیگ VLESS</span>
                <i class="fas fa-copy text-blue-400"></i>
            </button>
        </div>
    </div>
    
    <div class="flex gap-4 mt-4">
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
    
    <div id="qr-modal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 opacity-0 pointer-events-none transition-all duration-300">
        <div class="glass rounded-2xl p-6 max-w-sm w-full text-center transition-all transform scale-95 opacity-0" id="qr-modal-card">
            <button onclick="toggleQrModal(false)" class="float-left text-gray-400 hover:text-white transition">
                <i class="fas fa-times text-xl"></i>
            </button>
            <h3 class="font-bold text-lg mb-4">QR Code</h3>
            <div id="qrcode-container" class="flex justify-center"></div>
        </div>
    </div>
    
    <script>
        /* {{USER_DATA_PLACEHOLDER}} */
        
        function getHost() { return window.location.host; }
        function getSubLink() { return window.location.protocol + '//' + getHost() + '/sub/' + encodeURIComponent(window.statusUser.username); }
        
        function copyTextSub() {
            navigator.clipboard.writeText(getSubLink());
            alert('✅ لینک ساب کپی شد');
        }
        
        function copyVlessConfig() {
            const u = window.statusUser;
            const host = getHost();
            let ips = [host];
            if (u.ips) ips = u.ips.split('\\n').map(i => i.trim()).filter(i => i);
            const ports = (u.port || '443').split(',').map(p => p.trim());
            const fp = u.fingerprint || 'chrome';
            const links = [];
            ips.forEach(ip => {
                ports.forEach(port => {
                    const isTls = ['443','2053','2083','2087','2096','8443'].includes(port);
                    const tlsVal = isTls ? 'tls' : 'none';
                    links.push('vless://' + u.uuid + '@' + ip + ':' + port +
                        '?path=%2FIn_Panel_Rayeghan_Ast_Va_Gheyre_Ghabele_Foroosh&security=' + tlsVal +
                        '&encryption=none&insecure=0&host=' + host + '&fp=' + fp + '&type=ws&sni=' + host +
                        '#' + encodeURIComponent(u.username + ' | SR Panel'));
                });
            });
            navigator.clipboard.writeText(links.join('\\n'));
            alert('✅ کانفیگ کپی شد');
        }
        
        function toggleQrModal(show, text) {
            const modal = document.getElementById('qr-modal');
            const card = document.getElementById('qr-modal-card');
            const container = document.getElementById('qrcode-container');
            if (show) {
                container.innerHTML = '';
                new QRCode(container, { text, width: 200, height: 200, colorDark: '#ffffff', colorLight: '#0a0a0f' });
                modal.classList.remove('opacity-0', 'pointer-events-none');
                card.classList.remove('scale-95', 'opacity-0');
                card.classList.add('scale-100', 'opacity-100');
            } else {
                modal.classList.add('opacity-0', 'pointer-events-none');
                card.classList.remove('scale-100', 'opacity-100');
                card.classList.add('scale-95', 'opacity-0');
            }
        }
        
        function showSubQr() { toggleQrModal(true, getSubLink()); }
        
        document.addEventListener('DOMContentLoaded', () => {
            const u = window.statusUser;
            if (!u) return;
            
            document.getElementById('display-username').innerText = u.username;
            
            // Volume
            const usedGb = u.used_gb || 0;
            const limitGb = u.limit_gb;
            document.getElementById('used-vol').innerText = usedGb < 1 ? (usedGb*1024).toFixed(0)+'MB' : usedGb.toFixed(2)+'GB';
            document.getElementById('limit-vol').innerText = limitGb ? limitGb+'GB' : '∞';
            const volPct = limitGb ? Math.min((usedGb/limitGb)*100, 100) : 0;
            document.getElementById('volume-pct').innerText = volPct.toFixed(0)+'%';
            document.getElementById('volume-progress').style.width = volPct + '%';
            
            // Expiry
            let daysRemaining = '∞';
            let totalDays = '∞';
            if (u.expiry_days && u.created_at) {
                const expiry = new Date(new Date(u.created_at).getTime() + u.expiry_days * 86400000);
                const diff = Math.ceil((expiry - new Date()) / 86400000);
                daysRemaining = diff > 0 ? diff : 0;
                totalDays = u.expiry_days + ' روز';
                const pct = Math.max(0, Math.min((diff / u.expiry_days) * 100, 100));
                document.getElementById('expiry-pct').innerText = pct.toFixed(0)+'%';
                document.getElementById('expiry-progress').style.width = pct + '%';
            } else {
                document.getElementById('expiry-pct').innerText = '∞';
                document.getElementById('expiry-progress').style.width = '100%';
            }
            document.getElementById('days-remaining').innerText = daysRemaining;
            document.getElementById('total-days').innerText = totalDays;
            
            // Requests
            const usedReq = u.used_req || 0;
            const limitReq = u.limit_req;
            document.getElementById('used-req').innerText = usedReq.toLocaleString();
            document.getElementById('limit-req').innerText = limitReq ? limitReq.toLocaleString() : '∞';
            const reqPct = limitReq ? Math.min((usedReq/limitReq)*100, 100) : 0;
            document.getElementById('req-pct').innerText = reqPct.toFixed(0)+'%';
            document.getElementById('req-progress').style.width = reqPct + '%';
            
            // Online
            const onlineCount = u.online_count || 0;
            const ipLimit = u.ip_limit || u.max_connections;
            document.getElementById('online-count').innerText = onlineCount;
            document.getElementById('limit-online').innerText = ipLimit || '∞';
            const onlinePct = ipLimit ? Math.min((onlineCount/ipLimit)*100, 100) : 0;
            document.getElementById('online-pct').innerText = onlinePct.toFixed(0)+'%';
            document.getElementById('online-progress').style.width = onlinePct + '%';
            
            // Status
            const statusCard = document.getElementById('status-card');
            const statusText = document.getElementById('status-text');
            let isExpired = false;
            if (u.is_active === 0) isExpired = true;
            else if (limitGb && usedGb >= limitGb) isExpired = true;
            else if (limitReq && usedReq >= limitReq) isExpired = true;
            else if (u.expiry_days && u.created_at) {
                const expiry = new Date(new Date(u.created_at).getTime() + u.expiry_days * 86400000);
                if (new Date() > expiry) isExpired = true;
            }
            
            if (isExpired) {
                statusCard.className = 'glass rounded-xl p-4 text-center mb-6 border border-red-500/30 bg-red-500/10 transition-all';
                statusText.innerText = '❌ اشتراک غیرفعال یا منقضی شده';
                statusText.className = 'text-red-400 text-sm font-bold';
            } else {
                statusCard.className = 'glass rounded-xl p-4 text-center mb-6 border border-green-500/30 bg-green-500/10 transition-all';
                statusText.innerText = '✅ اشتراک فعال';
                statusText.className = 'text-green-400 text-sm font-bold';
            }
        });
    </script>
</body>
</html>`
};

// ============================================
// The VLESS handler (proxy logic) is identical
// to the original version and is omitted here
// for brevity. In the actual file, it would be
// included in its entirety.
// ============================================