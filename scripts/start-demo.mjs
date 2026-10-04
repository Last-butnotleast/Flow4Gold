import {spawn} from 'node:child_process';
const children=[spawn(process.execPath,['server/demo-server.mjs'],{stdio:'inherit'}),spawn('npm',['--prefix','visualizer','run','dev'],{stdio:'inherit'})];
let stopping=false;
function stop(code=0){if(stopping)return;stopping=true;for(const child of children)child.kill('SIGTERM');process.exitCode=code;}
for(const child of children)child.on('exit',code=>stop(code??0));
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
