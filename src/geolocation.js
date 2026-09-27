export function locationError(error) {
  if (error?.code === 1) return 'Quyền vị trí đang bị tắt. Hãy cho phép vị trí trong cài đặt của trang rồi thử lại.';
  if (error?.code === 2) return 'Chưa xác định được vị trí. Hãy bật dịch vụ vị trí trên thiết bị rồi thử lại.';
  if (error?.code === 3) return 'Lấy vị trí quá lâu. Hãy thử lại ở nơi có tín hiệu tốt hơn.';
  return 'Không lấy được vị trí. Vui lòng thử lại.';
}

export function locationPoint(position) {
  const { longitude, latitude, accuracy } = position?.coords || {};
  if (![longitude, latitude, accuracy].every(Number.isFinite) || Math.abs(longitude) > 180 || Math.abs(latitude) > 90 || accuracy < 0) {
    throw new Error('Thiết bị trả về vị trí không hợp lệ. Hãy thử lại.');
  }
  return { coordinates: [longitude, latitude], accuracy, timestamp: position.timestamp };
}

// Invoked only after a user action. Positions stay in memory; callers own the UI.
// The disposer ignores late callbacks, including an uncancellable one-shot request.
export function requestLocation({ geolocation = globalThis.navigator?.geolocation, secure = globalThis.isSecureContext, watch = false, onPosition, onError }) {
  let active = true, watchId;
  const stop = () => {
    active = false;
    if (watchId !== undefined) { geolocation.clearWatch(watchId); watchId = undefined; }
  };
  const fail = error => {
    if (!active) return;
    if (!watch || error?.code === 1) stop();
    onError(locationError(error), { fatal: !active });
  };
  if (!secure || !geolocation) {
    onError(!secure ? 'Định vị cần mở website bằng HTTPS hoặc localhost.' : 'Trình duyệt này chưa hỗ trợ định vị.', { fatal: true });
    return stop;
  }
  const success = position => {
    if (!active) return;
    let point;
    try { point = locationPoint(position); }
    catch (error) { onError(error.message); if (!watch) stop(); return; }
    if (!watch) stop();
    onPosition(point);
  };
  const options = { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 };
  try {
    if (watch) {
      watchId = geolocation.watchPosition(success, fail, options);
      if (!active) stop();
    } else geolocation.getCurrentPosition(success, fail, options);
  } catch (error) { stop(); onError(locationError(error), { fatal: true }); }
  return stop;
}
