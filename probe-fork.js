const { fork } = require('child_process');
const path = require('path');
const dbPath = process.argv[2];
console.log('argv:', process.argv.slice(1));
console.log('ELECTRON_RUN_AS_NODE:', process.env.ELECTRON_RUN_AS_NODE);
const t0 = Date.now();
const child = fork(path.join(__dirname, 'out', 'main', 'searchWorker.js'), [dbPath], {
  stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  env: { ...process.env }
});
child.on('message', (m) => {
  console.log(`[${Date.now()-t0}ms] MSG`, JSON.stringify(m).slice(0, 300));
  if (m.ready) {
    child.send({ query: 'John 3:16', translation: 'KJV', limit: 5 });
  } else if (m.result || m.error || m.fatal) {
    setTimeout(() => child.kill(), 50);
  }
});
child.on('error', (e) => console.log('CHILD ERROR', e));
child.on('exit', (c, s) => { console.log(`[${Date.now()-t0}ms] EXIT`, c, s); process.exit(0); });
setTimeout(() => { console.log(`[${Date.now()-t0}ms] TIMEOUT - child silent, killing`); child.kill(); setTimeout(()=>process.exit(1), 500); }, 12000);
