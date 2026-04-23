// Simple local server: serves static files + proxies Anthropic API to avoid CORS
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3456;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

http.createServer((req, res) => {
  // ── Generic proxy helper ──
  function proxyTo(hostname, targetPath, extraHeaders) {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const headers = { 'content-type': 'application/json', ...extraHeaders };
      if (body.length) headers['content-length'] = body.length;
      const proxy = https.request({ hostname, port: 443, path: targetPath, method: req.method, headers }, (upstream) => {
        const fwd = { 'content-type': upstream.headers['content-type'] || 'application/json', 'access-control-allow-origin': '*' };
        if (upstream.headers['retry-after']) fwd['retry-after'] = upstream.headers['retry-after'];
        if (upstream.headers['x-ratelimit-reset-requests']) fwd['x-ratelimit-reset-requests'] = upstream.headers['x-ratelimit-reset-requests'];
        res.writeHead(upstream.statusCode, fwd);
        upstream.pipe(res);
      });
      proxy.on('error', (e) => { res.writeHead(502); res.end(JSON.stringify({ error: { message: 'Proxy error: ' + e.message } })); });
      if (body.length) proxy.write(body);
      proxy.end();
    });
  }

  // ── Proxy: /proxy/anthropic/* → https://api.anthropic.com/*
  if (req.url.startsWith('/proxy/anthropic/')) {
    proxyTo('api.anthropic.com', req.url.replace('/proxy/anthropic', ''), {
      'x-api-key': req.headers['x-api-key'] || '',
      'anthropic-version': req.headers['anthropic-version'] || '2023-06-01',
      'anthropic-dangerous-allow-browser': 'true',
    });
    return;
  }

  // ── Proxy: /proxy/deepseek/* → https://api.deepseek.com/*
  if (req.url.startsWith('/proxy/deepseek/')) {
    proxyTo('api.deepseek.com', req.url.replace('/proxy/deepseek', ''), {
      'authorization': req.headers['authorization'] || '',
    });
    return;
  }

  // ── CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type,x-api-key,anthropic-version,anthropic-dangerous-allow-browser,authorization',
    });
    res.end();
    return;
  }

  // ── Static files
  let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
  if (!fs.existsSync(filePath)) filePath = path.join(__dirname, 'index.html');

  const ext = path.extname(filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'content-type': MIME[ext] || 'text/plain' });
    res.end(data);
  });

}).listen(PORT, '0.0.0.0', () => {
  console.log(`✅ AI面试陪练 running at http://0.0.0.0:${PORT}`);
});
