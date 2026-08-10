#!/usr/bin/env node
/**
 * 直连 Electron 远程调试端口（默认 9333）的最小 CDP 驱动：
 *   node scripts/cdp-eval.mjs <expression>        — 在 Electron 页面里执行 JS（await 支持）
 *   node scripts/cdp-eval.mjs --shot <file.png>   — 截图保存
 * 只连 Electron 自己的页面，不启动任何外部浏览器。
 */
import { writeFileSync } from 'node:fs';

const PORT = process.env.KOMA_ELECTRON_REMOTE_DEBUGGING_PORT || '9333';

async function main() {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = list.find(t => t.type === 'page' && !t.url.startsWith('devtools://'));
  if (!page) throw new Error('no electron page found');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let seq = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, (msg) => msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result));
    ws.send(JSON.stringify({ id, method, params }));
  });

  const arg = process.argv[2];
  if (arg === '--shot') {
    const out = process.argv[3] || '/tmp/electron-shot.png';
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(out, Buffer.from(data, 'base64'));
    console.log(out);
  } else {
    const expression = process.argv.slice(2).join(' ');
    const result = await send('Runtime.evaluate', {
      expression: `(async () => { ${expression} })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      console.error('EXCEPTION:', JSON.stringify(result.exceptionDetails, null, 2).slice(0, 2000));
      process.exitCode = 1;
    } else {
      console.log(JSON.stringify(result.result?.value ?? result.result, null, 2));
    }
  }
  ws.close();
}

main().catch((e) => { console.error(e.message); process.exit(1); });
