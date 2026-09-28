/* Read-only presentation adapters over the existing records and media viewer. */
const Scrapbook = (() => {
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const pointer = matchMedia('(hover: hover) and (pointer: fine) and (min-width: 901px)');
  let albumIndex = 0, albumOpen = false, childId = null, albumToken = 0;
  const photos = () => getSelectableMediaEntries().filter(r => r.mediaType !== 'video');
  const text = value => escapeHtml(String(value || ''));
  function tilt(event, target, degrees = 3) {
    if (motion.matches || !pointer.matches) return;
    const rect = event.currentTarget.getBoundingClientRect();
    target.style.setProperty('--tilt-x', `${-(event.clientY - rect.top - rect.height / 2) / rect.height * degrees}deg`);
    target.style.setProperty('--tilt-y', `${(event.clientX - rect.left - rect.width / 2) / rect.width * degrees}deg`);
  }
  function clearTilt(target) { target.style.removeProperty('--tilt-x'); target.style.removeProperty('--tilt-y'); }
  async function renderAlbum() {
    const scene = document.getElementById('growth-album'), child = DB.getActiveChild();
    if (!scene || !child) return;
    const token = ++albumToken;
    if (child.id !== childId) { childId = child.id; albumIndex = 0; albumOpen = false; }
    const entries = photos();
    albumIndex = Math.min(albumIndex, Math.max(0, entries.length - 1));
    const item = entries[albumIndex];
    scene.classList.toggle('is-open', albumOpen);
    scene.innerHTML = `<div class="album-tilt"><div class="album-book">
      <div class="album-page" id="album-inner-page" ${albumOpen ? '' : 'inert'} aria-hidden="${!albumOpen}">
        ${item ? '<button class="album-photo-button" aria-label="查看这张成长照片"><img class="album-page-photo" alt=""></button>' : '<div class="album-page-empty">每一个小小瞬间<br>都值得被珍藏</div>'}
        <time class="album-page-date">${text(item?.date || child.birthdate)}</time>
        <h2 class="album-page-title">${text(item?.title || `${child.nickname}的第一章`)}</h2>
        <p class="album-page-story">${text(item?.content && item.content !== '自动导入' ? item.content : '把今天的快乐，留给长大后的你。')}</p>
      </div>
      <button class="album-cover" aria-label="${albumOpen ? '合上' : '翻开'}成长纪念册" aria-expanded="${albumOpen}" aria-controls="album-inner-page">
        <span class="album-cover-face album-cover-front"><span class="album-cover-kicker">OUR LITTLE DAYS</span><span class="album-sprig" aria-hidden="true">❧</span><span class="album-cover-title">成长<br>纪念册</span><span class="album-cover-child">${text(child.nickname)} · 慢慢长大</span><span class="album-cover-year">始于 ${text(child.birthdate)}</span></span>
        <span class="album-cover-face album-cover-back" aria-hidden="true"><span class="album-note">愿每一次翻开，<br>都能遇见<br>那时的你。</span><span class="album-sprig">❧</span></span>
      </button></div></div>
      <div class="album-controls"><button data-album-toggle>${albumOpen ? '合上纪念册' : '翻开纪念册'}</button><button data-album-prev aria-label="上一页" ${!albumOpen || albumIndex === 0 ? 'disabled' : ''}>←</button><span aria-live="polite">${entries.length ? `${albumIndex + 1} / ${entries.length}` : '等你写下第一篇'}</span><button data-album-next aria-label="下一页" ${!albumOpen || albumIndex >= entries.length - 1 ? 'disabled' : ''}>→</button></div>`;
    const setOpen = () => {
      albumOpen = !albumOpen;
      scene.classList.toggle('is-open', albumOpen);
      scene.querySelector('.album-cover').setAttribute('aria-expanded', albumOpen);
      scene.querySelector('.album-cover').setAttribute('aria-label', `${albumOpen ? '合上' : '翻开'}成长纪念册`);
      const page = scene.querySelector('.album-page'); page.inert = !albumOpen; page.setAttribute('aria-hidden', !albumOpen);
      scene.querySelector('[data-album-toggle]').textContent = albumOpen ? '合上纪念册' : '翻开纪念册';
      scene.querySelector('[data-album-prev]').disabled = !albumOpen || albumIndex === 0;
      scene.querySelector('[data-album-next]').disabled = !albumOpen || albumIndex >= entries.length - 1;
    };
    scene.querySelector('.album-cover').onclick = setOpen;
    scene.querySelector('[data-album-toggle]').onclick = setOpen;
    for (const [selector,delta] of [['[data-album-prev]',-1],['[data-album-next]',1]]) {
      scene.querySelector(selector).onclick = async () => { albumIndex += delta; await renderAlbum(); scene.querySelector(selector).focus(); };
    }
    scene.onpointermove = event => tilt(event, scene.querySelector('.album-tilt'), 5);
    scene.onpointerleave = () => clearTilt(scene.querySelector('.album-tilt'));
    if (item) {
      scene.querySelector('.album-photo-button').onclick = () => viewMedia(item.mediaId, item.title, 'image');
      const image = scene.querySelector('.album-page-photo');
      image.alt = item.title || '成长照片';
      image.onerror = () => { image.replaceWith(Object.assign(document.createElement('div'), {className:'album-page-empty', textContent:'照片暂时无法读取'})); };
      const url = await getMediaUrl(item.mediaId);
      if (token === albumToken) { if (url) image.src = url; else image.onerror(); }
    }
  }
  let filmToken = 0, scrollFrame = 0, filmManual = false, filmChild = null;
  function updateFilmControls() {
    const viewport = document.getElementById('film-viewport');
    document.getElementById('film-prev').disabled = viewport.scrollLeft <= 1;
    document.getElementById('film-next').disabled = !viewport.querySelector('.film-frame') || viewport.scrollLeft >= viewport.scrollWidth - viewport.clientWidth - 1;
  }
  function setupFilmControls() {
    const viewport = document.getElementById('film-viewport');
    if (viewport.dataset.navigationReady) return;
    viewport.dataset.navigationReady = 'true';
    const move = direction => {
      filmManual = true;
      const frame = viewport.querySelector('.film-frame');
      const step = frame ? frame.offsetWidth + parseFloat(getComputedStyle(frame.parentElement).gap) : viewport.clientWidth;
      viewport.scrollBy({left:direction * step,behavior:motion.matches ? 'instant' : 'smooth'});
    };
    document.getElementById('film-prev').onclick = () => move(-1);
    document.getElementById('film-next').onclick = () => move(1);
    viewport.addEventListener('scroll',updateFilmControls,{passive:true});
    viewport.addEventListener('wheel',event => { if (event.deltaX || event.shiftKey) filmManual = true; },{passive:true});
    viewport.addEventListener('keydown',event => {
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault();
      filmManual = true;
      if (event.key.startsWith('Arrow')) move(event.key === 'ArrowLeft' ? -1 : 1);
      else viewport.scrollTo({left:event.key === 'Home' ? 0 : viewport.scrollWidth,behavior:motion.matches ? 'instant' : 'smooth'});
    });
    let drag = null, suppressClick = false;
    viewport.addEventListener('pointerdown',event => {
      filmManual = true;
      suppressClick = false;
      if (event.pointerType !== 'mouse' || event.button !== 0) return;
      drag = {id:event.pointerId,x:event.clientX,left:viewport.scrollLeft,moved:false};
    });
    viewport.addEventListener('dragstart',event => event.preventDefault());
    viewport.addEventListener('pointermove',event => {
      if (!drag || drag.id !== event.pointerId) return;
      const delta = event.clientX - drag.x;
      if (!drag.moved && Math.abs(delta) < 6) return;
      drag.moved = true;
      viewport.setPointerCapture(event.pointerId);
      viewport.classList.add('is-dragging');
      viewport.scrollLeft = drag.left - delta;
    });
    const endDrag = event => {
      if (!drag || event.pointerId !== drag.id) return;
      suppressClick = drag.moved;
      drag = null;
      viewport.classList.remove('is-dragging');
      if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
    };
    viewport.addEventListener('pointerup',endDrag);
    viewport.addEventListener('pointercancel',endDrag);
    viewport.addEventListener('lostpointercapture',endDrag);
    viewport.addEventListener('pointerleave',event => { if (drag && !drag.moved) endDrag(event); });
    viewport.addEventListener('click',event => {
      if (suppressClick) { event.preventDefault(); event.stopImmediatePropagation(); suppressClick = false; }
    },true);
  }
  function updateFilmPosition() {
    scrollFrame = 0;
    const section = document.getElementById('growth-film'), track = document.getElementById('film-track');
    if (!section || !track) return;
    const viewport = track.parentElement;
    document.getElementById('film-description').textContent = pointer.matches ? '点击箭头或拖动胶卷，慢慢回看' : '左右轻滑，慢慢回看';
    if (!pointer.matches || motion.matches || filmManual) { updateFilmControls(); return; }
    const rect = section.getBoundingClientRect();
    const distance = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    const progress = Math.max(0, Math.min(1, (innerHeight - rect.top - 120) / (innerHeight + rect.height - 240)));
    viewport.scrollLeft = distance * progress;
    updateFilmControls();
  }
  function scheduleFilm() { if (!scrollFrame) scrollFrame = requestAnimationFrame(updateFilmPosition); }
  async function renderFilm() {
    const track = document.getElementById('film-track');
    if (!track) return;
    setupFilmControls();
    const nextChild = DB.getActiveChild()?.id;
    if (filmChild !== nextChild) { filmChild = nextChild; filmManual = false; track.parentElement.scrollLeft = 0; }
    const token = ++filmToken, all = photos(), entries = all.slice(0,24).reverse();
    track.innerHTML = entries.length ? entries.map((item,index) => `<button class="film-frame" aria-label="${text(item.date)} ${text(item.title)}，查看照片"><img alt="${text(item.title || '成长照片')}" loading="lazy"><span class="film-frame-caption"><time>${text(item.date)}</time><span>${String(index+1).padStart(2,'0')}</span></span></button>`).join('') : '<p class="film-empty">添加一张成长照片，让故事从这里开始。</p>';
    document.getElementById('film-count').textContent = all.length > 24 ? `最近 24 个照片瞬间 · 全部 ${all.length} 张可在时间线查看` : `${all.length} 个照片瞬间`;
    track.querySelectorAll('.film-frame').forEach((button,index) => {
      const item = entries[index];
      button.onclick = () => viewMedia(item.mediaId,item.title,'image');
      button.onfocus = () => {
        if (!button.matches(':focus-visible')) return;
        filmManual = true;
        button.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
      };
    });
    scheduleFilm();
    // Bounded concurrency, using the existing local-media URL cache.
    let cursor = 0;
    await Promise.all(Array.from({length:Math.min(3,entries.length)}, async () => {
      while (cursor < entries.length) {
        const index = cursor++, item = entries[index], url = await getMediaUrl(item.mediaId);
        if (token !== filmToken) return;
        const image = track.children[index].querySelector('img');
        image.onerror = () => { image.alt = '照片暂时无法读取'; };
        if (url) image.src = url; else image.alt = '照片暂时无法读取';
      }
    }));
  }
  addEventListener('scroll',scheduleFilm,{passive:true});
  addEventListener('resize',scheduleFilm,{passive:true});
  motion.addEventListener('change',scheduleFilm);
  const previousHero = renderHero;
  renderHero = function () { previousHero(); renderAlbum(); renderFilm(); };
  const previousGallery = renderGallery;
  renderGallery = function () {
    previousGallery();
    const grid = document.getElementById('gallery-grid');
    const hint = document.querySelector('#gallery-deck-hint span:last-child');
    if (hint) hint.textContent = pointer.matches ? '悬停抽出照片 · 点击查看完整画面' : '左右滑动浏览 · 轻点选中，再点查看';
    let active = null;
    grid.onpointermove = event => {
      const card = event.target.closest('.gallery-item');
      if (active && active !== card) clearTilt(active);
      active = card;
      if (card) tilt(event,card,5);
    };
    grid.onpointerleave = () => { if (active) clearTilt(active); active = null; };
  };
  let entryObserver;
  const previousTimeline = renderTimeline;
  renderTimeline = function () {
    previousTimeline();
    if (entryObserver) entryObserver.disconnect();
    if (motion.matches || !('IntersectionObserver' in window)) return;
    entryObserver = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('journal-entry-visible'); entryObserver.unobserve(entry.target); }
    }), {threshold:.05});
    document.querySelectorAll('#timeline-container .timeline-card, #timeline-container .year-divider').forEach((item,index) => {
      item.classList.add('journal-entry-pending');
      item.style.transitionDelay = `${Math.min(index % 3,2)*45}ms`;
      entryObserver.observe(item);
    });
  };
  return { renderAlbum, renderFilm, photos, tilt, clearTilt, motion, pointer };
})();
