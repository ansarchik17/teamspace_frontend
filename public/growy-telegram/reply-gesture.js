/* Extend the shared message owner with Telegram-style horizontal reply. */
(() => {
  'use strict';
  window.GrowyTelegramBindReply = (row, reply) => {
    let gesture = null, suppressClickUntil = 0;
    row.addEventListener('click', event => { if(performance.now()<suppressClickUntil){event.preventDefault();event.stopImmediatePropagation();} }, true);
    const reset = () => {
      if (gesture && row.hasPointerCapture?.(gesture.id)) row.releasePointerCapture(gesture.id);
      gesture = null;
      row.style.transform = '';
      row.style.userSelect = '';
      row.classList.remove('reply-dragging', 'reply-ready');
    };
    row.addEventListener('pointerdown', event => {
      // Let photos receive their own click so they can open in the media viewer.
      // Capturing the pointer on the row retargets the later click to the row.
      if (event.button !== 0 || event.isPrimary === false || event.target.closest('button,a,input,textarea,summary,details,img,video,audio,iframe')) return;
      gesture = {id:event.pointerId,x:event.clientX,y:event.clientY,active:false,ready:false};
      row.setPointerCapture?.(event.pointerId);
    });
    row.addEventListener('pointermove', event => {
      if (!gesture || gesture.id !== event.pointerId) return;
      const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
      if (!gesture.active && Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)) { reset(); return; }
      if (!gesture.active && Math.abs(dx) < 10) return;
      gesture.active = true;
      gesture.ready = Math.abs(dx) >= 56;
      event.preventDefault();
      row.style.userSelect = 'none';
      row.style.transform = `translateX(${Math.sign(dx) * Math.min(88, Math.abs(dx) * .8)}px)`;
      row.classList.add('reply-dragging');
      row.classList.toggle('reply-ready', gesture.ready);
    });
    row.addEventListener('pointerup', event => {
      if (!gesture || gesture.id !== event.pointerId) return;
      const ready = gesture.ready, active = gesture.active;
      reset();
      if (ready) { event.preventDefault(); reply.click(); }
      if (active) suppressClickUntil = performance.now() + 300;
    });
    row.addEventListener('pointercancel', reset);
    row.addEventListener('lostpointercapture', () => { if (gesture) reset(); });
    row.addEventListener('dragstart', event => event.preventDefault());
    row.addEventListener('dblclick', event => {
      if (!event.target.closest('button,a,summary,details,video,audio')) reply.click();
    });
  };
})();
