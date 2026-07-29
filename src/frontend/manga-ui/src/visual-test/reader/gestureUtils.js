/**
 * 手势工具 — 统一处理 swipe / grab / click
 *
 * 翻页手势:
 *   拖拽 > 100px 或 速度 > 300px/s → 翻页
 *   拖拽 < 5px → 判定为点击
 *
 * Grab 滚动 (continuous 模式):
 *   拖拽移动 scrollLeft/scrollTop
 */

export function createSwipeDetector(onSwipeNext, onSwipePrev) {
  let startX = 0, startY = 0, startTime = 0;
  let locked = false;      // 锁定了翻页方向
  let lockedAxis = null;   // 'x' | 'y'
  const THRESHOLD = 80;    // px
  const LOCK_DIST = 20;    // 锁定方向所需的距离
  const VELOCITY_THRESHOLD = 0.3; // px/ms

  const onDown = (clientX, clientY) => {
    startX = clientX;
    startY = clientY;
    startTime = Date.now();
    locked = false;
    lockedAxis = null;
  };

  const onMove = (clientX, clientY) => {
    if (locked) return;
    const dx = clientX - startX;
    const dy = clientY - startY;
    if (!lockedAxis && (Math.abs(dx) > LOCK_DIST || Math.abs(dy) > LOCK_DIST)) {
      lockedAxis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      locked = true;
    }
  };

  const onUp = (clientX, clientY) => {
    const elapsed = Date.now() - startTime;
    const dx = clientX - startX;
    const dy = clientY - startY;
    const dist = Math.abs(dx) + Math.abs(dy);
    const velocity = dist / Math.max(elapsed, 1);

    if (dist < 5) return 'click';

    if (lockedAxis === 'x' && (Math.abs(dx) > THRESHOLD || velocity > VELOCITY_THRESHOLD)) {
      return dx > 0 ? 'prev' : 'next';
    }
    if (lockedAxis === 'y' && (Math.abs(dy) > THRESHOLD || velocity > VELOCITY_THRESHOLD)) {
      return dy > 0 ? 'prev' : 'next';
    }
    return 'cancel';
  };

  return { onDown, onMove, onUp };
}

export function createGrabScroll(ref) {
  let down = false, sx = 0, sy = 0, sl = 0, st = 0;

  const onDown = (e) => {
    const el = ref.current; if (!el) return;
    down = true; sx = e.clientX; sy = e.clientY;
    sl = el.scrollLeft; st = el.scrollTop;
  };
  const onMove = (e) => {
    if (!down || !ref.current) return;
    ref.current.scrollLeft = sl - (e.clientX - sx);
    ref.current.scrollTop  = st - (e.clientY - sy);
  };
  const onUp = () => { down = false; };
  return { onDown, onMove, onUp, get isDown() { return down; } };
}
