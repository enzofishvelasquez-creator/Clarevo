// Proxy mínimo: expõe o PostgREST no caminho /rest/v1, como o Supabase, para o cliente supabase-js.
const http = require('http');
const [, , listenPort, targetPort] = process.argv;
http
  .createServer((req, res) => {
    const path = req.url.replace(/^\/rest\/v1/, '') || '/';
    const proxied = http.request({ host: '127.0.0.1', port: Number(targetPort), path, method: req.method, headers: req.headers }, (r) => {
      res.writeHead(r.statusCode, r.headers);
      r.pipe(res);
    });
    proxied.on('error', (e) => {
      res.writeHead(502);
      res.end(String(e));
    });
    req.pipe(proxied);
  })
  .listen(Number(listenPort));
