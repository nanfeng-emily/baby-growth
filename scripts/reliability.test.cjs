const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
const elements = new Map();
function element(id) {
  if (!elements.has(id)) {
    const classes = new Set();
    elements.set(id, { textContent: '', innerHTML: '', value: '', style: { setProperty() {} }, dataset: {},
      classList: { add: x => classes.add(x), remove: x => classes.delete(x), contains: x => classes.has(x), toggle: (x, force) => force ? classes.add(x) : classes.delete(x) },
      querySelector: () => element(id + '-child'), querySelectorAll: () => [], addEventListener() {}, getContext: () => ({}) });
  }
  return elements.get(id);
}
const context = vm.createContext({ console, setTimeout, clearTimeout, Blob, URL, crypto: require('node:crypto').webcrypto,
  window: {}, document: { readyState: 'loading', addEventListener() {}, getElementById: element, querySelectorAll: () => [] },
  Chart: function() { this.destroy = () => {}; }, requestAnimationFrame: fn => fn(), confirm: () => true });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'growth-standards.js'), 'utf8'), context);
vm.runInContext(script, context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'enhancements.js'), 'utf8'), context);
const run = code => vm.runInContext(code, context);
function directory(initial = {}) {
  const files = new Map(Object.entries(initial));
  const state = { files, failWrite: false, writes: [] };
  state.getFileHandle = async (name, options = {}) => {
    if (!files.has(name) && !options.create) throw Object.assign(new Error('missing'), { name: 'NotFoundError' });
    return { getFile: async () => new Blob([files.get(name)]), createWritable: async () => {
      let pending;
      return { write: async value => { if (state.failWrite && name === 'db.json') throw new Error('disk full'); pending = typeof value === 'string' ? value : await value.text(); },
        close: async () => { files.set(name, pending); state.writes.push(name); }, abort: async () => {} };
    }};
  };
  return state;
}
async function test(name, fn) { await fn(); console.log('PASS', name); }
(async () => {
  const data = JSON.stringify({ children: [{id:'c1',nickname:'宝贝',birthdate:'2024-01-01',gender:'M'}], activeChildId:'c1', records:[], milestones:[] });
  await test('损坏的数据文件停止写入且保留原文', async () => {
    context.root = directory({'db.json':'{broken'});
    run('FSAdapter.rootDir = root');
    await assert.rejects(run('FSAdapter.loadDB()'));
    await assert.rejects(run('FSAdapter.saveDB({})'));
    assert.equal(context.root.files.get('db.json'), '{broken');
    assert.equal(context.root.writes.length, 0);
  });
  await test('不完整档案不会被空数据覆盖', async () => {
    context.root = directory({'db.json':'{"children":[],"records":[]}'});
    run('FSAdapter.rootDir = root');
    await assert.rejects(run('DB.load()'));
    assert.equal(context.root.writes.length, 0);
  });
  await test('首次连接空文件夹可创建档案', async () => {
    context.root = directory(); run('FSAdapter.rootDir = root');
    await run('DB.load()');
    assert.equal(JSON.parse(context.root.files.get('db.json')).children.length, 1);
  });
  await test('保存前备份且串行写入', async () => {
    context.root = directory({'db.json':data}); run('FSAdapter.rootDir = root');
    await run('DB.load()');
    await run('Promise.all([FSAdapter.saveDB({version:1}), FSAdapter.saveDB({version:2})])');
    assert.equal(JSON.parse(context.root.files.get('db.json')).version, 2);
    assert.equal(JSON.parse(context.root.files.get('db.backup.json')).version, 1);
  });
  await test('删除保存失败时恢复记录且照片仍存在', async () => {
    context.root = directory({'db.json': data, 'photo.jpg':'photo'}); run('FSAdapter.rootDir = root');
    await run('DB.load();');
    run('renderAll = () => {}; DB.data.records.push({id:"r1", childId:"c1",mediaId:"photo.jpg"})');
    await run('DB.save()');
    context.root.failWrite = true;
    await assert.rejects(run('DB.removeRecord("r1")'));
    assert.equal(run('DB.data.records.length'), 1);
    assert.equal(context.root.files.get('photo.jpg'), 'photo');
    context.root.failWrite = false;
    await run('DB.removeRecord("r1")');
    assert.equal(run('DB.data.records.length'), 0);
    assert.equal(JSON.parse(context.root.files.get('db.backup.json')).records.length, 1);
    assert.equal(context.root.files.get('photo.jpg'), 'photo');
  });
  await test('趋势跳过缺失指标且负增长不显示加号', async () => {
    run(`DB.data.records = [
      {id:'1',childId:'c1',date:'2024-01-01',type:'measurement',measurements:{height:52}},
      {id:'2',childId:'c1',date:'2024-02-01',type:'measurement',measurements:{weight:4}},
      {id:'3',childId:'c1',date:'2024-03-01',type:'measurement',measurements:{height:51}}
    ]; currentMetric='height'; renderGrowthChart()`);
    assert.match(element('growth-trend').innerHTML, /-1\.0/);
    assert.doesNotMatch(element('growth-trend').innerHTML, /\+-/);
    run('DB.data.records=[]; renderGrowthChart()');
    assert.equal(element('current-stats').textContent, '还没有测量记录');
  });
  await test('作品草稿跨重新加载恢复选图、页序、版式和裁剪', async () => {
    context.root = directory({'db.json': data}); run('FSAdapter.rootDir=root; FSAdapter.isAvailable=true');
    await run('DB.load()');
    run(`projectDraftChildId='c1'; currentProjectType='book'; currentProjectTemplate='book-magazine';
      currentProjectPrintSize='a5-portrait'; projectSelection=new Set(['r1']);
      bookPages=[{id:'bp8',layout:1,photoIds:['r1']}]; projectCrops=new Map([['book-r1',{x:20,y:70,zoom:1.2}]]);`);
    element('project-year').value='2028';
    await run('saveProjectDraft()');
    await run('DB.load()');
    run(`getPrintablePhotoRecords=()=>[{id:'r1'}]; renderBookPageComposer=()=>{}; renderProjectTemplates=()=>{};
      renderProjectPhotoPicker=()=>{}; applyProjectPrintSize=()=>{}; openPhotoProjectModal()`);
    assert.equal(run('currentProjectType'), 'book');
    assert.equal(run('currentProjectTemplate'), 'book-magazine');
    assert.equal(run('currentProjectPrintSize'), 'a5-portrait');
    assert.equal(run('projectSelection.has("r1")'), true);
    assert.equal(run('bookPages[0].id'), 'bp8');
    assert.equal(run('projectCrops.get("book-r1").y'), 70);
    assert.equal(element('project-year').value,'2028');
  });
  await test('不支持文件夹接口时仍显示页面区块', async () => {
    const block=element('reveal-test');
    context.document.querySelectorAll = selector => selector === '.reveal' ? [block] : [];
    run('bindEvents=()=>{}');
    await run('initApp()');
    assert.equal(block.classList.contains('visible'), true);
  });
  await test('搜索组合年月及类型筛选，同时包含独立里程碑', async () => {
    run(`DB.data = {children:[{id:'c1',nickname:'宝贝'}],activeChildId:'c1',records:[
      {id:'r1',childId:'c1',type:'diary',date:'2025-03-02',title:'生日',content:'第一次吹蜡烛'},
      {id:'r2',childId:'c1',type:'photo',date:'2024-03-02',title:'生日照片'},
      {id:'r3',childId:'c2',type:'diary',date:'2025-03-02',title:'生日'}
    ],milestones:[{id:'m1',childId:'c1',name:'生日迈出第一步',date:'2025-03-03'}]};
    currentTimelineFilter='all'; timelineQuery={keyword:'生日',year:'2025',month:'03'};`);
    assert.equal(run('getTimelineEntries().length'),2);
    run("currentTimelineFilter='diary'");
    assert.equal(run('getTimelineEntries()[0].id'),'r1');
    run("timelineQuery.keyword='吹蜡烛'");
    assert.equal(run('getTimelineEntries().length'),1);
    run("timelineQuery.month='04'");
    assert.equal(run('getTimelineEntries().length'),0);
    run('resetTimelineQuery(false)');
    assert.equal(run('timelineQuery.keyword'),'');
  });
  await test('年月跳转滚动到对应记录', async () => {
    element('timeline-jump').value='2025-03';
    let scrolled=false;
    context.document.querySelector=selector => {
      assert.equal(selector,'#timeline-container [data-timeline-month="2025-03"]');
      return {scrollIntoView:() => {scrolled=true;}};
    };
    run('jumpToTimelineMonth()');
    assert.equal(scrolled,true);
  });
  await test('手机孩子菜单显示并选中当前档案', async () => {
    run('renderNav()');
    assert.match(element('mobile-child-selector').innerHTML,/宝贝/);
    assert.equal(element('mobile-child-selector').value,'c1');
  });
  function folder(name) {
    const result=directory(); result.name=name; result.kind='directory'; result.dirs=new Map();
    const get=result.getFileHandle;
    result.getFileHandle=async(name,opts) => Object.assign(await get(name,opts),{name,kind:'file'});
    result.getDirectoryHandle=async(name,opts={}) => {
      if (!result.dirs.has(name)) {
        if (!opts.create) throw Object.assign(new Error('missing'),{name:'NotFoundError'});
        result.dirs.set(name,folder(name));
      }
      return result.dirs.get(name);
    };
    result.values=async function*(){ for(const name of result.files.keys()) yield await result.getFileHandle(name); };
    return result;
  }
  await test('完整备份复制二进制媒体并可恢复，原文件夹不变', async () => {
    const source=folder('原资料');
    const sourceData=JSON.parse(data);
    sourceData.records=[{id:'r1',childId:'c1',date:'2025-03-01',type:'photo',mediaId:'photo.jpg'}];
    sourceData.photoProjects={c1:{type:'book',selected:['r1'],pages:[{id:'bp1',layout:1,photoIds:['r1']}],crops:[]}};
    source.files.set('db.json',JSON.stringify(sourceData));
    const media=await source.getDirectoryHandle('media',{create:true});
    media.files.set('photo.jpg','photo bytes');
    context.source=source; context.destination=folder('备份位置');
    const snapshot=await run('readBackupFolder(source)');
    assert.equal(snapshot.missing.length,0);
    context.snapshot=snapshot;
    const copied=await run('copyBackupSnapshot(destination,"备份",snapshot.data,snapshot.media,()=>{})');
    context.copied=copied;
    const checked=await run('readBackupFolder(copied.root)');
    assert.equal(checked.media.size,1);
    assert.equal(JSON.stringify(checked.data),JSON.stringify(sourceData));
    assert.equal(copied.mediaDir.files.get('photo.jpg'),'photo bytes');
    const target=folder('恢复位置');
    context.window.showDirectoryPicker=async()=>target;
    context.checked=checked;
    run('pendingFullBackup=checked; HandleDB.init=async()=>{}; HandleDB.set=async()=>true; FSAdapter.rootDir=source');
    await run('restoreFullBackup()');
    assert.equal(run('FSAdapter.rootDir === source'),false);
    assert.equal(run('DB.data.records[0].mediaId'),'photo.jpg');
    assert.equal(source.files.get('db.json'),JSON.stringify(sourceData));
    assert.equal(source.dirs.get('media').files.get('photo.jpg'),'photo bytes');
  });
  await test('恢复预览标出缺失媒体并禁止恢复', async () => {
    const source=folder('缺失备份'); const sourceData=JSON.parse(data);
    sourceData.records=[{id:'r1',childId:'c1',date:'2025-03-01',mediaId:'missing.jpg'}];
    source.files.set('db.json',JSON.stringify(sourceData));
    context.window.showDirectoryPicker=async()=>source;
    await run('previewFullBackup()');
    assert.match(element('backup-restore-summary').innerHTML,/missing.jpg/);
    assert.equal(element('confirm-backup-restore').disabled,true);
  });
  await test('备份清单检测截断文件且拒绝路径穿越', async () => {
    const media=context.copied.mediaDir;
    media.files.set('photo.jpg','x');
    const checked=await run('readBackupFolder(copied.root)');
    assert.match(checked.missing[0],/大小不符/);
    const invalid=JSON.parse(data);
    invalid.records=[{id:'r1',childId:'c1',date:'2025-03-01',mediaId:'../outside.jpg'}];
    context.invalid=invalid;
    assert.throws(()=>run('validateBackupData(invalid)'),/不安全/);
  });
  await test('并发读取同一媒体只打开一次文件并复用地址', async () => {
    let reads=0;
    context.concurrentMedia={getFileHandle:async()=>{reads++;return {getFile:async()=>new Blob(['photo'])};}};
    run('FSAdapter.mediaDir=concurrentMedia; FSAdapter.urlCache={};');
    const urls=await run('Promise.all(Array.from({length:8},()=>getMediaUrl("same.jpg")))');
    assert.equal(reads,1); assert.equal(new Set(urls).size,1);
    URL.revokeObjectURL(urls[0]);
  });
  await test('切换文件夹后旧读取不能写入新地址缓存', async () => {
    let release;
    const blocked=new Promise(resolve=>{release=resolve;});
    context.delayedMedia={getFileHandle:async()=>{await blocked;return {getFile:async()=>new Blob(['old'])};}};
    run('FSAdapter.mediaDir=delayedMedia; FSAdapter.urlCache={};');
    const pending=run('getMediaUrl("old.jpg")');
    await Promise.resolve();
    run('FSAdapter.mediaDir={}; FSAdapter.urlCache={};');
    release();
    assert.equal(await pending,'');
    assert.equal(run('Object.keys(FSAdapter.urlCache).length'),0);
  });
})().catch(error => { console.error(error); process.exitCode=1; });
