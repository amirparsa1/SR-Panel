// SR Root Panel - Telegram Bot
// Deploy this as a separate Cloudflare Worker

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Handle Telegram webhook
    if (url.pathname === '/webhook' && request.method === 'POST') {
      try {
        const update = await request.json();
        await handleUpdate(update, env);
        return new Response('OK');
      } catch (e) {
        console.error('Webhook error:', e);
        return new Response('Error', { status: 500 });
      }
    }
    
    // Set webhook (one-time setup)
    if (url.pathname === '/set-webhook') {
      const webhookUrl = `${url.origin}/webhook`;
      const result = await setWebhook(webhookUrl, env);
      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response('SR Root Panel Bot is running!', { status: 200 });
  }
};

// Bot configuration
const BOT_VERSION = '2.0.0';
const GITHUB_REPO = 'amirparsa1/SR-Panel';
const GITHUB_PANEL_URL = `https://raw.githubusercontent.com/${GITHUB_REPO}/main/sr-panel.js`;

// Handle Telegram updates
async function handleUpdate(update, env) {
  if (!update.message) return;
  
  const message = update.message;
  const chatId = message.chat.id;
  const text = message.text || '';
  const userId = message.from.id;
  
  // Check if user is authorized (optional - can be disabled for public use)
  const authorizedUsers = await getAuthorizedUsers(env);
  if (authorizedUsers.length > 0 && !authorizedUsers.includes(userId)) {
    await sendMessage(chatId, '⛔ شما اجازه دسترسی ندارید.', env);
    return;
  }
  
  // Parse command
  const parts = text.trim().split(/\s+/);
  const command = parts[0].toLowerCase();
  const args = parts.slice(1);
  
  switch (command) {
    case '/start':
      await cmdStart(chatId, env);
      break;
    case '/help':
      await cmdHelp(chatId, env);
      break;
    case '/create':
      await cmdCreate(chatId, args, env);
      break;
    case '/list':
      await cmdList(chatId, env);
      break;
    case '/status':
      await cmdStatus(chatId, args, env);
      break;
    case '/update':
      await cmdUpdate(chatId, args, env);
      break;
    case '/delete':
      await cmdDelete(chatId, args, env);
      break;
    case '/reset':
      await cmdReset(chatId, args, env);
      break;
    case '/token':
      await cmdToken(chatId, args, env);
      break;
    case '/recover':
      await cmdRecover(chatId, args, env);
      break;
    case '/backup':
      await cmdBackup(chatId, env);
      break;
    default:
      // Check if it's a token being sent for new account setup
      if (text.length > 40 && text.includes('-')) {
        await handleTokenSubmission(chatId, text, env);
      } else {
        await sendMessage(chatId, '❓ دستور نامعتبر است. از /help برای مشاهده دستورات استفاده کنید.', env);
      }
  }
}

// Command handlers
async function cmdStart(chatId, env) {
  const text = `🤖 <b>به SR Root Panel خوش آمدید!</b>

نسخه: ${BOT_VERSION}

📋 <b>دستورات موجود:</b>

➕ /create - ساخت پنل جدید
📊 /list - لیست پنل‌ها
🔍 /status - وضعیت پنل
🔄 /update - آپدیت پنل
🗑 /delete - حذف پنل
🔑 /reset - بازیابی رمز عبور
🎫 /token - ثبت توکن کلودفلر
📞 /recover - بازیابی پنل
📦 /backup - بک‌آپ اطلاعات
❓ /help - راهنما

💡 <b>برای ساخت پنل:</b>
1. ابتدا توکن کلودفلر را با /token ثبت کنید
2. سپس /create را بفرستید

📞 پشتیبانی: @SR_Panel`;
  
  await sendMessage(chatId, text, env);
}

