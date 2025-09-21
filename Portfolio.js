document.addEventListener('DOMContentLoaded', () => {   //? wait until the HTML is parsed
  // #region // ^ Skills tabs 
  const chips  = [...document.querySelectorAll('.skill-chip')];   //? Array of all tab buttons
  const panels = [...document.querySelectorAll('.skill-panel')];  //? Array of all tab panels

  function openPanel(id, chip) {    //? Show one panel + mark its chip active
    panels.forEach(p => {
      const open = p.id === id;
      p.hidden = !open;
      p.classList.toggle('is-open', open);
    });
    chips.forEach(b => {
      const selected = b === chip;
      b.setAttribute('aria-selected', selected);
      b.tabIndex = selected ? 0 : -1;
    });
  }

  chips.forEach((btn, i) => {
    btn.addEventListener('click', () => openPanel(btn.dataset.panel, btn));
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const dir = e.key === 'ArrowRight' ? 1 : -1;
        const next = chips[(i + dir + chips.length) % chips.length];
        next.focus();
      }
    });
  });

  if (chips[0]) openPanel(chips[0].dataset.panel, chips[0]);
  // #endregion skills tab

  /* =========================
   *  Carousels (arrows/keys)
   * ========================= */
  document.querySelectorAll('[data-carousel]').forEach(carousel => {
    const track = carousel.querySelector('[data-track]');
    const prev  = carousel.querySelector('[data-prev]');
    const next  = carousel.querySelector('[data-next]');
    if (!track || !prev || !next) return;

    // CHANGED: more forgiving start/end detection to avoid 1px rounding issues
    const updateArrows = () => {
      const left = Math.ceil(track.scrollLeft);
      const atStart = left <= 0;
      const atEnd = Math.ceil(left + track.clientWidth) >= track.scrollWidth - 1;
      prev.disabled = atStart;
      next.disabled = atEnd;
    };

    const scrollByAmount = () => Math.max(track.clientWidth * 0.8, 250);

    prev.addEventListener('click', () =>
      track.scrollBy({ left: -scrollByAmount(), behavior:'smooth' })
    );
    next.addEventListener('click', () =>
      track.scrollBy({ left:  scrollByAmount(), behavior:'smooth' })
    );

    // CHANGED: rAF during scroll for smoother/accurate enable state
    track.addEventListener('scroll', () => requestAnimationFrame(updateArrows));
    window.addEventListener('resize', updateArrows);
    updateArrows();

    // keyboard support while track is focused
    track.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight') { next.click(); e.preventDefault(); }
      if (e.key === 'ArrowLeft')  { prev.click(); e.preventDefault(); }
    });
  });


  /* ==================================================
   *  Mini-projects → inline drawing viewer (per section)
   *  Add data-drawing="path/to/drawing.png" to each
   *  <a class="mini-item"> in the carousels.
   * ================================================== */
  const moreProjectsContainers = document.querySelectorAll('.more-projects .container');

  moreProjectsContainers.forEach(container => {
    // Use existing viewer if present; otherwise create one that matches your CSS
    let viewer = container.querySelector('.mini-viewer');
    if (!viewer) {
      viewer = document.createElement('div');
      viewer.className = 'mini-viewer';
      viewer.hidden = true;
      viewer.innerHTML = `
        <div class="mini-viewer-inner">
          <button type="button" class="mini-close" aria-label="Close">×</button>
          <img alt="" loading="lazy" decoding="async">
          <a class="mini-openfull" target="_blank" rel="noopener">Open full size</a>
        </div>
      `;
      const firstCarousel = container.querySelector('[data-carousel]') || container.firstElementChild;
      firstCarousel.after(viewer);
    }

    const img       = viewer.querySelector('img');
    const closeBtn  = viewer.querySelector('.mini-close');
    const openFull  = viewer.querySelector('.mini-openfull');

    function closeViewer() {
      viewer.hidden = true;
      viewer.classList.remove('is-open');
      if (closeViewer.lastTrigger) {
        closeViewer.lastTrigger.focus();
        closeViewer.lastTrigger = null;
      }
    }
    if (closeBtn) closeBtn.addEventListener('click', closeViewer);
    document.addEventListener('keydown', (e) => {
      if (!viewer.hidden && e.key === 'Escape') closeViewer();
    });

    // Delegate clicks from any mini-item inside this container
    container.addEventListener('click', (e) => {
      const a = e.target.closest('.mini-item');
      if (!a || !container.contains(a)) return;

      e.preventDefault(); // don't navigate away

      // Prefer data-drawing attribute
      let src = a.dataset.drawing;

      // Fallback: use href if it points directly to an image
      if (!src) {
        const href = a.getAttribute('href') || '';
        if (/\.(png|webp|jpg|jpeg|gif)$/i.test(href)) src = href;
      }

      if (!src) {
        console.warn('Add data-drawing=".../file.png" to the mini-item.');
        return;
      }

      img.src = src;
      img.alt = a.getAttribute('aria-label') || a.querySelector('img')?.alt || 'Drawing';
      if (openFull) openFull.href = src;

      viewer.hidden = false;
      viewer.classList.add('is-open');
      closeViewer.lastTrigger = a;

      viewer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    // Keyboard activation on mini-item anchors
    container.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.mini-item')) {
        e.preventDefault();
        e.target.click();
      }
    });
  });
});
