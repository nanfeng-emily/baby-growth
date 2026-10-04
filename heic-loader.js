/* Shared lazy loader: ordinary photo browsing does not load the HEIC decoder. */
let heicConverterPromise;
function ensureHeicConverter() {
  if (typeof HeicTo === 'function') return Promise.resolve();
  if (!heicConverterPromise) {
    heicConverterPromise = (async () => {
      for (const url of [
        'https://cdn.jsdelivr.net/npm/heic-to@1.5.2/dist/iife/heic-to.js',
        'https://unpkg.com/heic-to@1.5.2/dist/iife/heic-to.js'
      ]) {
        try {
          await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = url;
            script.async = true;
            script.onload = () => { script.remove(); typeof HeicTo === 'function' ? resolve() : reject(new Error('组件未就绪')); };
            script.onerror = () => { script.remove(); reject(new Error('加载失败')); };
            document.head.appendChild(script);
          });
          return;
        } catch (_) { /* Try the fallback CDN. */ }
      }
      throw new Error('HEIC 转换组件未加载，请联网后重试');
    })().catch(error => { heicConverterPromise = null; throw error; });
  }
  return heicConverterPromise;
}