async function cmdHelp(chatId, env) {
  const text = `📖 <b>راهنمای SR Root Panel</b>

<b>🔧 ساخت پنل:</b>
1. یک اکانت کلودفلر بسازید (جیمیل فیک نزنید)
2. ایمیل خود را در کلودفلر تایید کنید
3. توکن را از لینک زیر دریافت کنید:
   https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=%5B%7B%22key%22%3A%22workers_scripts%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22workers_kv_storage%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22d1%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22account_settings%22%2C%22type%3A%22read%22%7D%2C%7B%22key%22%3A%22workers_subdomain%22%2C%22type%3A%22edit%22%7D%2C%7B%22key%22%3A%22account_analytics%22%2C%22type%3A%22read%22%7D%5D&accountId=*&zoneId=all&name=SR-Deployer-Token
4. توکن را با /token بفرستید
5. /create را بفرستید

<b>⚠️ نکات مهم:</b>
• رمز عبور اولیه را فراموش نکنید
• توکن را در جایی امن نگه دارید
• حداکثر 5 پنل می‌توانید بسازید`;
  
  await sendMessage(chatId, text, env);
}

async function cmdCreate(chatId, args, env) {
  // Get user's Cloudflare token
  const userData = await getUserData(chatId, env);
  if (!userData || !userData.cfToken) {
    await sendMessage(chatId, '❌ ابتدا توکن کلودفلر را با دستور /token ثبت کنید.', env);
    return;
  }
  
  const token = userData.cfToken;
  
  await sendMessage(chatId, '⏳ در حال ساخت پنل...', env);
  
  try {
    // Get account info
    const accInfo = await getAccountInfo(token);
    if (!accInfo.success) {
      await sendMessage(chatId, '❌ توکن نامعتبر است یا منقضی شده.', env);
      return;
    }
    
    const accountId = accInfo.accountId;
    const devSub = accInfo.subdomain;
    
    // Check panel limit
    const panels = await getPanels(chatId, env);
    if (panels.length >= 5) {
      await sendMessage(chatId, '❌ شما به حداکثر تعداد پنل (5) رسیده‌اید.', env);
      return;
    }
    
    // Create D1 database
    const uniqueSuffix = Math.random().toString(36).substring(2, 8);
    const workerName = `sr-${uniqueSuffix}`;
    const dbName = `sr-db-${uniqueSuffix}`;
    
    await sendMessage(chatId, '📦 در حال ایجاد دیتابیس...', env);
    
    const dbResult = await createDatabase(token, accountId, dbName);
    if (!dbResult.success) {
      await sendMessage(chatId, `❌ خطا در ایجاد دیتابیس: ${dbResult.error}`, env);
      return;
    }
    
    const dbUuid = dbResult.uuid;
    
    // Wait for DB to be ready
    await new Promise(r => setTimeout(r, 2000));
    
    // Fetch panel code from GitHub
    await sendMessage(chatId, '📥 در حال دریافت کد پنل...', env);
    
    const panelCode = await fetchPanelCode();
    if (!panelCode) {
      await sendMessage(chatId, '❌ خطا در دریافت کد پنل از گیت‌هاب.', env);
      return;
    }
    
    // Deploy worker
    await sendMessage(chatId, '🚀 در حال دیپلوی ورکر...', env);
    
    const deployResult = await deployWorker(token, accountId, workerName, panelCode, dbUuid);
    if (!deployResult.success) {
      await sendMessage(chatId, `❌ خطا در دیپلوی: ${deployResult.error}`, env);
      return;
    }
    
    // Enable subdomain
    await enableSubdomain(token, accountId, workerName);
    
    // Save panel info
    const panelUrl = `https://${workerName}.${devSub}.workers.dev/panel`;
    await savePanel(chatId, {
      workerName,
      dbName,
      dbUuid,
      accountId,
      subdomain: devSub,
      url: panelUrl,
      createdAt: new Date().toISOString()
    }, env);
    
    const successText = `✅ <b>پنل با موفقیت ساخته شد!</b>

🔗 <b>لینک پنل:</b>
<a href="${panelUrl}">${panelUrl}</a>

⚠️ <b>نکته مهم:</b>
5 دقیقه صبر کنید و سپس وارد شوید.
رمز عبور اولیه خود را تعیین کنید و فراموش نکنید!

🆔 نام ورکر: <code>${workerName}</code>`;
    
    await sendMessage(chatId, successText, env);
    
  } catch (error) {
    await sendMessage(chatId, `❌ خطا: ${error.message}`, env);
  }
}

