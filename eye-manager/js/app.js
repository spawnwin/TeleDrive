/* Boot */
document.addEventListener('DOMContentLoaded', () => {
  window.EYE_UI.boot();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      reg.update?.();
      if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    }).catch(() => {});
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // One reload after SW takes over so HTML/CSS match the new menu
      if (sessionStorage.getItem('eye_sw_reloaded')) return;
      sessionStorage.setItem('eye_sw_reloaded', '1');
      location.reload();
    });
  }
});
