// scanRoutes.js
const fs = require('fs');
const path = require('path');
const { pathToRegexp } = require('path-to-regexp');

const root = process.cwd();

function walk(dir) {
  const files = fs.readdirSync(dir);
  files.forEach(f => {
    const full = path.join(dir, f);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      // skip node_modules
      if (f === 'node_modules') return;
      walk(full);
    } else if (full.endsWith('.js')) {
      scanFile(full);
    }
  });
}

function scanFile(file) {
  const txt = fs.readFileSync(file, 'utf8');
  // naive regex to capture strings inside app.use(...), app.get('...'), router.post('...') etc.
  const routeRegex = /(?:app|router)\.(?:use|get|post|put|delete|patch)\s*\(\s*(['"`])([^'"`]+)\1/g;
  let m;
  while ((m = routeRegex.exec(txt)) !== null) {
    const route = m[2];
    try {
      pathToRegexp(route);
    } catch (err) {
      console.error('---');
      console.error('Invalid route detected in file:', file);
      console.error('Offending route string:', route);
      console.error('Error:', err.message);
      process.exitCode = 2;
    }
  }
}

// run
console.log('Scanning project for malformed route strings...');
walk(root);
console.log('Scan complete. If nothing printed above, no obvious malformed route strings were found by this scanner.');
