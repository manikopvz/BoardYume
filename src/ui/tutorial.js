const TUTORIAL_KEY = 'boardyume:tutorial-complete:v2';

const STEPS = Object.freeze([
  {
    title: 'Chào mừng đến Vườn Mộng',
    text: 'Kéo trên khu vườn để quan sát. Dùng hai ngón tay hoặc con lăn để thu phóng khung nhìn.',
    target: '.game-viewport',
  },
  {
    title: 'Di chuyển và tương tác',
    text: 'Dùng WASD hoặc phím mũi tên để di chuyển. Trên điện thoại, chạm ô đất gần nhân vật để đi tới.',
    target: '.world-entity--player',
  },
  {
    title: 'Công cụ làm vườn',
    text: 'Chọn cuốc đất, hạt giống và bình tưới theo thứ tự. Chạm ô đất để thực hiện công việc.',
    target: '.toolbelt',
  },
  {
    title: 'Xây và chế tạo',
    text: 'Mở Sổ xây dựng để đặt công trình. Xưởng sản xuất sẽ mở các công thức chế tạo mới.',
    target: '[data-panel="build"]',
  },
  {
    title: 'Phát triển khu vườn',
    text: 'Thu hoạch, bán nông sản, hoàn thành nhiệm vụ và mở khóa thêm cây trồng, công trình cùng vùng đất mới.',
    target: '[data-panel="quests"]',
  },
]);

export function createTutorial(parent, { onComplete } = {}) {
  const backdrop = document.createElement('div');
  backdrop.className = 'tutorial-backdrop';
  backdrop.hidden = true;

  const card = document.createElement('section');
  card.className = 'tutorial-card ui-raster-panel';
  card.hidden = true;
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  card.setAttribute('aria-label', 'Hướng dẫn lần đầu');

  const progress = document.createElement('span');
  progress.className = 'tutorial-card__progress';
  const title = document.createElement('h2');
  const text = document.createElement('p');
  const actions = document.createElement('div');
  actions.className = 'tutorial-card__actions';
  const skip = document.createElement('button');
  skip.type = 'button';
  skip.className = 'ui-raster-button';
  skip.textContent = 'Bỏ qua';
  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'ui-raster-button is-primary';
  next.textContent = 'Tiếp theo';
  actions.append(skip, next);
  card.append(progress, title, text, actions);
  parent.append(backdrop, card);

  let stepIndex = 0;
  let highlighted = null;

  function clearHighlight() {
    highlighted?.classList.remove('tutorial-focus');
    highlighted = null;
  }

  function render() {
    clearHighlight();
    const step = STEPS[stepIndex];
    progress.textContent = `${stepIndex + 1} / ${STEPS.length}`;
    title.textContent = step.title;
    text.textContent = step.text;
    next.textContent = stepIndex === STEPS.length - 1 ? 'Bắt đầu chơi' : 'Tiếp theo';
    highlighted = document.querySelector(step.target);
    highlighted?.classList.add('tutorial-focus');
  }

  function open(force = false) {
    try {
      if (!force && localStorage.getItem(TUTORIAL_KEY) === '1') return false;
    } catch { /* Storage can be unavailable in private browsing. */ }
    stepIndex = 0;
    backdrop.hidden = false;
    card.hidden = false;
    parent.classList.add('has-active-tutorial');
    render();
    requestAnimationFrame(() => next.focus({ preventScroll: true }));
    return true;
  }

  function close(completed = false) {
    clearHighlight();
    backdrop.hidden = true;
    card.hidden = true;
    parent.classList.remove('has-active-tutorial');
    if (completed) {
      try { localStorage.setItem(TUTORIAL_KEY, '1'); } catch { /* Non-fatal. */ }
      onComplete?.();
    }
  }

  skip.addEventListener('click', () => close(true));
  function advance() {
    if (stepIndex >= STEPS.length - 1) close(true);
    else {
      stepIndex += 1;
      render();
      requestAnimationFrame(() => next.focus({ preventScroll: true }));
    }
  }
  next.addEventListener('click', advance);
  card.addEventListener('pointerdown', (event) => event.stopPropagation());
  document.addEventListener('keydown', (event) => {
    if (card.hidden) return;
    if (event.key === 'Escape') { event.preventDefault(); close(true); }
    if (event.key === 'Enter' && event.target?.tagName !== 'BUTTON') { event.preventDefault(); advance(); }
  });

  return { root: card, open, close, get active() { return !card.hidden; } };
}