async function cmdList(chatId, env) {
  const panels = await getPanels(chatId, env);
  
  if (panels.length === 0) {
    await sendMessage(chatId, '📭 هیچ پنلی یافت نشد. با /create پنل جدید بسازید.', env);
    return;
  }
  
  let text = `📊 <b>لیست پنل‌ها (${panels.length}/5):</b>\n\n`;
  
  panels.forEach((panel, index) => {
    text += `${index + 1}. <b>${panel.workerName}</b>\n`;
    text += `   🔗 <a href="${panel.url}">ورود</a>\n`;
    text += `   📅 ${new Date(panel.createdAt).toLocaleDateString('fa-IR')}\n\n`;
  });
  
  await sendMessage(chatId, text, env);
}

async function cmdStatus(chatId, args, env) {
  const panels = await getPanels(chatId, env);
  
  if (panels.length === 0) {
    await sendMessage(chatId, '📭 هیچ پنلی یافت نشد.', env);
    return;
  }
  
  let workerName = args[0];
  if (!workerName) {
    workerName = panels[0].workerName;
  }
  
  const panel = panels.find(p => p.workerName === workerName);
  if (!panel) {
    await sendMessage(chatId, '❌ پنل یافت نشد.', env);
    return;
  }
  
  const text = `📊 <b>وضعیت پنل</b>

🆔 نام: <code>${panel.workerName}</code>
🔗 لینک: <a href="${panel.url}">${panel.url}</a>
📦 دیتابیس: <code>${panel.dbName}</code>
📅 تاریخ ساخت: ${new Date(panel.createdAt).toLocaleDateString('fa-IR')}
🟢 وضعیت: فعال`;
  
  await sendMessage(chatId, text, env);
}

async function cmdUpdate(chatId, args, env) {
  const userData = await getUserData(chatId, env);
  if (!userData || !userData.cfToken) {
    await sendMessage(chatId, '❌ ابتدا توکن کلودفلر را ثبت کنید.', env);
    return;
  }
  
  const panels = await getPanels(chatId, env);
  if (panels.length === 0) {
    await sendMessage(chatId, '📭 هیچ پنلی یافت نشد.', env);
    return;
  }
  
  let workerName = args[0];
  if (!workerName) {
    workerName = panels[0].workerName;
  }
  
  const panel = panels.find(p => p.workerName === workerName);
  if (!panel) {
    await sendMessage(chatId, '❌ پنل یافت نشد.', env);
    return;
  }
  
  await sendMessage(chatId, '⏳ در حال آپدیت...', env);
  
  try {
    // Fetch latest code
    const panelCode = await fetchPanelCode();
    if (!panelCode) {
      await sendMessage(chatId, '❌ خطا در دریافت کد جدید.', env);
      return;
    }
    
    // Get bindings
    const bindings = await getBindings(userData.cfToken, panel.accountId, panel.workerName);
    
    // Deploy
    const result = await deployWorkerWithBindings(
      userData.cfToken,
      panel.accountId,
      panel.workerName,
      panelCode,
      bindings
    );
    
    if (result.success) {
      await sendMessage(chatId, '✅ پنل با موفقیت آپدیت شد!', env);
    } else {
      await sendMessage(chatId, `❌ خطا: ${result.error}`, env);
    }
  } catch (error) {
    await sendMessage(chatId, `❌ خطا: ${error.message}`, env);
  }
}

