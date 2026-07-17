export default {
	async fetch(request, env, ctx) {
		return new Response(
`<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SR Root Panel</title>
<link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;700;800&display=swap" rel="stylesheet">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body {
    font-family:"Vazirmatn",sans-serif;
    background-color:#070a13;
    background-image:radial-gradient(circle at 50% 0%, rgba(34,197,94,0.08) 0%, transparent 75%);
    color:#f1f5f9;
    min-height:100vh;
    display:flex;
    align-items:center;
    justify-content:center;
    overflow:hidden;
    position:relative;
}
.bg-grid {
    position:fixed; inset:0;
    background-image:
        linear-gradient(to right, rgba(34,197,94,0.04) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(34,197,94,0.04) 1px, transparent 1px);
    background-size:32px 32px;
    z-index:-2;
}
.data-stream { position:fixed; inset:0; z-index:-1; display:flex; justify-content:space-evenly; opacity:0.6; }
.stream-line { width:1px; height:100vh; background:rgba(34,197,94,0.03); position:relative; }
.stream-line::after {
    content:""; position:absolute; top:-100px; left:-1px; width:3px; height:90px;
    background:linear-gradient(to bottom, transparent, #22c55e, transparent);
    box-shadow:0 0 15px #22c55e; border-radius:50%;
    animation:data-drop 4s infinite ease-in-out;
}
.d-1::after { animation-delay: 0.5s; animation-duration: 3.5s; }
.d-2::after { animation-delay: 2.1s; animation-duration: 4.2s; }
.d-3::after { animation-delay: 0s; animation-duration: 3.8s; }
.d-4::after { animation-delay: 1.2s; animation-duration: 4.5s; }
@keyframes data-drop {
    0% { top:-10%; opacity:0; }
    30% { opacity:1; }
    70% { opacity:1; }
    100% { top:110%; opacity:0; }
}
.card {
    position:relative; z-index:1; width:min(92%,520px); padding:48px 36px; text-align:center;
    background:rgba(15, 23, 42, 0.4);
    backdrop-filter:blur(16px); -webkit-backdrop-filter:blur(16px);
    border:2px solid rgba(34,197,94,0.4); border-radius:24px;
    box-shadow: 0 10px 40px -10px rgba(0,0,0,0.8), inset 0 0 20px rgba(34,197,94,0.1);
}
.icon {
    width:86px; height:86px; margin:auto; margin-bottom:26px; border-radius:22px;
    background:rgba(34,197,94,0.1); border:2px solid rgba(34,197,94,0.5);
    display:flex; align-items:center; justify-content:center;
    box-shadow:0 0 20px rgba(34,197,94,0.2);
    animation: pulse-icon 3s infinite alternate;
}
.icon svg { width:42px; height:42px; fill:#4ade80; filter:drop-shadow(0 0 8px rgba(74,222,128,0.6)); }
@keyframes pulse-icon {
    0% { box-shadow:0 0 15px rgba(34,197,94,0.15); border-color:rgba(34,197,94,0.4); }
    100% { box-shadow:0 0 35px rgba(34,197,94,0.4); border-color:rgba(34,197,94,0.8); }
}
h1 { font-size:1.8rem; margin-bottom:18px; font-weight:800; color:#f1f5f9; }
h1 span { color:#4ade80; }
p { color:#94a3b8; line-height:1.9; font-size:0.95rem; margin-bottom:35px; }
.btn {
    display:inline-flex; align-items:center; justify-content:center; gap:10px;
    width:100%; padding:16px;
    text-decoration:none; color:#4ade80; font-size:1.05rem; font-weight:700;
    background:transparent; border:2px solid rgba(34,197,94,0.6); border-radius:14px;
    transition:all .3s ease;
}
.btn:hover { background:rgba(34,197,94,0.1); border-color:#4ade80; color:#86efac; box-shadow:0 0 25px rgba(34,197,94,0.25); }
.footer { margin-top:28px; font-size:.85rem; color:#475569; letter-spacing:1px; }
</style>
</head>
<body>
<div class="bg-grid"></div>
<div class="data-stream">
    <div class="stream-line d-1"></div>
    <div class="stream-line d-2"></div>
    <div class="stream-line d-3"></div>
    <div class="stream-line d-4"></div>
</div>
<div class="card">
    <div class="icon">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
        </svg>
    </div>
    <h1>SR Root <span>Panel</span></h1>
    <p>
        ساخت و مدیریت پنل فقط از طریق ربات تلگرام انجام می‌شود.
    </p>
    <a class="btn" href="https://t.me/SR_Panel_IR_BOT" target="_blank" rel="noopener noreferrer">
        🤖 ورود به ربات
    </a>
    <div class="footer">SR Root Panel</div>
</div>
</body>
</html>`,
			{ headers: { "Content-Type": "text/html; charset=UTF-8" } }
		);
	}
};
