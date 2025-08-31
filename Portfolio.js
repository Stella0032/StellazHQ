document.addEventListener('DOMContentLoaded', () => {
  // ----- Skills (tabs) -----
  const chips  = [...document.querySelectorAll('.skill-chip')];
  const panels = [...document.querySelectorAll('.skill-panel')];

  function openPanel(id, chip){
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
});