async function cmdDelete(chatId, args, env) {
  const userData = await getUserData(chatId, env);
  if (!userData || !userData.cfToken) {
    await sendMessage(chatId, '❌ ابتدا توکن کلودفلر را ثبت کنید.', env);
    return;
  }
  
  const panels = await getPanels(chatId, env);
  if (panels.length === 0) {
    await sendMessage(chatId, '📭 هیچ پنلی یافت نشد.', env);
    return;
  }
  
  let workerName = args[0];
  if (!workerName) {
    workerName = panels[0].workerName;
  }
  
  const panel = panels.find(p => p.workerName === workerName);
  if (!panel) {
    await sendMessage(chatId, '❌ پنل یافت نشد.', env);
    return;
  }
  
  await sendMessage(chatId, '⏳ در حال حذف...', env);
  
  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${panel.accountId}/workers/scripts/${panel.workerName}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${userData.cfToken}` }
      }
    );
    
    const data = await response.json();
    
    if (data.success) {
      await deletePanel(chatId, workerName, env);
      await sendMessage(chatId, '✅ پنل با موفقیت حذف شد.', env);
    } else {
      await sendMessage(chatId, `❌ خطا: ${data.errors?.[0]?.message || 'نامشخص'}`, env);
    }
  } catch (error) {
    await sendMessage(chatId, `❌ خطا: ${error.message}`, env);
  }
}

async function cmdReset(chatId, args, env) {
  const userData = await getUserData(chatId, env);
  if (!userData || !userData.cfToken) {
    await sendMessage(chatId, '❌ ابتدا توکن کلودفلر را ثبت کنید.', env);
    return;
  }
  
  const panels = await getPanels(chatId, env);
  if (panels.length === 0) {
    await sendMessage(chatId, '📭 هیچ پنلی یافت نشد.', env);
    return;
  }
  
  let workerName = args[0];
  if (!workerName) {
    workerName = panels[0].workerName;
  }
  
  const panel = panels.find(p => p.workerName === workerName);
  if (!panel) {
    await sendMessage(chatId, '❌ پنل یافت نشد.', env);
    return;
  }
  
  await sendMessage(chatId, '⏳ در حال بازیابی رمز عبور...', env);
  
  try {
    // Reset password in D1
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${panel.accountId}/d1/database/${panel.dbUuid}/query`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${userData.cfToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sql: "DELETE FROM settings WHERE key = 'panel_password'"
        })
      }
    );
    
    const data = await response.json();
    
    if (data.success) {
      await sendMessage(chatId, '✅ رمز عبور بازنشانی شد. وارد پنل شوید و رمز جدید تعیین کنید.', env);
    } else {
      await sendMessage(chatId, `❌ خطا: ${data.errors?.[0]?.message || 'نامشخص'}`, env);
    }
  } catch (error) {
    await sendMessage(chatId, `❌ خطا: ${error.message}`, env);
  }
}

async function cmdToken(chatId, args, env) {
  if (args.length === 0) {
    await sendMessage(chatId, `🎫 برای ثبت توکن کلودفلر:

1. به لینک زیر بروید:
https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=%5B%7B%22key%22%3A%22workers_scripts%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22workers_kv_storage%22%2C%22type%3A%22edit%22%7D%2C%7B%22key%22%3A%22d1%22%2C%22type%3A%22edit%22%7D%2C%7B%22key%22%3A%22account_settings%22%2C%22type%3A%22read%22%7D%2C%7B%22key%22%3A%22workers_subdomain%22%2C%22type%3A%22edit%22%7D%2C%7B%22key%22%3A%22account_analytics%22%2C%22type%3A%22read%22%7D%5D&accountId=*&zoneId=all&name=SR-Deployer-Token

2. توکن را کپی کنید
3. دستور زیر را بفرستید:
/token YOUR_TOKEN_HERE`, env);
    return;
  }
  
  const token = args[0];
  
  // Validate token
  await sendMessage(chatId, '⏳ در حال بررسی توکن...', env);
  
  const accInfo = await getAccountInfo(token);
  if (!accInfo.success) {
    await sendMessage(chatId, '❌ توکن نامعتبر است.', env);
    return;
  }
  
  // Save token
  await saveUserData(chatId, { cfToken: token }, env);
  
  await sendMessage(chatId, `✅ توکن با موفقیت ثبت شد!

اکانت: ${accInfo.accountName}
ساب‌دامین: ${accInfo.subdomain}

حالا می‌توانید با /create پنل بسازید.`, env);
}

