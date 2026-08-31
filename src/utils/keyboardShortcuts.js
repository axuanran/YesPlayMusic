const INTERACTIVE_SELECTOR = [
  'input',
  'textarea',
  'select',
  'button',
  'a[href]',
  '[contenteditable="true"]',
  '[role="textbox"]',
  '[role="button"]',
].join(',');

export function isInteractiveKeyboardTarget(target) {
  if (!target) return false;
  if (target.isContentEditable) return true;
  return Boolean(target.closest?.(INTERACTIVE_SELECTOR));
}

export function shouldHandlePlaybackSpace(event, routeName) {
  return (
    event.code === 'Space' &&
    !event.defaultPrevented &&
    !event.repeat &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    routeName !== 'mv' &&
    !isInteractiveKeyboardTarget(event.target)
  );
}
