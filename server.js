// server.js
// A simple Node.js web server that measures latency and download speed for a given URL.
// The server exposes a JSON API at `/api/test?url=...` and serves a small
// client application to interactively run tests against popular sites like
// YouTube, ChatGPT or any URL specified by the user.  No external
// dependencies are required – everything is built using Node's built‑in
// modules.

const http = require('http');
const https = require('https');
const urlParser = require('url');
const fs = require('fs');
const path = require('path');

/**
 * Measure the Time To First Byte (TTFB) and total download time for a URL.
 *
 * Time To First Byte is the time between issuing the request and
 * receiving the first chunk of the response.  Total time includes
 * downloading the entire response body.  The sizes returned here are
 * reported in bytes and represent the amount of data transferred over
 * the wire, which allows an approximation of throughput when divided by
 * the download time.  The implementation follows the definition of
 * TTFB provided by web.dev: TTFB measures the time between the request
 * for a resource and when the first byte of a response begins to
 * arrive【631177796665592†L132-L162】.
 *
 * @param {string} testUrl Absolute URL to test (must start with http:// or https://)
 * @param {(err:Error|null,data?:object)=>void} callback
 */
function testURL(testUrl, callback) {
  try {
    const parsed = urlParser.parse(testUrl);
    const lib = parsed.protocol === 'https:' ? https : http;
    const startTime = Date.now();
    let firstByteTime = null;
    let bytesTransferred = 0;
    let hasCalledBack = false; // 防止多次调用callback

    // 添加必要的请求头
    const options = {
      ...parsed,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      },
      // 添加TLS配置
      rejectUnauthorized: false,
      timeout: 15000
    };

    const req = lib.get(options, (res) => {
      // 处理重定向
      if (res.statusCode >= 300 && res.statusCode < 400) {
        const location = res.headers.location;
        if (location && !hasCalledBack) {
          // 检查是否已经重定向过
          const redirectCount = parseInt(testUrl.match(/redirect_count=(\d+)/)?.[1] || '0');
          if (redirectCount < 3) { // 限制重定向次数
            const redirectUrl = location.startsWith('http') ? location : `${parsed.protocol}//${parsed.host}${location}`;
            const newRedirectCount = redirectCount + 1;
            const newUrl = redirectUrl + (redirectUrl.includes('?') ? '&' : '?') + `redirect_count=${newRedirectCount}`;
            hasCalledBack = true;
            testURL(newUrl, callback);
          } else {
            hasCalledBack = true;
            callback(new Error('Too many redirects'));
          }
          return;
        }
      }

      // Record the time of the first chunk of data received
      res.once('data', () => {
        firstByteTime = Date.now() - startTime;
      });
      res.on('data', (chunk) => {
        bytesTransferred += chunk.length;
      });
      res.on('end', () => {
        if (!hasCalledBack) {
          const totalTime = Date.now() - startTime;
          hasCalledBack = true;
          callback(null, {
            url: testUrl.replace(/[?&]redirect_count=\d+/, ''), // 清理URL中的重定向标记
            ttfb: firstByteTime !== null ? firstByteTime : null, 
            total: totalTime,
            bytes: bytesTransferred,
          });
        }
      });
    });
    req.on('error', (err) => {
      if (!hasCalledBack) {
        console.error(`Error testing ${testUrl}:`, err.message);
        hasCalledBack = true;
        // 添加更详细的错误信息
        if (err.code === 'ECONNRESET') {
          callback(new Error('Connection reset by server'));
        } else if (err.code === 'ETIMEDOUT') {
          callback(new Error('Connection timed out'));
        } else {
          callback(err);
        }
      }
    });
    // Abort the request if it takes longer than 15 seconds
    req.setTimeout(15000, () => {
      if (!hasCalledBack) {
        hasCalledBack = true;
        req.destroy(new Error('Request timed out'));
      }
    });
  } catch (err) {
    callback(err);
  }
}

/**
 * Serve static files from the public directory.
 *
 * @param {string} filePath Absolute path on disk
 * @param {http.ServerResponse} res
 */
function serveStatic(filePath, res) {
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
    };
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

// Create the HTTP server
const server = http.createServer((req, res) => {
  const parsedUrl = urlParser.parse(req.url, true);
  const pathname = parsedUrl.pathname || '';

  if (pathname === '/api/test') {
    // API endpoint: run a speed/latency test on the supplied URL
    const targetUrl = parsedUrl.query.url;
    if (!targetUrl) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing url parameter' }));
      return;
    }
    // Prepend https:// if the user omitted the protocol
    let fullUrl = targetUrl;
    if (!/^https?:\/\//i.test(fullUrl)) {
      fullUrl = 'https://' + fullUrl;
    }
    
    let hasResponded = false; // 防止多次响应
    
    testURL(fullUrl, (err, data) => {
      if (!hasResponded) {
        hasResponded = true;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        if (err) {
          res.end(JSON.stringify({ url: fullUrl, error: err.message }));
        } else {
          res.end(JSON.stringify(data));
        }
      }
    });
    return;
  }

  // Serve static files from the "public" directory
  const fileDir = path.join(__dirname, 'public');
  let filePath = path.join(fileDir, pathname);
  if (pathname === '/' || pathname === '') {
    filePath = path.join(fileDir, 'index.html');
  }
  serveStatic(filePath, res);
});

// Start listening on the provided port
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});