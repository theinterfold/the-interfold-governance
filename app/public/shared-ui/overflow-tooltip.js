/* Shared Governance + Dashboard behavior. Source: implementation/shared-ui/overflow-tooltip.
   Deliberately framework-independent: works across React routes and DOM-rendered views. */
(() => {
  'use strict';
  if (window.InterfoldOverflowTooltip) { window.InterfoldOverflowTooltip.refresh(); return; }
  const entries = new Map(), pending = new Set();
  const interactive = 'a[href],button:not([disabled]),summary,[tabindex]:not([tabindex="-1"])';
  let tip, content, active = null, focused = null, hovered = null, dismissed = null;
  let showTimer = 0, hideTimer = 0, exitTimer = 0, frame = 0, trackFrame = 0, ready = false;
  const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const text = el => (el.dataset.overflowLabel || el.textContent || '').replace(/\s+/g, ' ').trim();
  const clipped = el => el.isConnected && el.getClientRects().length > 0 &&
    (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1);
  function eligible(el) {
    if (!(el instanceof HTMLElement) || el === tip || tip?.contains(el) ||
        el.closest('[data-overflow-tooltip="off"]') || el.isContentEditable ||
        /^(INPUT|TEXTAREA|SELECT|OPTION|SCRIPT|STYLE|NOSCRIPT)$/.test(el.tagName)) return false;
    const css = getComputedStyle(el);
    return css.textOverflow === 'ellipsis' ||
      parseInt(css.getPropertyValue('-webkit-line-clamp'), 10) > 0;
  }
  function owner(el) { return el.closest(interactive) || el.querySelector(interactive) || el; }
  function describe(el, on) {
    const target = entries.get(el)?.owner;
    if (!target) return;
    const ids = new Set((target.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
    on ? ids.add(tip.id) : ids.delete(tip.id);
    if (ids.size) target.setAttribute('aria-describedby', [...ids].join(' '));
    else target.removeAttribute('aria-describedby');
  }
  function close() {
    clearTimeout(showTimer); clearTimeout(hideTimer); clearTimeout(exitTimer);
    cancelAnimationFrame(trackFrame);
    if (active) describe(active, false);
    active = null;
    if (!tip || tip.hidden) return;
    tip.dataset.state = 'closed';
    exitTimer = setTimeout(() => { tip.hidden = true; }, reducedMotion() ? 0 : 100);
  }
  function trackPosition(previous = '') {
    if (!active) return;
    const r = active.getBoundingClientRect();
    const current = [r.x, r.y, r.width, r.height].join(',');
    if (current !== previous) position();
    if (active) trackFrame = requestAnimationFrame(() => trackPosition(current));
  }
  function render(el) {
    content.textContent = text(el);
    tip.querySelector('.ui-overflow-tooltip-hit')?.remove();
    const target = entries.get(el)?.owner;
    if (!target?.matches('a[href]')) return;
    // Preserve native modified/middle clicks as well as the application's
    // ordinary link handler when the reveal sits over the original label.
    const hit = document.createElement('a');
    hit.className = 'ui-overflow-tooltip-hit';
    for (const name of ['href', 'target', 'rel', 'download']) {
      if (target.hasAttribute(name)) hit.setAttribute(name, target.getAttribute(name));
    }
    hit.tabIndex = -1;
    hit.setAttribute('aria-hidden', 'true');
    tip.append(hit);
  }
  function position() {
    if (!active || !clipped(active)) { close(); return; }
    const host = active.closest('dialog[open]') || document.body;
    if (tip.parentElement !== host) host.append(tip);
    const rect = active.getBoundingClientRect(), inset = 16;
    if (rect.bottom <= 0 || rect.top >= innerHeight || rect.right <= 0 || rect.left >= innerWidth) {
      close(); return;
    }
    const css = getComputedStyle(active);
    for (const name of ['font-family', 'font-size', 'font-weight', 'font-style',
      'font-stretch', 'font-variation-settings', 'font-feature-settings',
      'line-height', 'letter-spacing', 'word-spacing', 'text-transform', 'color', 'direction']) {
      tip.style.setProperty(name, css.getPropertyValue(name));
    }
    const number = name => parseFloat(css.getPropertyValue(name)) || 0;
    const x = rect.left + number('border-left-width') + number('padding-left');
    const y = rect.top + number('border-top-width') + number('padding-top');
    const sourceWidth = active.clientWidth - number('padding-left') - number('padding-right');
    const multiline = parseInt(css.getPropertyValue('-webkit-line-clamp'), 10) > 1;
    const rightAligned = css.textAlign === 'right' || (css.direction === 'rtl' && css.textAlign === 'start');
    const right = rect.right - number('border-right-width') - number('padding-right');
    const edge = rightAligned ? Math.min(innerWidth - inset, right + 6) : Math.max(inset, x - 6);
    const available = rightAligned ? edge - inset : innerWidth - inset - edge;
    tip.style.maxWidth = Math.max(24, available) + 'px';
    tip.style.width = multiline ? Math.min(sourceWidth + 12, available) + 'px' : 'max-content';
    tip.style.textAlign = rightAligned ? 'right' : 'left';
    tip.style.cursor = entries.get(active)?.owner.matches('a[href],button,summary') ? 'pointer' : css.cursor;
    tip.style.maxHeight = Math.max(40, innerHeight - inset * 2) + 'px';
    tip.style.left = (rightAligned ? edge - tip.offsetWidth : edge) + 'px';
    tip.style.top = Math.max(inset, Math.min(innerHeight - tip.offsetHeight - inset, y - 4)) + 'px';
  }
  function show(el, keyboard = false) {
    clearTimeout(showTimer); clearTimeout(hideTimer);
    if (!el || el === dismissed || !clipped(el)) return;
    if (active === el) { clearTimeout(exitTimer); tip.dataset.state = 'open'; return; }
    showTimer = setTimeout(() => {
      if (!el.isConnected || !clipped(el) || el === dismissed) return;
      clearTimeout(exitTimer);
      if (active) describe(active, false);
      active = el;
      render(el);
      tip.hidden = false;
      tip.dataset.state = 'open';
      position();
      if (active) {
        describe(el, true);
        cancelAnimationFrame(trackFrame);
        trackPosition();
      }
    }, keyboard ? 0 : 300);
  }
  function deferClose() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (!hovered && !focused && !tip.matches(':hover')) close();
    }, 120);
  }
  function update(el) {
    const entry = entries.get(el);
    if (!entry) return;
    const overflow = eligible(el) && clipped(el);
    const target = owner(el);
    if (entry.addedTabIndex && (!overflow || entry.owner !== target)) {
      if (entry.owner.getAttribute('tabindex') === '0') entry.owner.removeAttribute('tabindex');
      entry.addedTabIndex = false;
    }
    entry.owner = target;
    if (overflow && target === el && !el.matches(interactive)) {
      el.setAttribute('tabindex', '0');
      entry.addedTabIndex = true;
    }
    if (active === el) {
      if (!overflow) close();
      else { render(el); position(); }
    }
  }
  const resize = new ResizeObserver(changes => changes.forEach(({target}) => update(target)));
  function register(el) {
    if (!eligible(el)) return;
    if (!entries.has(el)) {
      entries.set(el, { owner: owner(el), addedTabIndex: false, title: el.getAttribute('title') });
      // Suppress the competing browser tooltip, including when the text fits.
      el.removeAttribute('title');
      resize.observe(el);
    }
    update(el);
  }
  function scan(scope) {
    if (!scope?.isConnected || scope === tip || tip?.contains(scope)) return;
    if (scope instanceof HTMLElement) register(scope);
    scope.querySelectorAll?.('*').forEach(register);
  }
  function refresh(scope = document.body) {
    if (!ready) return;
    pending.add(scope);
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      for (const [el, entry] of entries) if (!el.isConnected) {
        if (active === el) close();
        if (focused === el) focused = null;
        if (hovered === el) hovered = null;
        if (entry.addedTabIndex) el.removeAttribute('tabindex');
        resize.unobserve(el); entries.delete(el);
      }
      const scopes = [...pending]; pending.clear();
      scopes.filter(s => !scopes.some(other => other !== s && other.contains?.(s))).forEach(scan);
    });
  }
  function find(node, includeOwned = false) {
    if (!(node instanceof Element) || node === tip || tip.contains(node)) return null;
    let el = node;
    while (el && el !== document.body) {
      if (eligible(el)) {
        register(el);
        if (clipped(el)) return el;
      }
      el = el.parentElement;
    }
    if (includeOwned) for (const [candidate, entry] of entries) {
      if (entry.owner === node && clipped(candidate)) return candidate;
    }
    return null;
  }
  function start() {
    tip = document.createElement('div');
    tip.id = 'interfold-overflow-tooltip';
    tip.className = 'ui-overflow-tooltip';
    tip.setAttribute('role', 'tooltip');
    content = document.createElement('span');
    content.className = 'ui-overflow-tooltip-text';
    tip.append(content);
    tip.addEventListener('pointerdown', event => {
      // Keep focus on the real control until its click handler runs.
      if (event.button === 0 && active && entries.get(active)?.owner.matches('a[href],button,summary')) {
        event.preventDefault();
      }
    });
    tip.addEventListener('click', event => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = active && entries.get(active)?.owner;
      if (target?.matches('a[href],button,summary')) {
        event.preventDefault();
        event.stopPropagation();
        close();
        target.click();
      }
    });
    tip.hidden = true;
    document.body.append(tip);
    ready = true;
    scan(document.body);
    const observer = new MutationObserver(changes => {
      for (const change of changes) {
        if (change.target === tip || tip.contains(change.target)) continue;
        if (change.type === 'childList') {
          change.addedNodes.forEach(n => { if (n instanceof Element) refresh(n); });
          refresh(change.target);
        } else refresh(change.target instanceof Element ? change.target : change.target.parentElement);
      }
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true,
      attributes: true, attributeFilter: ['class', 'style', 'data-overflow-label'] });
    document.addEventListener('pointerover', event => {
      if (tip.contains(event.target)) { clearTimeout(hideTimer); return; }
      const candidate = find(event.target);
      if (candidate !== dismissed) dismissed = null;
      if (candidate !== hovered) {
        hovered = candidate;
        if (candidate) show(candidate); else if (!focused) deferClose();
      }
    });
    document.addEventListener('pointerout', event => {
      const next = event.relatedTarget;
      if (next instanceof Node && (tip.contains(next) || hovered?.contains(next))) return;
      hovered = null;
      // Hiding an in-place tip uncovers its source beneath the pointer.
      // Escape stays dismissed until the pointer really leaves that label.
      if (!(next instanceof Node && dismissed?.contains(next))) dismissed = null;
      clearTimeout(showTimer); deferClose();
    });
    document.addEventListener('focusin', event => {
      focused = find(event.target, true);
      dismissed = null;
      if (focused) show(focused, true); else if (!hovered) close();
    });
    document.addEventListener('focusout', () => {
      focused = null;
      if (!hovered) deferClose();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && active) {
        dismissed = active; close(); event.stopPropagation();
      }
    }, true);
    document.addEventListener('pointerdown', event => {
      if (active && !active.contains(event.target) && !tip.contains(event.target)) close();
    });
    document.addEventListener('scroll', event => {
      if (tip.contains(event.target)) return;
      hovered = null;
      // Keyboard navigation may scroll the focused row into view. Keep its
      // description attached; pointer-only tooltips close when the page moves.
      if (focused && entries.get(focused)?.owner === document.activeElement) {
        if (active === focused) position();
        else show(focused, true);
      } else close();
    }, true);
    addEventListener('resize', () => { for (const el of entries.keys()) update(el); position(); });
    document.fonts?.ready.then(() => refresh());
  }
  window.InterfoldOverflowTooltip = { refresh };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
