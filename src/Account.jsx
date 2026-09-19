import React, { useEffect, useRef, useState } from 'react';
import { supabase, authRedirect } from './supabase.js';
import { readCloud, saveCloud, downloadCloud } from './cloud-data.js';
import { readLocalWorkspace, applyWorkspace } from './workspace-data.js';
import { readWorkspaceBackup } from './journal-data.js';
import './account.css';
import { accountName } from './account-name.js';

export function useAccount() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(!!supabase);
  const [recovery, setRecovery] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!supabase) return;
    // INITIAL_SESSION is emitted by the SDK after callback/session processing.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next); setLoading(false);
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      if (event === 'SIGNED_OUT') setRecovery(false);
    });
    supabase.auth.getSession().then(({ error: failure }) => {
      if (failure) { setError('Không mở được phiên đăng nhập. Hãy tải lại trang.'); setLoading(false); }
    }).catch(() => { setError('Không mở được phiên đăng nhập.'); setLoading(false); });
    return () => subscription.unsubscribe();
  }, []);
  return { session, loading, recovery, setRecovery, error };
}

export default function Account({ account, onRestored, onBusy, localError }) {
  const { session, loading, recovery, setRecovery } = account;
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [profileName, setProfileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [cloud, setCloud] = useState(undefined);
  const userId = session?.user.id;
  useEffect(() => { setProfileName(session?.user ? accountName(session.user) : ''); }, [userId, session?.user.user_metadata]);
  const currentUser = useRef(userId);
  currentUser.current = userId;
  useEffect(() => { setCloud(undefined); setError(''); setMessage(''); setPassword(''); }, [userId]);
  const guard = () => {
    if (currentUser.current !== userId) throw new Error('Tài khoản đã thay đổi. Hãy thử lại.');
  };
  async function run(action) {
    setBusy(true); onBusy(true); setError(''); setMessage('');
    try { await action(); }
    catch (e) { setError(e.message || 'Thao tác chưa thành công. Hãy thử lại.'); }
    finally { setBusy(false); onBusy(false); }
  }
  async function authenticate(event) {
    event.preventDefault();
    await run(async () => {
      let result;
      if (recovery) result = await supabase.auth.updateUser({ password });
      else if (mode === 'register') {
        if (!fullName.trim()) throw new Error('Vui lòng nhập tên hiển thị.');
        result = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: authRedirect(), data: { full_name: fullName.trim() } } });
      }
      else if (mode === 'reset') result = await supabase.auth.resetPasswordForEmail(email, { redirectTo: authRedirect() });
      else result = await supabase.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      setPassword('');
      if (recovery) { setRecovery(false); setMessage('Đã đổi mật khẩu.'); }
      else if (mode === 'register') setMessage('Nếu cần xác nhận email, hãy mở liên kết trong hộp thư để hoàn tất đăng ký.');
      else if (mode === 'reset') setMessage('Nếu email đã đăng ký, bạn sẽ nhận được liên kết đặt lại mật khẩu.');
    });
  }
  const inspect = () => run(async () => {
    const row = await readCloud(supabase, userId); guard(); setCloud(row);
    if (!row) setMessage('Tài khoản chưa có bản lưu. Bạn có thể lưu dữ liệu trên trình duyệt lên tài khoản.');
  });
  const upload = () => run(async () => {
    if (localError) throw new Error('Hãy xử lý lỗi lưu dữ liệu trình duyệt trước khi gửi lên tài khoản.');
    if (cloud === undefined) throw new Error('Hãy kiểm tra bản trên tài khoản trước.');
    const workspace = await readLocalWorkspace(); guard();
    if (!window.confirm(`Lưu ${workspace.trip ? '1 chuyến đang lập' : '0 chuyến đang lập'} và ${workspace.entries.length} bài nhật ký lên ${session.user.email}?${cloud ? ' Bản trên tài khoản sẽ được thay thế bằng dữ liệu của trình duyệt này.' : ''}`)) return;
    const revision = await saveCloud(supabase, userId, workspace, cloud?.revision || 0);
    guard();
    // Re-read metadata before another write; never silently adopt a newer revision.
    setCloud(undefined);
    setMessage(`Đã lưu bản ${revision} lên tài khoản. Dữ liệu trên trình duyệt được giữ nguyên.`);
  });
  const download = () => run(async () => {
    if (!cloud) return;
    if (!window.confirm('Tải bản trên tài khoản sẽ thay thế chuyến đi và nhật ký trên trình duyệt này. Bản hiện tại được giữ để khôi phục. Hãy đóng các tab RideMate khác trước khi tiếp tục.')) return;
    const workspace = await downloadCloud(supabase, userId, cloud); guard();
    await applyWorkspace(workspace); onRestored(workspace.trip);
    setMessage('Đã tải đủ chuyến đi, nhật ký và ảnh. Thay đổi tiếp theo vẫn cần bấm Lưu lên tài khoản.');
  });
  const undo = () => run(async () => {
    const workspace = await readWorkspaceBackup();
    if (!workspace) throw new Error('Chưa có bản dự phòng trên trình duyệt này.');
    if (!window.confirm('Khôi phục dữ liệu trình duyệt trước lần tải/khôi phục gần nhất? Thao tác này không thay đổi bản trên tài khoản.')) return;
    await applyWorkspace(workspace); onRestored(workspace.trip);
    setMessage('Đã khôi phục bản dữ liệu trình duyệt trước đó.');
  });
  return <main className="page narrow account-page"><section className="card">
    <h1>Tài khoản và dữ liệu</h1>
    <p>Bạn có thể dùng thử trên trình duyệt, sau đó đăng nhập để lưu và tải chuyến đi trên thiết bị khác.</p>
    {!supabase ? <p role="status">Tính năng tài khoản chưa được cấu hình. Bạn vẫn có thể lập chuyến đi và viết nhật ký trên trình duyệt này.</p> : loading ? <p role="status">Đang mở phiên đăng nhập…</p> : recovery || !session ? <>
      <h2>{recovery ? 'Đặt mật khẩu mới' : mode === 'register' ? 'Đăng ký' : mode === 'reset' ? 'Quên mật khẩu' : 'Đăng nhập'}</h2>
      <form onSubmit={authenticate}><fieldset disabled={busy}>
        {!recovery && mode === 'register' && <label>Tên hiển thị<input required maxLength={80} autoComplete="name" value={fullName} onChange={e => setFullName(e.target.value)} /></label>}
        {!recovery && <label>Email<input required type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></label>}
        {(recovery || mode !== 'reset') && <label>Mật khẩu<input required type="password" minLength={mode === 'login' && !recovery ? 1 : 8} autoComplete={mode === 'login' && !recovery ? 'current-password' : 'new-password'} value={password} onChange={e => setPassword(e.target.value)} /></label>}
        <button className="green" type="submit">{recovery ? 'Lưu mật khẩu mới' : mode === 'register' ? 'Tạo tài khoản' : mode === 'reset' ? 'Gửi liên kết' : 'Đăng nhập'}</button>
      </fieldset></form>
      {!recovery && <div className="account-actions">
        {['login', 'register', 'reset'].filter(item => item !== mode).map(item => <button disabled={busy} key={item} className="soft" onClick={() => { setMode(item); setError(''); setMessage(''); setPassword(''); }}>{item === 'login' ? 'Đăng nhập' : item === 'register' ? 'Đăng ký' : 'Quên mật khẩu'}</button>)}
      </div>}
    </> : <>
      <h2>Xin chào, {accountName(session.user)}</h2>
      <p>{session.user.email}</p>
      <form onSubmit={event => { event.preventDefault(); run(async () => {
        const name = profileName.trim();
        if (!name) throw new Error('Vui lòng nhập tên hiển thị.');
        const { error } = await supabase.auth.updateUser({ data: { full_name: name } });
        if (error) throw error;
        setMessage('Đã cập nhật tên hiển thị.');
      }); }}><fieldset disabled={busy}>
        <label>Tên hiển thị<input required maxLength={80} autoComplete="name" value={profileName} onChange={e => setProfileName(e.target.value)} /></label>
        <button className="soft" type="submit">Lưu tên</button>
      </fieldset></form>
      <p>Dữ liệu đang xem thuộc trình duyệt này. Đăng nhập không tự tải hoặc gửi dữ liệu. Hãy kiểm tra đúng tài khoản trước khi lưu.</p>
      <div className="account-actions">
        <button disabled={busy} className="soft" onClick={inspect}>Kiểm tra bản trên tài khoản</button>
        <button disabled={busy || cloud === undefined} className="green" onClick={upload}>Lưu lên tài khoản</button>
        <button disabled={busy || !cloud} className="soft" onClick={download}>Tải về trình duyệt</button>
      </div>
      {cloud && <p>Bản {cloud.revision} · {new Date(cloud.updated_at).toLocaleString('vi-VN')} · {cloud.payload.entries.length} bài nhật ký · {cloud.payload.trip ? '1 chuyến đang lập' : 'Chưa có chuyến đang lập'}</p>}
      <p>Mỗi lần lưu gửi toàn bộ dữ liệu hiện tại. Chưa tự đồng bộ hay gộp thay đổi giữa các thiết bị.</p>
      <button disabled={busy} className="soft" onClick={() => run(async () => { const { error } = await supabase.auth.signOut({ scope: 'local' }); if (error) throw error; })}>Đăng xuất</button>
      <p className="muted-copy">Đăng xuất giữ nguyên dữ liệu trên trình duyệt. Trên máy dùng chung, dữ liệu đã tải vẫn có thể được xem.</p>
    </>}
    <div className="account-actions"><button disabled={busy} className="soft" onClick={undo}>Khôi phục bản trước khi tải</button></div>
    {busy && <p role="status">Đang xử lý dữ liệu… Hãy giữ trang này mở.</p>}
    {(error || account.error) && <p role="alert" className="storage-warning">{error || account.error}</p>}
    {message && <p role="status" className="save-feedback">{message}</p>}
  </section></main>;
}
