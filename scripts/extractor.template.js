/**
 * Questo file gira NELLA PAGINA, come se fosse lanciato da console F12.
 * Deve restituire un array di oggetti:
 * [{ id, title, url, discount, createdAt }]
 */

// Esempio base, da adattare al sito reale.
return [...document.querySelectorAll('.product-card')].map((el) => {
  const title = el.querySelector('.product-title')?.textContent?.trim();
  const url = el.querySelector('a')?.href;
  const discountText = el.querySelector('.discount')?.textContent?.trim();
  const createdAt = el.querySelector('.created-at')?.textContent?.trim();
  const id = el.getAttribute('data-product-id') || url || title;

  return {
    id,
    title,
    url,
    discount: discountText,
    createdAt
  };
});

// In alternativa, se il tuo script attuale popola window.__productsResult__,
// il monitor userà automaticamente quel valore.
