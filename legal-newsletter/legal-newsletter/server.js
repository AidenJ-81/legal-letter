// ============================================================================
//  건설 법무 뉴스레터 — 백엔드 프록시 서버
// ----------------------------------------------------------------------------
//  목적: 회사 Anthropic API 키를 "서버 안"에만 보관하고, 브라우저에는 절대
//        노출하지 않는다. 프론트엔드(public/index.html)는 키 없이 이 서버의
//        /api/messages, /api/models 만 호출하고, 서버가 키를 붙여 Anthropic으로
//        대신 전달(proxy)한다.
//
//  의존성 없음: Node 18+ 내장 fetch / http / fs 만 사용 → npm install 불필요.
//
//  환경변수 (Coolify에서 설정):
//    ANTHROPIC_API_KEY  (필수)  회사 Anthropic 키. 절대 깃허브에 커밋 금지.
//    ACCESS_PASSWORD    (선택)  설정하면 사이트 전체에 Basic Auth 적용.
//    ACCESS_USER        (선택)  Basic Auth 사용자명 (기본: team)
//    PORT               (선택)  기본 3000
//    ANTHROPIC_VERSION  (선택)  기본 2023-06-01
// ============================================================================

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const ANTHROPIC_VERSION = process.env.ANTHROPIC_VERSION || '2023-06-01';
const ACCESS_USER = process.env.ACCESS_USER || 'team';
const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD || ''; // 비우면 게이트 OFF
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_BODY = 8 * 1024 * 1024; // 8MB

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff2':'font/woff2',
};

// ── (선택) Basic Auth ────────────────────────────────────────────────────────
function requireAuth(req, res) {
  if (!ACCESS_PASSWORD) return true; // 게이트 비활성: 누구나 사용 가능
  const h = req.headers['authorization'] || '';
  const m = h.match(/^Basic\s+(.+)$/i);
  if (m) {
    const decoded = Buffer.from(m[1], 'base64').toString('utf-8');
    const idx = decoded.indexOf(':');
    const u = decoded.slice(0, idx);
    const p = decoded.slice(idx + 1);
    if (u === ACCESS_USER && p === ACCESS_PASSWORD) return true;
  }
  res.writeHead(401, {
    'WWW-Authenticate': 'Basic realm="Construction Legal Newsletter"',
    'Content-Type': 'text/plain; charset=utf-8',
  });
  res.end('인증이 필요합니다.');
  return false;
}

// ── 요청 본문 읽기 ───────────────────────────────────────────────────────────
function readBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('요청 본문이 너무 큽니다')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

// ── Anthropic 프록시 (키를 서버에서 주입) ─────────────────────────────────────
async function proxyAnthropic(req, res, upstreamPath) {
  if (!ANTHROPIC_API_KEY) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      error: { type: 'config_error',
        message: '서버에 ANTHROPIC_API_KEY가 설정되지 않았습니다. Coolify 환경변수를 확인하세요.' }
    }));
    return;
  }
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': ANTHROPIC_API_KEY,
    'anthropic-version': ANTHROPIC_VERSION,
  };
  const init = { method: req.method, headers };
  if (req.method === 'POST') {
    try { init.body = await readBody(req); }
    catch (e) {
      res.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: { message: e.message } }));
      return;
    }
  }
  try {
    const upstream = await fetch('https://api.anthropic.com' + upstreamPath, init);
    const text = await upstream.text();
    res.writeHead(upstream.status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(text);
  } catch (e) {
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: { message: 'Anthropic 요청 실패: ' + e.message } }));
  }
}

// ── 정적 파일 서빙 ───────────────────────────────────────────────────────────
function serveStatic(req, res) {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(PUBLIC_DIR, path.normalize(urlPath));
  // 디렉터리 탈출 방지
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.readFile(filePath, (err, content) => {
    if (err) { // 없는 경로 → index.html 폴백
      fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (e2, html) => {
        if (e2) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
      });
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

// ── 라우팅 ───────────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  if (!requireAuth(req, res)) return;

  const urlPath = (req.url || '/').split('?')[0];

  if (req.method === 'POST' && urlPath === '/api/messages') {
    return proxyAnthropic(req, res, '/v1/messages');
  }
  if (req.method === 'GET' && urlPath === '/api/models') {
    return proxyAnthropic(req, res, '/v1/models?limit=100');
  }
  if (req.method === 'GET' && urlPath === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, keyConfigured: !!ANTHROPIC_API_KEY, authGate: !!ACCESS_PASSWORD }));
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`✅ 법무 뉴스레터 서버 실행 중 — http://localhost:${PORT}`);
  if (!ANTHROPIC_API_KEY) {
    console.warn('⚠  ANTHROPIC_API_KEY 미설정 — 수집/모델 호출이 실패합니다. (키 구매 후 환경변수 등록 필요)');
  }
  console.log(ACCESS_PASSWORD
    ? `🔒 접근 제한(Basic Auth) 활성화 — 사용자: ${ACCESS_USER}`
    : '🔓 접근 제한 없음 — URL을 아는 누구나 사용 가능 (사내망/Coolify 보호 권장)');
});
