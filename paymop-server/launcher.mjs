import { spawn } from 'child_process';
import path from 'path';
const wd = path.resolve();
const child = spawn(process.execPath, ['server.js'], { cwd: wd, detached: true, stdio: 'ignore' });
child.unref();
console.log('launched server pid=' + child.pid);
