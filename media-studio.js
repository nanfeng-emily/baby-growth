/* Local-only photo composition and video encoding. Existing records are read, never modified. */
const MediaStudio = (() => {
  let mode = 'meme', entries = [], selected = [], imageCache = new Map();
  let version = 0, busy = false, cancelled = false, recorder = null, stream = null, animation = 0, musicContext = null, musicNodes = [];
  let resultUrl = '', downloadName = '', previousFocus = null;
  const el = id => document.getElementById(id);
  const escape = value => escapeHtml(String(value ?? ''));
  function mount() {
    if (el('modal-media-studio')) return;
    const root = document.createElement('div');
    root.id = 'modal-media-studio'; root.className = 'modal-overlay';
    root.setAttribute('role','dialog'); root.setAttribute('aria-modal','true'); root.setAttribute('aria-labelledby','studio-title');
    root.innerHTML = `<div class="modal-content studio-dialog">
      <div class="studio-header"><div><h2 id="studio-title"></h2><p>在你的浏览器里制作，照片不会上传。</p></div><button class="btn-secondary" onclick="MediaStudio.close()" aria-label="关闭制作窗口">关闭</button></div>
      <div class="studio-body">
        <div class="studio-panel"><fieldset id="studio-inputs">
          <label id="studio-pick-label">选择照片</label><div id="studio-picker" class="studio-picker"></div><p id="studio-selection" class="studio-note" role="status"></p>
          <div id="studio-meme-fields" class="studio-fields">
            <div><label for="studio-caption">表情包文案</label><input id="studio-caption" maxlength="40" value="今天也是可爱满分" oninput="MediaStudio.refresh()"></div>
            <div class="studio-presets"><button onclick="MediaStudio.preset('今天也是可爱满分')">可爱满分</button><button onclick="MediaStudio.preset('本宝宝不服！')">本宝宝不服</button><button onclick="MediaStudio.preset('收到，马上睡觉')">马上睡觉</button><button onclick="MediaStudio.preset('再来一口，就一口')">再来一口</button></div>
            <div class="studio-row"><div><label for="studio-style">版式</label><select id="studio-style" onchange="MediaStudio.refresh()"><option value="classic">经典大字</option><option value="paper">白边手账</option><option value="bubble">对话气泡</option></select></div><div><label for="studio-text-position">文字位置</label><select id="studio-text-position" onchange="MediaStudio.refresh()"><option value="bottom">下方</option><option value="top">上方</option></select></div></div>
            <div><label for="studio-font">字号</label><input id="studio-font" type="range" min="28" max="72" value="48" oninput="MediaStudio.refresh()"></div>
            <div><label for="studio-zoom">照片缩放</label><input id="studio-zoom" type="range" min="100" max="200" value="100" oninput="MediaStudio.refresh()"></div>
            <div class="studio-row"><div><label for="studio-x">左右裁剪</label><input id="studio-x" type="range" min="0" max="100" value="50" oninput="MediaStudio.refresh()"></div><div><label for="studio-y">上下裁剪</label><input id="studio-y" type="range" min="0" max="100" value="50" oninput="MediaStudio.refresh()"></div></div>
          </div>
          <div id="studio-video-fields" class="studio-fields" hidden>
            <div><label for="studio-video-title">视频标题</label><input id="studio-video-title" maxlength="32" oninput="MediaStudio.refresh()"></div>
            <div class="studio-row"><div><label for="studio-ratio">画面比例</label><select id="studio-ratio" onchange="MediaStudio.refresh()"><option value="portrait">竖版 9:16</option><option value="landscape">横版 16:9</option><option value="square">方形 1:1</option></select></div><div><label for="studio-duration">每张停留</label><select id="studio-duration" onchange="MediaStudio.refresh()"><option value="2">2 秒</option><option value="3" selected>3 秒</option><option value="4">4 秒</option><option value="5">5 秒</option></select></div></div>
            <div class="studio-row"><div><label for="studio-transition">转场</label><select id="studio-transition" onchange="MediaStudio.refresh()"><option value="fade">柔和淡入淡出</option><option value="cut">直接切换</option></select></div><div><label for="studio-video-caption">画面文字</label><select id="studio-video-caption" onchange="MediaStudio.refresh()"><option value="both">日期 + 记录标题</option><option value="date">仅日期</option><option value="none">不显示</option></select></div></div>
            <div><label for="studio-music">背景音乐</label><select id="studio-music" onchange="MediaStudio.refresh()"><option value="none">无音乐</option><option value="lullaby">摇篮星光 · 轻柔八音盒</option><option value="sunny">小小晴天 · 木琴律动</option><option value="memory">翻页时光 · 温暖钢琴</option></select></div>
            <div><label for="studio-music-volume">音乐音量 <span id="studio-music-volume-value">35%</span></label><input id="studio-music-volume" type="range" min="0" max="70" value="35" oninput="MediaStudio.refresh()"></div>
            <div><label>播放顺序</label><button class="btn-secondary" onclick="MediaStudio.sort()">按日期从早到晚</button><div id="studio-order" class="studio-order"></div></div>
            <p class="studio-note">最多 20 张，音乐为浏览器本地生成的轻柔纯音乐；生成约需与视频时长相同的时间，请保持此页面在前台。</p>
          </div>
        </fieldset></div>
        <div class="studio-panel"><div class="studio-preview"><canvas id="studio-canvas" width="640" height="640" aria-label="作品预览"></canvas><video id="studio-video" controls playsinline hidden></video></div>
          <p id="studio-status" class="studio-status" role="status" aria-live="polite"></p><progress id="studio-progress" max="100" value="0" hidden aria-label="视频生成进度"></progress>
          <div class="studio-actions"><button id="studio-generate" class="btn-primary" onclick="MediaStudio.generate()">生成</button><button id="studio-cancel" class="btn-secondary" onclick="MediaStudio.cancel()" hidden>取消生成</button><a id="studio-download" class="btn-primary" hidden>下载作品</a></div>
          <p id="studio-format" class="studio-note" style="margin-top:12px;"></p>
        </div>
      </div></div>`;
    document.body.appendChild(root);
    root.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.stopPropagation(); close(); }
      if (event.key === 'Tab') {
        const items = [...root.querySelectorAll('button,input,select,a[href],video[controls]')].filter(node => !node.disabled && !node.closest('[hidden]') && !node.closest('fieldset:disabled') && node.getClientRects().length);
        if (!items.length) return;
        if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1).focus(); }
        else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0].focus(); }
      }
    });
  }
  function status(message) { el('studio-status').textContent = message; }
  function clearResult() {
    el('studio-video').pause(); el('studio-video').removeAttribute('src'); el('studio-video').load(); el('studio-video').hidden = true;
    el('studio-canvas').hidden = false;
    el('studio-download').hidden = true; el('studio-download').removeAttribute('href');
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    resultUrl = '';
  }
  function videoMime() {
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) return '';
    return ['video/mp4;codecs=avc1.42E01E','video/mp4','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(type => MediaRecorder.isTypeSupported(type)) || '';
  }
  function open(nextMode, mediaId = null) {
    mount(); if (busy) return;
    previousFocus = document.activeElement;
    mode = nextMode === 'video' ? 'video' : 'meme';
    ++version; imageCache.clear(); clearResult();
    const seen = new Set();
    entries = getSelectableMediaEntries().filter(item => item.mediaType !== 'video' && !seen.has(item.mediaId) && seen.add(item.mediaId));
    const initial = entries.findIndex(item => item.mediaId === mediaId);
    selected = mode === 'meme' && entries.length ? [Math.max(0, initial)] : [];
    el('studio-title').textContent = mode === 'meme' ? '制作宝宝表情包' : '制作成长视频';
    el('studio-pick-label').textContent = mode === 'meme' ? '选一张照片' : '选 2—20 张照片';
    el('studio-meme-fields').hidden = mode !== 'meme'; el('studio-video-fields').hidden = mode !== 'video';
    el('studio-video-title').value = `${DB.getActiveChild()?.nickname || '宝贝'}的成长时光`;
    el('studio-zoom').value = '100'; el('studio-x').value = el('studio-y').value = '50';
    el('studio-generate').textContent = mode === 'meme' ? '生成 PNG 表情包' : '生成成长视频';
    el('studio-music').value = 'none'; el('studio-music-volume').value = '35';
    el('studio-format').textContent = mode === 'meme' ? '导出 640 × 640 PNG 图片，可保存后作为聊天表情使用。' : videoMime() ? `当前浏览器导出 ${videoMime().includes('mp4') ? 'MP4' : 'WebM'} 视频。` : '当前浏览器不支持本地视频编码，请使用新版电脑 Chrome 或 Edge。';
    closeModal('modal-image-viewer');
    renderPicker();
    openModal('modal-media-studio');
    el('modal-media-studio').querySelector('[aria-label="关闭制作窗口"]').focus();
    refresh();
  }
  function renderPicker() {
    el('studio-picker').innerHTML = entries.map((item,index) => `<button type="button" class="studio-photo" aria-label="${escape(item.date)} ${escape(item.title)}" aria-pressed="${selected.includes(index)}" onclick="MediaStudio.select(${index})"><img data-media-id="${escape(item.mediaId)}" loading="lazy" alt="${escape(item.title || '成长照片')}"><time>${escape(item.date)}</time>${selected.includes(index) ? `<span>${selected.indexOf(index)+1}</span>` : ''}</button>`).join('') || '<p class="studio-note">还没有照片。请先连接资料文件夹，或添加带照片的成长记录。</p>';
    loadMediaElements();
    renderOrder();
  }
  function renderOrder() {
    el('studio-selection').textContent = mode === 'meme' ? `已选 ${selected.length} 张` : `已选 ${selected.length} / 20 张 · 预计 ${selected.length * Number(el('studio-duration').value)} 秒`;
    if (el('studio-music-volume-value')) el('studio-music-volume-value').textContent = `${el('studio-music-volume').value}%`;
    el('studio-order').innerHTML = selected.map((index,position) => `<div class="studio-order-item"><span>${position+1}. ${escape(entries[index].date)} ${escape(entries[index].title)}</span><button aria-label="第 ${position+1} 张上移" ${position === 0 ? 'disabled' : ''} onclick="MediaStudio.move(${position},-1)">↑</button><button aria-label="第 ${position+1} 张下移" ${position === selected.length-1 ? 'disabled' : ''} onclick="MediaStudio.move(${position},1)">↓</button><button aria-label="移除第 ${position+1} 张" onclick="MediaStudio.select(${index})">移除</button></div>`).join('');
  }
  function select(index) {
    if (busy || !entries[index]) return;
    if (mode === 'meme') selected = [index];
    else if (selected.includes(index)) selected = selected.filter(value => value !== index);
    else if (selected.length < 20) selected.push(index);
    else { status('最多选择 20 张照片。'); return; }
    renderPicker(); refresh();
  }
  function move(position, delta) {
    if (busy || position+delta < 0 || position+delta >= selected.length) return;
    [selected[position],selected[position+delta]] = [selected[position+delta],selected[position]];
    renderPicker(); refresh();
  }
  function sort() { if (busy) return; selected.sort((a,b) => entries[a].date.localeCompare(entries[b].date)); renderPicker(); refresh(); }
  async function loadImage(index) {
    if (imageCache.has(index)) return imageCache.get(index);
    const item = entries[index];
    const promise = (async () => {
      const url = await getMediaUrl(item.mediaId);
      if (!url) throw new Error('照片无法读取，请检查存储文件夹权限。');
      const image = new Image();
      image.crossOrigin = 'anonymous';
      await new Promise((resolve,reject) => {
        const timer = setTimeout(() => { image.onload = image.onerror = null; image.src = ''; reject(new Error('照片加载超时，请重试。')); },15000);
        image.onload = () => { clearTimeout(timer); resolve(); };
        image.onerror = () => { clearTimeout(timer); reject(new Error('照片不可用于导出。请使用本地照片，外部示例图片可能受跨域限制。')); };
        image.src = url;
      });
      // Resize once to bound memory during multi-photo video creation.
      const canvas = document.createElement('canvas'), scale = Math.min(1,1280 / Math.max(image.width,image.height));
      canvas.width = Math.max(1,Math.round(image.width*scale)); canvas.height = Math.max(1,Math.round(image.height*scale));
      canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
      canvas.getContext('2d').getImageData(0,0,1,1); // Fail early for a tainted canvas.
      return canvas;
    })();
    imageCache.set(index,promise);
    try { return await promise; } catch(error) { imageCache.delete(index); throw error; }
  }
  function cover(ctx,image,x,y,w,h,zoom=1,px=.5,py=.5) {
    const scale = Math.max(w/image.width,h/image.height)*zoom;
    ctx.save(); ctx.beginPath(); ctx.rect(x,y,w,h); ctx.clip();
    ctx.drawImage(image,x-(image.width*scale-w)*px,y-(image.height*scale-h)*py,image.width*scale,image.height*scale);
    ctx.restore();
  }
  function lines(ctx,value,width) {
    const result = []; let line = '';
    for (const char of String(value)) {
      if (char === '\n') { result.push(line); line=''; continue; }
      if (line && ctx.measureText(line+char).width > width) { result.push(line); line=char; } else line += char;
    }
    if (line) result.push(line);
    return result;
  }
  function drawMeme(image) {
    const canvas = el('studio-canvas'); canvas.width = canvas.height = 640;
    const ctx = canvas.getContext('2d'), style = el('studio-style').value, top = el('studio-text-position').value === 'top';
    const value = el('studio-caption').value.trim();
    let size = Number(el('studio-font').value);
    ctx.fillStyle = '#fffaf1'; ctx.fillRect(0,0,640,640);
    ctx.font = `900 ${size}px "Microsoft YaHei",sans-serif`;
    let textLines = lines(ctx,value,560);
    while(size>24 && textLines.length*size*1.24>260){size-=2;ctx.font=`900 ${size}px "Microsoft YaHei",sans-serif`;textLines=lines(ctx,value,560);}
    const lineHeight = size*1.24, textHeight = textLines.length*lineHeight;
    const band = Math.min(320,Math.max(80,textHeight+36));
    const x = style==='paper'?18:0, y=style==='paper'?(top?band:18):0;
    const width=style==='paper'?604:640, height=style==='paper'?622-band:640;
    cover(ctx,image,x,y,width,height,Number(el('studio-zoom').value)/100,Number(el('studio-x').value)/100,Number(el('studio-y').value)/100);
    if(style==='bubble' && value){ctx.fillStyle='#fffdf5ed';ctx.beginPath();ctx.roundRect(22,top?22:618-band,596,band,24);ctx.fill();}
    ctx.textAlign='center';ctx.textBaseline='top';ctx.lineJoin='round';ctx.lineWidth=Math.max(4,size/9);
    const startY=top?(style==='paper'?18:38):(640-textHeight-32);
    ctx.fillStyle=style==='classic'?'#fff':'#302b26';ctx.strokeStyle='#302b26';
    textLines.forEach((line,i)=>{if(style==='classic')ctx.strokeText(line,320,startY+i*lineHeight);ctx.fillText(line,320,startY+i*lineHeight);});
  }
  function sizeVideo() {
    const canvas=el('studio-canvas'), ratio=el('studio-ratio').value;
    [canvas.width,canvas.height]=ratio==='landscape'?[1280,720]:ratio==='square'?[720,720]:[720,1280];
    return canvas;
  }
  function drawSlide(ctx,image,item,width,height) {
    ctx.fillStyle='#f5efe2';ctx.fillRect(0,0,width,height);
    const margin=width*.055, title=el('studio-video-title').value.trim();
    ctx.textAlign='center';ctx.textBaseline='top';ctx.fillStyle='#936445';ctx.font=`500 ${width*.027}px "Microsoft YaHei",sans-serif`;
    const titleLines=lines(ctx,title,width-margin*2).slice(0,2);
    titleLines.forEach((line,i)=>ctx.fillText(line,width/2,height*.035+i*width*.034));
    const photoY=height*.13, photoH=height*.65;
    const scale=Math.min((width-margin*2)/image.width,photoH/image.height);
    const w=image.width*scale,h=image.height*scale,x=(width-w)/2,y=photoY+(photoH-h)/2;
    ctx.fillStyle='#fffdf9';ctx.fillRect(x-8,y-8,w+16,h+16);ctx.drawImage(image,x,y,w,h);
    const caption=el('studio-video-caption').value;
    if(caption!=='none'){
      ctx.font=`500 ${width*.025}px "Microsoft YaHei",sans-serif`;ctx.fillStyle='#8c745b';ctx.fillText(item.date || '',width/2,height*.83);
      if(caption==='both'){
        ctx.font=`600 ${width*.033}px "Microsoft YaHei",sans-serif`;ctx.fillStyle='#36382e';
        lines(ctx,item.title || '',width-margin*2).slice(0,2).forEach((line,i)=>ctx.fillText(line,width/2,height*.875+i*width*.043));
      }
    }
  }
  async function refresh() {
    if(busy)return;
    const token=++version;clearResult();renderOrder();
    el('studio-generate').disabled=true;
    const canvas=el('studio-canvas');if(mode==='video')sizeVideo();else canvas.width=canvas.height=640;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#f2ebde';ctx.fillRect(0,0,canvas.width,canvas.height);
    if(!selected.length){status('先从左侧选择照片；手机端请在上方选择。');return;}
    status('正在读取照片…');
    try{
      const image=await loadImage(selected[0]);if(token!==version)return;
      if(mode==='meme')drawMeme(image);else drawSlide(ctx,image,entries[selected[0]],canvas.width,canvas.height);
      el('studio-generate').disabled=mode==='video' && (selected.length<2 || !videoMime());
      status(mode==='meme'?'修改文案和裁剪，预览满意后生成。':selected.length<2?'再选一张照片即可生成视频。':`已准备 ${selected.length} 张照片，预计视频时长 ${selected.length*Number(el('studio-duration').value)} 秒。`);
    }catch(error){if(token===version)status(error.message);}
  }
  function setBusy(value) {
    busy=value;el('studio-inputs').disabled=value;el('studio-generate').disabled=value;
    el('studio-cancel').hidden=!value;el('studio-progress').hidden=!value || mode!=='video';
  }
  function setDownload(blob,extension) {
    resultUrl=URL.createObjectURL(blob);
    downloadName=`成长拾光-${mode==='meme'?'表情包':'成长视频'}-${new Date().toISOString().slice(0,10)}.${extension}`;
    const link=el('studio-download');link.href=resultUrl;link.download=downloadName;link.textContent=`下载 ${extension.toUpperCase()}`;link.hidden=false;
  }
  async function generate() {
    if(busy || !selected.length || (mode==='video' && selected.length<2))return;
    clearResult();setBusy(true);cancelled=false;++version;
    try{
      if(mode==='meme'){
        drawMeme(await loadImage(selected[0]));
        const blob=await new Promise((resolve,reject)=>el('studio-canvas').toBlob(value=>value?resolve(value):reject(new Error('图片生成失败。')),'image/png'));
        if(cancelled)return;setDownload(blob,'png');status('表情包已生成，点击下载保存。');
      }else await generateVideo();
    }catch(error){if(!cancelled)status(`生成失败：${error.message}`);}
    finally{releaseRecording();setBusy(false);if(cancelled)status('已取消生成，照片选择仍保留。');}
  }
  async function generateVideo() {
    const mime=videoMime();if(!mime)throw new Error('浏览器不支持视频编码，请换用电脑 Chrome 或 Edge。');
    const images=[];
    for(let i=0;i<selected.length;i++){
      status(`准备照片 ${i+1} / ${selected.length}…`);images.push(await loadImage(selected[i]));if(cancelled)return;
    }
    if(document.hidden)throw new Error('请保持制作页面在前台，再开始生成。');
    const canvas=sizeVideo(),ctx=canvas.getContext('2d'),seconds=Number(el('studio-duration').value),duration=seconds*selected.length;
    drawSlide(ctx,images[0],entries[selected[0]],canvas.width,canvas.height);
    stream=canvas.captureStream(30);
    const music = el('studio-music').value;
    if (music !== 'none' && Number(el('studio-music-volume').value) > 0) {
      musicContext = new AudioContext();
      const destination = musicContext.createMediaStreamDestination();
      const gain = musicContext.createGain(); gain.gain.value = Number(el('studio-music-volume').value) / 100;
      gain.connect(destination);
      const patterns = { lullaby:[261.63,329.63,392,523.25,392,329.63], sunny:[261.63,293.66,329.63,392,440,392], memory:[220,261.63,293.66,329.63,392,329.63] };
      const notes = patterns[music] || patterns.lullaby;
      const osc = musicContext.createOscillator(); osc.type = music === 'sunny' ? 'triangle' : 'sine'; osc.frequency.value = notes[0]; osc.connect(gain); osc.start();
      const timer = setInterval(() => { if (!musicContext) return; const index = Math.floor(musicContext.currentTime * 2) % notes.length; osc.frequency.setTargetAtTime(notes[index], musicContext.currentTime, .03); }, 450);
      musicNodes = [osc, gain, timer, destination];
      const audioTrack = destination.stream.getAudioTracks()[0]; if (audioTrack) stream.addTrack(audioTrack);
    }
    recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:4000000});
    const chunks=[],actualMime=recorder.mimeType || mime;
    const finished=new Promise((resolve,reject)=>{
      recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
      recorder.onstop=()=>resolve(new Blob(chunks,{type:actualMime}));
      recorder.onerror=event=>reject(event.error || new Error('视频编码失败'));
    });
    // Recording is real-time; cancel on backgrounding rather than silently dropping frames.
    recorder.start(250);
    const start=performance.now();let current=-1,nextLayer=document.createElement('canvas');nextLayer.width=canvas.width;nextLayer.height=canvas.height;
    const layer=nextLayer.getContext('2d');
    function frame(now){
      if(cancelled || !recorder || recorder.state!=='recording')return;
      const time=Math.max(0,Math.min(duration,(now-start)/1000)),index=Math.min(images.length-1,Math.floor(time/seconds));
      const local=time-index*seconds;
      drawSlide(ctx,images[index],entries[selected[index]],canvas.width,canvas.height);
      if(el('studio-transition').value==='fade' && index>0 && local<.45){
        drawSlide(layer,images[index-1],entries[selected[index-1]],canvas.width,canvas.height);
        ctx.globalAlpha=1-local/.45;ctx.drawImage(nextLayer,0,0);ctx.globalAlpha=1;
      }
      el('studio-progress').value=time/duration*100;
      if(index!==current){current=index;status(`正在生成 ${index+1} / ${images.length}，请保持页面在前台…`);}
      if(time>=duration){recorder.stop();return;}
      animation=requestAnimationFrame(frame);
    }
    animation=requestAnimationFrame(frame);
    const blob=await finished;
    if(cancelled)return;
    if(!blob.size)throw new Error('浏览器没有生成有效视频。');
    setDownload(blob,actualMime.includes('mp4')?'mp4':'webm');
    el('studio-canvas').hidden=true;el('studio-video').src=resultUrl;el('studio-video').hidden=false;
    status(`视频已生成，约 ${duration} 秒。先播放预览，再下载保存。`);
  }
  function releaseRecording(){cancelAnimationFrame(animation);animation=0;stream?.getTracks().forEach(track=>track.stop());stream=null;recorder=null; const timer=musicNodes.find(node=>typeof node==='number'); if(timer) clearInterval(timer); musicNodes.filter(node=>node?.stop).forEach(node=>{try{node.stop()}catch{}}); musicNodes=[]; if(musicContext){musicContext.close().catch(()=>{});musicContext=null;}}
  function cancel(){if(!busy)return;cancelled=true;cancelAnimationFrame(animation);if(recorder?.state==='recording')recorder.stop();}
  function close(){if(busy){cancel();return;}++version;clearResult();imageCache.clear();closeModal('modal-media-studio');if(previousFocus?.isConnected)previousFocus.focus();}
  document.addEventListener('visibilitychange',()=>{if(document.hidden && busy && mode==='video'){cancel();}});
  function preset(value){el('studio-caption').value=value;refresh();}
  return {open,close,select,move,sort,preset,refresh,generate,cancel};
})();