async function cmdRecover(chatId, args, env) {
  const userData = await getUserData(chatId, env);
  if (!userData || !userData.cfToken) {
    await sendMessage(chatId, '❌ ابتدا توکن کلودفلر را ثبت کنید.', env);
    return;
  }
  
  await sendMessage(chatId, '🔧 راهنمای بازیابی پنل:

اگر پنل شما کار نمی‌کند:
1. با /update پنل را آپدیت کنید
2. با /reset رمز عبور را بازنشانی کنید
3. اگه مشکل حل نشد، پنل را با /delete حذف کنید و با /create جدید بسازید

⚠️ توجه: حذف پنل، دیتابیس و اطلاعات کاربران را پاک می‌کند!', env);
}

async function cmdBackup(chatId, env) {
  const panels = await getPanels(chatId, env);
  
  if (panels.length === 0) {
    await sendMessage(chatId, '📭 هیچ پنلی یافت نشد.', env);
    return;
  }
  
  let backupData = {
    userId: chatId,
    exportDate: new Date().toISOString(),
    panels: panels
  };
  
  const backupJson = JSON.stringify(backupData, null, 2);
  
  // Send as file
  const formData = new FormData();
  formData.append('chat_id', chatId);
  formData.append('document', new Blob([backupJson], { type: 'application/json' }), 'sr-panel-backup.json');
  formData.append('caption', '📦 بک‌آپ پنل‌های SR Root Panel');
  
  await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendDocument`, {
    method: 'POST',
    body: formData
  });
}

// Handle token submission
async function handleTokenSubmission(chatId, token, env) {
  await sendMessage(chatId, '⏳ در حال بررسی توکن...', env);
  
  const accInfo = await getAccountInfo(token);
  if (!accInfo.success) {
    await sendMessage(chatId, '❌ توکن نامعتبر است. لطفاً توکن صحیح را بفرستید.', env);
    return;
  }
  
  await saveUserData(chatId, { cfToken: token }, env);
  
  await sendMessage(chatId, `✅ توکن ثبت شد!

اکانت: ${accInfo.accountName}
ساب‌دامین: ${accInfo.subdomain}

برای ساخت پنل /create را بفرستید.`, env);
}

// Cloudflare API helpers
async function getAccountInfo(token) {
  try {
    const accRes = await fetch('https://api.cloudflare.com/client/v4/accounts', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const accData = await accRes.json();
    
    if (!accData.success || !accData.result || accData.result.length === 0) {
      return { success: false };
    }
    
    const accountId = accData.result[0].id;
    const accountName = accData.result[0].name;
    
    // Get subdomain
    let subdomain = null;
    const subRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/subdomain`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const subData = await subRes.json();
    
    if (subData.success && subData.result && subData.result.subdomain) {
      subdomain = subData.result.subdomain;
    } else {
      // Create subdomain
      const newSub = `sr-${Math.random().toString(36).substring(2, 8)}`;
      const createSub = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/subdomain`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ subdomain: newSub })
      });
      const createSubData = await createSub.json();
      if (createSubData.success) {
        subdomain = newSub;
      }
    }
    
    return {
      success: true,
      accountId,
      accountName,
      subdomain
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function createDatabase(token, accountId, dbName) {
  try {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: dbName })
    });
    
    const data = await response.json();
    
    if (data.success) {
      return { success: true, uuid: data.result.uuid };
    } else {
      return { success: false, error: data.errors?.[0]?.message || 'Unknown error' };
    }
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function fetchPanelCode() {
  try {
    const response = await fetch(`${GITHUB_PANEL_URL}?t=${Date.now()}`);
    if (response.ok) {
      return await response.text();
    }
    return null;
  } catch (e) {
    return null;
  }
}

async function deployWorker(token, accountId, workerName, code, dbUuid) {
  try {
    const metadata = {
      main_module: 'sr-panel.js',
      compatibility_date: '2024-02-08',
      bindings: [
        { type: 'd1', name: 'DB', id: dbUuid },
        { type: 'secret_text', name: 'CF_API_TOKEN', text: token },
        { type: 'secret_text', name: 'CF_ACCOUNT_ID', text: accountId }
      ]
    };
    
    const formData = new FormData();
    formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    formData.append('sr-panel.js', new Blob([code], { type: 'application/javascript+module' }), 'sr-panel.js');
    
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${workerName}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
      body: formData
    });
    
    const data = await response.json();
    
    if (data.success) {
      return { success: true };
    } else {
      return { success: false, error: data.errors?.[0]?.message || 'Unknown error' };
    }
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function deployWorkerWithBindings(token, accountId, workerName, code, bindings) {
  try {
    const metadata = {
      main_module: 'sr-panel.js',
      compatibility_date: '2024-02-08',
      bindings: bindings
    };
    
    const formData = new FormData();
    formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    formData.append('sr-panel.js', new Blob([code], { type: 'application/javascript+module' }), 'sr-panel.js');
    
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${workerName}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
      body: formData
    });
    
    const data = await response.json();
    
    if (data.success) {
      return { success: true };
    } else {
      return { success: false, error: data.errors?.[0]?.message || 'Unknown error' };
    }
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function getBindings(token, accountId, workerName) {
  try {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${workerName}/bindings`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    const data = await response.json();
    
    if (!data.success) return [];
    
    const bindings = [];
    for (const b of data.result) {
      if (b.type === 'd1') {
        bindings.push({ type: 'd1', name: b.name, id: b.database_id || b.id });
      } else if (b.name === 'CF_API_TOKEN') {
        bindings.push({ type: 'secret_text', name: 'CF_API_TOKEN', text: token });
      } else if (b.name === 'CF_ACCOUNT_ID') {
        bindings.push({ type: 'secret_text', name: 'CF_ACCOUNT_ID', text: accountId });
      }
    }
    
    return bindings;
  } catch (e) {
    return [];
  }
}

async function enableSubdomain(token, accountId, workerName) {
  try {
    await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${workerName}/subdomain`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ enabled: true })
    });
  } catch (e) {}
}

// Telegram API helpers
async function sendMessage(chatId, text, env) {
  try {
    await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      })
    });
  } catch (e) {
    console.error('Send message error:', e);
  }
}

async function setWebhook(webhookUrl, env) {
  try {
    const response = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: webhookUrl })
    });
    
    const data = await response.json();
    return data;
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// KV Storage helpers (requires KV namespace binding: USER_DATA)
async function getUserData(chatId, env) {
  try {
    if (!env.USER_DATA) return null;
    const data = await env.USER_DATA.get(`user:${chatId}`);
    return data ? JSON.parse(data) : null;
  } catch (e) {
    return null;
  }
}

async function saveUserData(chatId, data, env) {
  try {
    if (!env.USER_DATA) return;
    const existing = await getUserData(chatId, env);
    const merged = { ...existing, ...data };
    await env.USER_DATA.put(`user:${chatId}`, JSON.stringify(merged));
  } catch (e) {}
}

async function getPanels(chatId, env) {
  try {
    if (!env.USER_DATA) return [];
    const data = await env.USER_DATA.get(`panels:${chatId}`);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
}

async function savePanel(chatId, panel, env) {
  try {
    if (!env.USER_DATA) return;
    const panels = await getPanels(chatId, env);
    panels.push(panel);
    await env.USER_DATA.put(`panels:${chatId}`, JSON.stringify(panels));
  } catch (e) {}
}

async function deletePanel(chatId, workerName, env) {
  try {
    if (!env.USER_DATA) return;
    const panels = await getPanels(chatId, env);
    const filtered = panels.filter(p => p.workerName !== workerName);
    await env.USER_DATA.put(`panels:${chatId}`, JSON.stringify(filtered));
  } catch (e) {}
}

async function getAuthorizedUsers(env) {
  try {
    if (!env.USER_DATA) return [];
    const data = await env.USER_DATA.get('authorized_users');
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
}
