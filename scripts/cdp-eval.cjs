/**
 * 在运行中的 Koma Electron 渲染进程里执行一段 JS 并回传结果。
 *
 * 项目规则（AGENTS.md）要求所有对本应用的验证都走 Electron 自己的调试端口，
 * 不允许拿普通浏览器开前端。这个脚本就是那条通道的最小实现：
 *   node scripts/cdp-eval.cjs <脚本文件路径>
 * 脚本内容按 async 上下文执行，返回值会被 JSON 序列化打印出来。
 *
 * 端口：KOMA_ELECTRON_REMOTE_DEBUGGING_PORT，默认 9333。
 */
const fs = require('node:fs');
const WebSocket = require('ws');

const PORT = process.env.KOMA_ELECTRON_REMOTE_DEBUGGING_PORT || '9333';
const ENDPOINT = `http://127.0.0.1:${PORT}`;

/**
 * 选目标页面。默认取主应用窗口；传 --target=<子串> 可选内置窗口
 * （如番茄达人中心那个隐藏 BrowserWindow），按 title / url 匹配。
 */
async function findAppTarget(match) {
  const res = await fetch(`${ENDPOINT}/json/list`);
  const targets = await res.json();
  const pages = targets.filter(
    t => t.type === 'page' && t.webSocketDebuggerUrl && !t.url.startsWith('devtools://'),
  );
  if (pages.length === 0) {
    throw new Error(`未找到应用页面（${ENDPOINT}）。Electron 开发实例是否在运行？`);
  }
  if (!match) {
    return pages.find(p => p.url.includes('localhost')) || pages[0];
  }
  const hit = pages.find(p => `${p.title} ${p.url}`.includes(match));
  if (!hit) {
    throw new Error(`未找到匹配 "${match}" 的页面。当前有：${pages.map(p => p.title).join(' / ')}`);
  }
  return hit;
}

function evaluate(wsUrl, expression) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error('CDP 执行超时（60s）'));
    }, 60_000);

    ws.on('open', () => {
      ws.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: {
          expression,
          awaitPromise: true,
          returnByValue: true,
          userGesture: true,
        },
      }));
    });

    ws.on('message', raw => {
      const msg = JSON.parse(raw.toString());
      if (msg.id !== 1) return;
      clearTimeout(timer);
      ws.close();
      if (msg.error) return reject(new Error(`CDP 错误: ${JSON.stringify(msg.error)}`));
      const result = msg.result;
      if (result.exceptionDetails) {
        const detail = result.exceptionDetails;
        return reject(new Error(
          `页面内抛错: ${detail.exception?.description || detail.text || JSON.stringify(detail)}`,
        ));
      }
      resolve(result.result?.value);
    });

    ws.on('error', err => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  const targetArg = args.find(a => a.startsWith('--target='));
  const scriptPath = args.find(a => !a.startsWith('--'));
  if (!scriptPath) {
    console.error('用法: node scripts/cdp-eval.cjs [--target=<标题或URL子串>] <脚本文件路径>');
    process.exit(1);
  }
  const body = fs.readFileSync(scriptPath, 'utf8');
  const page = await findAppTarget(targetArg ? targetArg.slice('--target='.length) : undefined);
  console.error(`[cdp-eval] target: ${page.title} (${page.url})`);
  // 包一层 async IIFE，脚本里可以直接用 await 与 return
  const value = await evaluate(page.webSocketDebuggerUrl, `(async () => {\n${body}\n})()`);
  console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 2));
}

main().catch(err => {
  console.error('[cdp-eval] 失败:', err.message);
  process.exit(1);
});
