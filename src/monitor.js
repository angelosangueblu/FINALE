#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

function parseArgs() {
  const args = process.argv.slice(2);
  const configIndex = args.indexOf('--config');
  const configPath = configIndex >= 0 ? args[configIndex + 1] : './config.json';
  return { configPath: path.resolve(configPath) };
}

function loadJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (error) {
    console.error(`[ERRORE] JSON non valido: ${filePath}`, error.message);
    return fallback;
  }
}

function saveJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function normalizeDiscount(value) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return NaN;
  const match = value.replace(',', '.').match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : NaN;
}

function buildProductKey(product) {
  return String(product.id || product.url || product.title || '').trim();
}

function escapeMarkdown(text) {
  return String(text).replace(/[_*\[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

async function sendTelegramNotification(telegramConfig, product, monitorName) {
  if (!telegramConfig?.botToken || !telegramConfig?.chatId) {
    console.warn('[WARN] Telegram non configurato: notifica saltata.');
    return;
  }

  const message = [
    `🚨 *Nuovo prodotto scontato*`,
    `*Monitor:* ${escapeMarkdown(monitorName)}`,
    `*Titolo:* ${escapeMarkdown(product.title || 'N/D')}`,
    `*Sconto:* ${escapeMarkdown(`${product.discount}%`)}`,
    product.url ? `*Link:* ${escapeMarkdown(product.url)}` : null,
    product.createdAt ? `*Inserito:* ${escapeMarkdown(product.createdAt)}` : null
  ].filter(Boolean).join('\n');

  const apiUrl = `https://api.telegram.org/bot${telegramConfig.botToken}/sendMessage`;
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: telegramConfig.chatId,
      text: message,
      parse_mode: 'MarkdownV2',
      disable_web_page_preview: false
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram API error ${response.status}: ${body}`);
  }
}

async function extractProducts(page, extractorScriptPath) {
  const scriptContent = fs.readFileSync(extractorScriptPath, 'utf-8');
  const products = await page.evaluate((rawScript) => {
    const wrapped = new Function(`"use strict";\n${rawScript}`);
    const result = wrapped();
    if (Array.isArray(result)) return result;
    if (Array.isArray(window.__productsResult__)) return window.__productsResult__;
    return [];
  }, scriptContent);

  if (!Array.isArray(products)) return [];

  return products.map((p) => ({
    id: p?.id,
    title: p?.title,
    url: p?.url,
    discount: normalizeDiscount(p?.discount),
    createdAt: p?.createdAt
  })).filter((p) => !Number.isNaN(p.discount));
}

async function runMonitor(browser, config, state) {
  for (const monitor of config.monitors) {
    const monitorState = state.monitors[monitor.name] || { seen: {} };
    state.monitors[monitor.name] = monitorState;

    console.log(`\n[INFO] Avvio monitor: ${monitor.name}`);
    const context = await browser.newContext({
      userAgent: config.browser?.userAgent,
      viewport: config.browser?.viewport || { width: 1400, height: 900 }
    });
    const page = await context.newPage();

    await page.goto(monitor.url, { waitUntil: 'domcontentloaded', timeout: monitor.navigationTimeoutMs || 60000 });

    while (true) {
      try {
        await page.reload({ waitUntil: 'domcontentloaded', timeout: monitor.navigationTimeoutMs || 60000 });
        if (monitor.waitForSelector) {
          await page.waitForSelector(monitor.waitForSelector, { timeout: monitor.selectorTimeoutMs || 20000 });
        }
        await page.waitForTimeout(monitor.postLoadWaitMs || 3000);

        const products = await extractProducts(page, path.resolve(monitor.extractorScriptPath));
        console.log(`[INFO] ${monitor.name}: trovati ${products.length} prodotti.`);

        for (const product of products) {
          const key = buildProductKey(product);
          if (!key) continue;

          const minDiscount = monitor.minDiscountPercent ?? config.defaults.minDiscountPercent;
          if (product.discount < minDiscount) continue;
          if (monitorState.seen[key]) continue;

          monitorState.seen[key] = {
            firstSeenAt: new Date().toISOString(),
            discount: product.discount,
            url: product.url,
            title: product.title
          };

          await sendTelegramNotification(config.notifications.telegram, product, monitor.name);
          console.log(`[NOTIFY] ${monitor.name}: ${product.title} (${product.discount}%)`);
        }

        saveJson(config.stateFilePath, state);
      } catch (error) {
        console.error(`[ERRORE] Monitor ${monitor.name}:`, error.message);
      }

      await page.waitForTimeout(monitor.refreshIntervalMs ?? config.defaults.refreshIntervalMs);
    }
  }
}

async function main() {
  const { configPath } = parseArgs();
  if (!fs.existsSync(configPath)) {
    console.error(`Config non trovata: ${configPath}`);
    process.exit(1);
  }

  const config = loadJson(configPath);
  if (!config?.monitors?.length) {
    console.error('Nessun monitor configurato in config.json');
    process.exit(1);
  }

  config.stateFilePath = path.resolve(config.stateFilePath || './state/seen-products.json');
  const state = loadJson(config.stateFilePath, { monitors: {} });

  const browser = await chromium.launch({ headless: config.browser?.headless !== false });

  process.on('SIGINT', async () => {
    console.log('\n[INFO] Chiusura in corso...');
    saveJson(config.stateFilePath, state);
    await browser.close();
    process.exit(0);
  });

  await runMonitor(browser, config, state);
}

main().catch((error) => {
  console.error('[FATAL]', error);
  process.exit(1);
});
