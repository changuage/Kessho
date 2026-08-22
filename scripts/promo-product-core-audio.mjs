import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('promo-capture-v3-artifacts');
fs.mkdirSync(OUT, { recursive: true });
const url = 'http://127.0.0.1:5173/?engine=core-product&parity=1&capture=1';
const logs = [];

function stats(left, right) {
  let peak = 0, sum = 0;
  for (let i = 0; i < left.length; i++) {
    const l = left[i] || 0, r = right[i] || 0;
    peak = Math.max(peak, Math.abs(l), Math.abs(r)); sum += l*l + r*r;
  }
  return { peak, rms: Math.sqrt(sum / Math.max(1, left.length * 2)) };
}
function writeFloatWav(file, left, right, sampleRate) {
  const frames=Math.min(left.length,right.length), channels=2, blockAlign=8, dataBytes=frames*blockAlign;
  const b=Buffer.alloc(44+dataBytes); b.write('RIFF',0); b.writeUInt32LE(36+dataBytes,4); b.write('WAVE',8);
  b.write('fmt ',12); b.writeUInt32LE(16,16); b.writeUInt16LE(3,20); b.writeUInt16LE(channels,22);
  b.writeUInt32LE(sampleRate,24); b.writeUInt32LE(sampleRate*blockAlign,28); b.writeUInt16LE(blockAlign,32); b.writeUInt16LE(32,34);
  b.write('data',36); b.writeUInt32LE(dataBytes,40); let o=44;
  for(let i=0;i<frames;i++){b.writeFloatLE(Number.isFinite(left[i])?left[i]:0,o);o+=4;b.writeFloatLE(Number.isFinite(right[i])?right[i]:0,o);o+=4;}
  fs.writeFileSync(file,b);
}

const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding']});
const page=await browser.newPage(); page.setDefaultTimeout(90000);
page.on('console',m=>logs.push(`[${m.type()}] ${m.text()}`)); page.on('pageerror',e=>logs.push(`[pageerror] ${e.message}`));
try {
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForFunction(()=>Boolean(window.__kesshoSonicParity?.capture)||Boolean(document.documentElement.dataset.coreProductRuntimeError),null,{timeout:90000});
  const diagnostic=await page.evaluate(()=>({harness:Boolean(window.__kesshoSonicParity?.capture),phase:document.documentElement.dataset.coreProductRuntimePhase??null,error:document.documentElement.dataset.coreProductRuntimeError??null}));
  logs.push(`[diagnostic] ${JSON.stringify(diagnostic)}`); if(!diagnostic.harness) throw new Error(`Product Core parity harness unavailable: ${JSON.stringify(diagnostic)}`);
  const capture=await page.evaluate(async()=>window.__kesshoSonicParity.capture({
    durationMs:2600, settleMs:200, trackId:'mix', statePatch:{}, stateEvents:[],
    manualNotes:[
      {source:'pad1',midi:48,velocity:0.72,durationMs:2200},
      {source:'pad1',midi:55,velocity:0.62,durationMs:2200},
      {source:'pad2',midi:60,velocity:0.58,durationMs:2200},
      {source:'pad2',midi:64,velocity:0.54,durationMs:2200},
      {source:'lead1',midi:72,velocity:0.34,durationMs:900}
    ],
    manualDrumTriggers:[], manualTriggerDelayMs:80, manualWarmup:false
  }));
  const s=stats(capture.left,capture.right); logs.push(`[capture] ${JSON.stringify({sampleRate:capture.sampleRate,frames:capture.frames,...s})}`);
  if(!(s.rms>0.00005)) throw new Error(`Product Core capture is silent: ${JSON.stringify(s)}`);
  writeFloatWav(path.join(OUT,'product-core-source.wav'),capture.left,capture.right,capture.sampleRate);
  fs.writeFileSync(path.join(OUT,'product-core-audio-manifest.json'),JSON.stringify({source:'Product Core parity harness',sampleRate:capture.sampleRate,frames:capture.frames,...s},null,2));
  await page.evaluate(()=>window.__kesshoSonicParity?.teardown?.()).catch(()=>{});
} catch(error){logs.push(`[fatal] ${error?.stack||error}`);process.exitCode=1;} finally {fs.writeFileSync(path.join(OUT,'product-core-audio.log'),logs.join('\n')+'\n');await browser.close().catch(()=>{});}
