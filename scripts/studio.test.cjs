const {chromium}=require(process.env.PLAYWRIGHT_PATH || 'C:/Users/Acer/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const fs=require('node:fs');
const out=path.resolve(__dirname,'../../baby-growth-preview/studio');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const mobile of [false,true]){
  const page=await browser.newPage({viewport:{width:mobile?390:1280,height:900},isMobile:mobile,hasTouch:mobile,acceptDownloads:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route(/^https?:/,route=>route.abort());
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
  await page.addStyleTag({content:'.hidden{display:none}.text-xs{font-size:12px}.text-sm{font-size:14px}'});
  await page.evaluate(()=>{
   FSAdapter.getMediaUrl=async id=>'data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="${id==='p0'?'#b1b890':'#c89672'}"/><circle cx="320" cy="210" r="130" fill="#fff1c9"/><circle cx="280" cy="190" r="12"/><circle cx="360" cy="190" r="12"/><path d="M270 250 Q320 300 370 250" stroke="#684e3a" stroke-width="10" fill="none"/></svg>`);
   DB.data=DB.getDemoData();DB.data.records=Array.from({length:3},(_,i)=>({id:'p'+i,childId:'c1',type:'photo',date:`2024-0${i+1}-01`,title:'今天也很开心',mediaId:'p'+i,mediaType:'image'}));renderAll();
  });
  const before=await page.evaluate(()=>JSON.stringify(DB.data));
  await page.evaluate(()=>viewMedia('p1','照片','image'));
  await page.locator('.viewer-studio-button').click();
  await page.waitForFunction(()=>!document.getElementById('studio-generate').disabled);
  assert.equal(await page.locator('.studio-photo[aria-pressed=true]').count(),1);
  await page.locator('#studio-caption').fill('今天也是可爱满分');
  await page.locator('#studio-style').selectOption('paper');
  await page.waitForFunction(()=>!document.getElementById('studio-generate').disabled);
  await page.locator('#studio-generate').click();
  await page.waitForSelector('#studio-download:not([hidden])');
  const download=page.waitForEvent('download');await page.locator('#studio-download').click();
  const png=await download;await png.saveAs(path.join(out,`meme-${mobile?'mobile':'desktop'}.png`));
  const bytes=fs.readFileSync(path.join(out,`meme-${mobile?'mobile':'desktop'}.png`));
  assert.equal(bytes.subarray(1,4).toString(),'PNG');assert.equal(bytes.readUInt32BE(16),640);assert.equal(bytes.readUInt32BE(20),640);
  await page.screenshot({path:path.join(out,`meme-ui-${mobile?'mobile':'desktop'}.png`)});
  await page.evaluate(()=>MediaStudio.close());
  await page.evaluate(()=>MediaStudio.open('video'));
  await page.locator('.studio-photo').nth(0).click();await page.locator('.studio-photo').nth(1).click();
  await page.locator('#studio-duration').selectOption('2');
  await page.locator('#studio-ratio').selectOption(mobile?'portrait':'landscape');
  await page.locator('[aria-label="第 2 张上移"]').click();
  await page.waitForFunction(()=>!document.getElementById('studio-generate').disabled);
  await page.locator('#studio-generate').click();
  try { await page.waitForSelector('#studio-download:not([hidden])',{timeout:12000}); }
  catch(error) { console.error('VIDEO STATUS',await page.locator('#studio-status').textContent(), 'FORMAT',await page.locator('#studio-format').textContent(),errors); throw error; }
  await page.waitForFunction(()=>document.getElementById('studio-video').readyState>=2);
  const dimensions=await page.locator('#studio-video').evaluate(v=>({width:v.videoWidth,height:v.videoHeight}));
  assert.deepEqual(dimensions,mobile?{width:720,height:1280}:{width:1280,height:720});
  const videoDownload=page.waitForEvent('download');await page.locator('#studio-download').click();
  const video=await videoDownload;await video.saveAs(path.join(out,`${mobile?'mobile':'desktop'}-${video.suggestedFilename()}`));
  assert.ok(fs.statSync(path.join(out,`${mobile?'mobile':'desktop'}-${video.suggestedFilename()}`)).size>1000);
  await page.locator('#studio-video').evaluate(v=>v.play());
  await page.waitForTimeout(500);
  assert.ok(await page.locator('#studio-video').evaluate(v=>v.currentTime>.1));
  await page.screenshot({path:path.join(out,`video-ui-${mobile?'mobile':'desktop'}.png`)});
  await page.locator('#studio-generate').click();await page.locator('#studio-cancel').click();
  await page.waitForFunction(()=>document.getElementById('studio-status').textContent.includes('已取消'));
  assert.equal(await page.evaluate(()=>JSON.stringify(DB.data)),before,'制作不可修改原始记录');
  assert.deepEqual(errors,[]);
  console.log('PASS',mobile?'mobile':'desktop','single photo entry, PNG, reorder, playable video, cancel, original data unchanged');
  await page.close();
 }
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
