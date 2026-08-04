/* Boot */
document.addEventListener('DOMContentLoaded', () => {
  window.EYE_UI.boot();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
});
