export function createNotifications(parent, { maxVisible = 4, duration = 3600 } = {}) {
  const root = document.createElement('section');
  root.className = 'notification-stack';
  root.setAttribute('aria-live', 'polite');
  root.setAttribute('aria-label', 'Thông báo trò chơi');
  parent.append(root);

  const active = new Set();

  function dismiss(element) {
    if (!element || !active.has(element)) return;
    element.classList.add('is-leaving');
    window.setTimeout(() => {
      active.delete(element);
      element.remove();
    }, 240);
  }

  function show(message, options = {}) {
    const text = typeof message === 'string' ? message : message?.message || message?.text;
    if (!text) return null;
    const notice = document.createElement('div');
    notice.className = `game-notification ui-raster-panel game-notification--${options.type || message?.type || 'info'}`;
    notice.setAttribute('role', options.type === 'error' ? 'alert' : 'status');
    const body = document.createElement('span');
    body.textContent = text;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'game-notification__close';
    close.textContent = 'Đóng';
    close.setAttribute('aria-label', 'Đóng thông báo');
    close.addEventListener('click', () => dismiss(notice));
    notice.append(body, close);
    root.prepend(notice);
    active.add(notice);
    while (active.size > maxVisible) dismiss([...active][0]);
    const timeout = Number(options.duration ?? duration);
    if (timeout > 0) window.setTimeout(() => dismiss(notice), timeout);
    return notice;
  }

  function clear() {
    for (const notice of active) notice.remove();
    active.clear();
  }

  return { root, show, dismiss, clear };
}
