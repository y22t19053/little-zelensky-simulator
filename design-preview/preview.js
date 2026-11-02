/* Independent preview interaction: selection feedback only; no engine, effects, storage or network. */
(() => {
  'use strict';
  const cards = [...document.querySelectorAll('.choice-card')];
  const name = document.getElementById('selection-name');
  const cost = document.getElementById('selection-cost');
  const remaining = document.getElementById('remaining-ap');
  const issue = document.getElementById('issue-button');
  const toast = document.getElementById('preview-toast');
  const stateDetails = document.querySelector('.state-details');
  let selected = cards[0];
  let toastTimer;

  if (window.matchMedia('(max-width: 700px)').matches) stateDetails.removeAttribute('open');

  function selectCard(card) {
    selected = card;
    cards.forEach(item => {
      const active = item === card;
      item.classList.toggle('is-selected', active);
      item.classList.remove('is-issued');
      item.setAttribute('aria-pressed', String(active));
      item.querySelector('.select-label').textContent = active ? '已选' : '选择';
    });
    const ap = Number(card.dataset.ap);
    name.textContent = card.querySelector('.choice-title').textContent;
    cost.textContent = `成本 ${ap} AP`;
    remaining.textContent = `签发后剩余 ${3 - ap} AP`;
    issue.disabled = false;
    issue.querySelector('span').textContent = '签发命令';
  }

  cards.forEach(card => card.addEventListener('click', () => selectCard(card)));
  issue.addEventListener('click', () => {
    selected.classList.add('is-issued');
    issue.disabled = true;
    issue.querySelector('span').textContent = '预览已签发';
    toast.textContent = '仅展示签发反馈：未结算效果，未写入存档';
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2600);
  });
})();
