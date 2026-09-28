/* 时间线检索、手机菜单及独立文件夹备份。无需联网或额外依赖。 */
let timelineQuery = { keyword: '', year: '', month: '' };
const originalTimelineEntries = getTimelineEntries;
getTimelineEntries = function () {
  const keyword = timelineQuery.keyword.trim().toLocaleLowerCase();
  return originalTimelineEntries().filter(item => {
    const date = String(item.date || '');
    return (!timelineQuery.year || date.slice(0, 4) === timelineQuery.year)
      && (!timelineQuery.month || date.slice(5, 7) === timelineQuery.month)
      && (!keyword || `${item.title || ''}\n${item.content || ''}`.toLocaleLowerCase().includes(keyword));
  });
};
const originalRenderNav = renderNav;
renderNav = function () {
  originalRenderNav();
  const selector = document.getElementById('mobile-child-selector');
  if (!selector || !DB.data) return;
  selector.innerHTML = DB.data.children.map(child => `<option value="${escapeHtml(child.id)}">${escapeHtml(child.nickname)}</option>`).join('');
  selector.value = DB.data.activeChildId;
};
function updateTimelineQuery() {
  timelineQuery = { keyword: document.getElementById('timeline-search').value,
    year: document.getElementById('timeline-year').value, month: document.getElementById('timeline-month').value };
  renderTimeline();
}
function resetTimelineQuery(render = true) {
  timelineQuery = { keyword: '', year: '', month: '' };
  ['timeline-search', 'timeline-year', 'timeline-month'].forEach(id => { document.getElementById(id).value = ''; });
  if (render) renderTimeline();
}
function refreshTimelineControls() {
  const entries = [...DB.getRecords(), ...getMilestoneEntries()];
  const years = [...new Set(entries.map(item => String(item.date || '').slice(0, 4)).filter(year => /^\d{4}$/.test(year)))].sort().reverse();
  const select = document.getElementById('timeline-year');
  if (!years.includes(timelineQuery.year)) timelineQuery.year = '';
  select.innerHTML = '<option value="">全部年份</option>' + years.map(year => `<option value="${year}">${year}年</option>`).join('');
  select.value = timelineQuery.year;
}
function renderTimelineResults(entries) {
  const visible = currentTimelineFilter === 'photo' ? entries.filter(item => item.mediaId) : entries;
  document.getElementById('timeline-result-count').textContent = `找到 ${visible.length} 条记录`;
  const months = [...new Set(visible.map(item => String(item.date || '').slice(0, 7)).filter(month => /^\d{4}-\d{2}$/.test(month)))].sort().reverse();
  const select = document.getElementById('timeline-jump');
  const previous = select.value;
  select.innerHTML = '<option value="">选择年月</option>' + months.map(month => `<option value="${month}">${month.replace('-', '年')}月</option>`).join('');
  select.value = months.includes(previous) ? previous : '';
}
function jumpToTimelineMonth() {
  const month = document.getElementById('timeline-jump').value;
  if (!/^\d{4}-\d{2}$/.test(month)) { toast('请先选择年月'); return; }
  const target = document.querySelector(`#timeline-container [data-timeline-month="${month}"]`);
  if (target) { target.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  else toast('当前筛选中没有该年月的记录');
}

let backupBusy = false, pendingFullBackup = null;
function setBackupBusy(busy) {
  backupBusy = busy;
  ['full-backup-btn', 'restore-backup-btn', 'confirm-backup-restore', 'cancel-backup-restore'].forEach(id => {
    const button = document.getElementById(id);
    if (button) button.disabled = busy;
  });
}
function backupStatus(message) { document.getElementById('backup-status').textContent = message; }
function safeMediaName(name) {
  return typeof name === 'string' && name.length > 0 && name.length <= 255 && !/[\\/\x00-\x1f]/.test(name) && name !== '.' && name !== '..';
}
function validateBackupData(data) {
  if (!data || !Array.isArray(data.children) || !data.children.length || !Array.isArray(data.records)
    || !Array.isArray(data.milestones || [])) throw new Error('备份数据结构不完整');
  const children = new Set();
  for (const child of data.children) {
    if (!child || typeof child.id !== 'string' || !child.id || children.has(child.id)
      || typeof child.nickname !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(child.birthdate)
      || !Number.isFinite(Date.parse(child.birthdate)) || !['M', 'F'].includes(child.gender)) throw new Error('孩子档案格式不正确');
    children.add(child.id);
  }
  for (const items of [data.records, data.milestones || []]) {
    const ids = new Set();
    for (const item of items) {
      if (!item || typeof item.id !== 'string' || ids.has(item.id) || !children.has(item.childId)
        || typeof item.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(item.date)) throw new Error('记录格式或所属孩子不正确');
      ids.add(item.id);
      if (item.mediaId && !/^https?:\/\//i.test(item.mediaId) && !safeMediaName(item.mediaId)) throw new Error('媒体文件名不安全');
      if (item.measurements && Object.values(item.measurements).some(value => value !== null && (!Number.isFinite(value) || value < 0))) throw new Error('测量数据不正确');
    }
  }
  if (data.photoProjects && (typeof data.photoProjects !== 'object' || Array.isArray(data.photoProjects))) throw new Error('作品草稿格式不正确');
  for (const draft of Object.values(data.photoProjects || {})) {
    if (!draft || !Array.isArray(draft.selected) || !Array.isArray(draft.pages) || !Array.isArray(draft.crops)
      || draft.pages.some(page => !page || typeof page.id !== 'string' || !Array.isArray(page.photoIds) || ![1,2,3,4].includes(page.layout))
      || draft.crops.some(entry => !Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string' || !entry[1]
        || !['x','y','zoom'].every(key => Number.isFinite(entry[1][key])))) throw new Error('作品草稿格式不正确');
  }
  return data;
}
function referencedMedia(data) {
  return [...new Set([...data.records, ...(data.milestones || [])].map(item => item.mediaId).filter(Boolean))];
}
async function readBackupFolder(root) {
  const file = await (await root.getFileHandle('db.json')).getFile();
  const data = validateBackupData(JSON.parse(await file.text()));
  let mediaDir = null;
  try { mediaDir = await root.getDirectoryHandle('media'); }
  catch (error) { if (error.name !== 'NotFoundError') throw error; }
  const media = new Map();
  if (mediaDir) for await (const entry of mediaDir.values()) {
    if (entry.kind === 'file') media.set(entry.name, entry);
  }
  const missing = [], remote = [];
  for (const name of referencedMedia(data)) {
    if (/^https?:\/\//i.test(name)) remote.push(name);
    else if (!media.has(name)) missing.push(name);
  }
  let manifest = null;
  try { manifest = JSON.parse(await (await (await root.getFileHandle('backup-manifest.json')).getFile()).text()); }
  catch (error) { if (error.name !== 'NotFoundError') throw error; }
  if (manifest) {
    if (manifest.format !== 'baby-growth-folder' || manifest.version !== 1 || !Array.isArray(manifest.media)) throw new Error('无法识别备份清单');
    for (const item of manifest.media) {
      if (!safeMediaName(item.name) || !Number.isFinite(item.size) || item.size < 0) throw new Error('备份清单格式错误');
      const entry = media.get(item.name);
      if (!entry) missing.push(item.name);
      else if ((await entry.getFile()).size !== item.size) missing.push(item.name + '（大小不符）');
    }
  }
  // Reading each handle now detects inaccessible files before restoration starts.
  for (const entry of media.values()) await entry.getFile();
  return { root, data, media, missing: [...new Set(missing)], remote, createdAt: manifest?.createdAt || null };
}
async function writeBackupFile(root, name, contents) {
  const stream = await (await root.getFileHandle(name, { create: true })).createWritable();
  try { await stream.write(contents); await stream.close(); }
  catch (error) { await stream.abort().catch(() => {}); throw error; }
}
async function copyBackupSnapshot(parent, prefix, data, media, status) {
  const name = `${prefix}-${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID().slice(0, 8)}`;
  const root = await parent.getDirectoryHandle(name, { create: true });
  const targetMedia = await root.getDirectoryHandle('media', { create: true });
  const manifest = { format: 'baby-growth-folder', version: 1, createdAt: new Date().toISOString(), media: [] };
  let count = 0;
  for (const [fileName, entry] of media) {
    if (!safeMediaName(fileName)) throw new Error('媒体文件名不安全');
    const file = await entry.getFile();
    status(`正在复制媒体 ${++count} / ${media.size}`);
    await writeBackupFile(targetMedia, fileName, file);
    const saved = await (await targetMedia.getFileHandle(fileName)).getFile();
    if (saved.size !== file.size) throw new Error('复制校验失败：' + fileName);
    manifest.media.push({ name: fileName, size: file.size });
  }
  await writeBackupFile(root, 'backup-manifest.json', JSON.stringify(manifest, null, 2));
  // Write the database last: a failed copy is never presented as a usable backup.
  await writeBackupFile(root, 'db.json', JSON.stringify(data, null, 2));
  return { root, mediaDir: targetMedia, name };
}
async function createFullBackup() {
  if (backupBusy) return;
  if (!window.showDirectoryPicker) { toast('完整备份需要电脑端 Chrome 或 Edge'); return; }
  if (!FSAdapter.isAvailable || FSAdapter.writeBlocked) { toast('请先连接可正常读取的存储文件夹'); return; }
  setBackupBusy(true);
  try {
    const sourceRoot = FSAdapter.rootDir;
    const parent = await window.showDirectoryPicker({ mode: 'readwrite' });
    await FSAdapter.writeQueue;
    const snapshot = await readBackupFolder(sourceRoot);
    if (snapshot.missing.length || snapshot.remote.length) throw new Error(`无法完整备份：${snapshot.missing.length} 个媒体缺失或损坏，${snapshot.remote.length} 个为外部链接。请先补齐本地文件。`);
    const result = await copyBackupSnapshot(parent, '成长拾光备份', snapshot.data, snapshot.media, backupStatus);
    backupStatus(`备份完成：${result.name}，${snapshot.data.children.length} 个孩子，${snapshot.media.size} 个媒体文件。`);
    toast('完整备份已保存');
  } catch (error) { if (error.name !== 'AbortError') { backupStatus('备份失败：' + error.message); toast('备份未完成，请查看设置中的说明'); } }
  finally { setBackupBusy(false); }
}
async function previewFullBackup() {
  if (backupBusy) return;
  if (!window.showDirectoryPicker) { toast('恢复备份需要电脑端 Chrome 或 Edge'); return; }
  setBackupBusy(true);
  pendingFullBackup = null;
  try {
    const root = await window.showDirectoryPicker({ mode: 'read' });
    const backup = await readBackupFolder(root);
    pendingFullBackup = backup;
    const data = backup.data;
    const issues = [...backup.missing, ...backup.remote.map(name => name + '（外部链接，未包含本地文件）')];
    document.getElementById('backup-restore-summary').innerHTML = `<p class="mb-3">${escapeHtml(root.name || '所选备份')}</p>
      <p>${data.children.length} 个孩子 · ${data.records.length} 条记录 · ${(data.milestones || []).length} 个独立里程碑</p>
      <p>${Object.keys(data.photoProjects || {}).length} 份作品草稿 · ${backup.media.size} 个媒体文件</p>
      <p class="mt-3">缺失或损坏：${backup.missing.length} 个 · 外部链接：${backup.remote.length} 个</p>
      ${issues.length ? `<p class="mt-2">请补齐以下文件后重新选择备份：</p><ul class="backup-preview-list">${issues.map(name => `<li>${escapeHtml(name)}</li>`).join('')}</ul>` : '<p class="mt-2">文件检查通过，可以恢复。</p>'}`;
    document.getElementById('backup-restore-status').textContent = '';
    openModal('modal-backup-restore');
  } catch (error) { if (error.name !== 'AbortError') { backupStatus('无法读取备份：' + error.message); toast('备份读取失败'); } }
  finally {
    setBackupBusy(false);
    document.getElementById('confirm-backup-restore').disabled = !pendingFullBackup || !!(pendingFullBackup.missing.length + pendingFullBackup.remote.length);
  }
}
async function restoreFullBackup() {
  if (backupBusy || !pendingFullBackup || pendingFullBackup.missing.length || pendingFullBackup.remote.length) return;
  setBackupBusy(true);
  const status = message => { document.getElementById('backup-restore-status').textContent = message; };
  try {
    const selected = pendingFullBackup;
    const parent = await window.showDirectoryPicker({ mode: 'readwrite' });
    const checked = await readBackupFolder(selected.root);
    if (JSON.stringify(checked.data) !== JSON.stringify(selected.data) || checked.missing.length || checked.remote.length) throw new Error('备份已变化，请重新预览后恢复');
    const result = await copyBackupSnapshot(parent, '成长拾光恢复', checked.data, checked.media, status);
    await FSAdapter.writeQueue;
    Object.values(FSAdapter.urlCache).forEach(url => URL.revokeObjectURL(url));
    FSAdapter.urlCache = {};
    FSAdapter.rootDir = result.root;
    FSAdapter.mediaDir = result.mediaDir;
    FSAdapter.isAvailable = true;
    FSAdapter.writeBlocked = false;
    // Fresh storage state: do not carry over the previously opened child's project.
    projectDraftChildId = null;
    DB.data = checked.data;
    DB.data.milestones ||= [];
    DB.data.importedMedia ||= [];
    if (!DB.data.children.some(child => child.id === DB.data.activeChildId)) DB.data.activeChildId = DB.data.children[0].id;
    DB.committedData = JSON.stringify(DB.data);
    await HandleDB.init();
    const remembered = await HandleDB.set('rootDir', result.root);
    resetTimelineQuery(false);
    renderAll();
    setStorageMode(true);
    document.getElementById('permission-banner').style.display = 'none';
    closeModal('modal-photo-project');
    closeModal('modal-backup-restore');
    backupStatus(`恢复完成：${result.name}。原资料未改动。${remembered ? '' : '下次打开请手动连接此恢复文件夹。'}`);
    pendingFullBackup = null;
    toast('完整备份已恢复');
  } catch (error) { if (error.name !== 'AbortError') status('恢复未完成：' + error.message); }
  finally { setBackupBusy(false); }
}

document.addEventListener('click', event => {
  const menu = document.getElementById('mobile-menu');
  if (menu?.open && !menu.contains(event.target)) menu.open = false;
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') document.getElementById('mobile-menu').open = false;
});
