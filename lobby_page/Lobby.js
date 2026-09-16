//? ---------------------------------
//* ----- Dashboard Navigation -----
//? ---------------------------------
//#region
const coming_soon_cards = document.querySelectorAll('[data-coming-soon]');
const toast = document.getElementById('toast');

coming_soon_cards.forEach((card) => {
    card.addEventListener('click', (event) => {
        event.preventDefault();

        toast.textContent = `${card.dataset.comingSoon} page coming next.`;
        toast.classList.add('show');

        clearTimeout(window.stellaz_toast_timeout);
        window.stellaz_toast_timeout = setTimeout(() => {
            toast.classList.remove('show');
        }, 1800);
    });
});
//#endregion
