(() => {
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced) {
    document.documentElement.style.setProperty('scroll-behavior', 'auto');
    return;
  }

  const reveal = document.querySelectorAll('.steps li, .grid-section article, .download-panel');
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.18 },
  );
  reveal.forEach((el) => io.observe(el));

  // Soft parallax on hero image
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
})();
