process.env.EUROFY_DATABASE_MODE='pglite';
process.env.EUROFY_SERVE_STORE='1';
process.env.EUROFY_LOCAL_ONLY='1';
process.env.ALLOWED_ORIGINS='';
await import('./server.js');
