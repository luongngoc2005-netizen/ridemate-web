// Bound the whole operation, including geocoding and any routing retries.
export async function withRouteDeadline(work, signal, timeout = 60000) {
  const controller = new AbortController();
  let timer, cancel;
  const stopped = new Promise((_, reject) => {
    cancel = () => {
      controller.abort();
      reject(new DOMException('Aborted', 'AbortError'));
    };
    if (signal?.aborted) { cancel(); return; }
    signal?.addEventListener('abort', cancel, { once: true });
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('Chưa tải được cung đường sau 60 giây. Dịch vụ định vị hoặc tính tuyến đang chậm; bạn có thể xem bản đồ và bấm thử tải lại.'));
    }, timeout);
  });
  try {
    return await Promise.race([stopped, Promise.resolve().then(() => {
      controller.signal.throwIfAborted();
      return work(controller.signal);
    })]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}
