(() => {
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced) {
    document.documentElement.style.setProperty('scroll-behavior', 'auto');
    return;
  }

  const reveal = document.querySelectorAll(
    '.steps li, .loop-split article, .systems-grid article, .faq-grid article, .download-panel, .about-shot, .systems-shots figure',
  );
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.style.animation = 'fadeUp 0.7s ease both';
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.14 },
  );
  reveal.forEach((el) => io.observe(el));

  const heroImg = document.querySelector('.hero-img');
  if (heroImg) {
    window.addEventListener(
      'scroll',
      () => {
        const y = Math.min(window.scrollY, 500);
        heroImg.style.transform = `scale(1.08) translate3d(0, ${y * 0.08}px, 0)`;
      },
      { passive: true },
    );
  }

  // Lightbox-lite: click screenshot to open fullscreen overlay
  const overlay = document.createElement('div');
  overlay.className = 'shot-lightbox';
  overlay.innerHTML = '<button type="button" aria-label="Закрыть">×</button><img alt="" />';
  overlay.hidden = true;
  document.body.appendChild(overlay);
  const overlayImg = overlay.querySelector('img');
  const closeBtn = overlay.querySelector('button');

  const style = document.createElement('style');
  style.textContent = `
    .shot-lightbox {
      position: fixed; inset: 0; z-index: 100;
      background: rgba(6, 10, 6, 0.92);
      display: grid; place-items: center;
      padding: 24px;
    }
    .shot-lightbox[hidden] { display: none !important; }
    .shot-lightbox img {
      max-height: min(90vh, 920px);
      max-width: min(92vw, 420px);
      border-radius: 18px;
      border: 1px solid rgba(215,201,165,0.25);
    }
    .shot-lightbox button {
      position: absolute; top: 18px; right: 18px;
      width: 44px; height: 44px; border-radius: 999px;
      border: 0; background: #2a3330; color: #f2ead8;
      font-size: 28px; cursor: pointer;
    }
  `;
  document.head.appendChild(style);

  document.querySelectorAll('.shot-rail img, .systems-shots img, .about-shot img, .download-shots img').forEach((img) => {
    img.style.cursor = 'zoom-in';
    img.addEventListener('click', () => {
      overlayImg.src = img.src;
      overlayImg.alt = img.alt || '';
      overlay.hidden = false;
    });
  });
  const close = () => {
    overlay.hidden = true;
    overlayImg.src = '';
  };
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
})();
