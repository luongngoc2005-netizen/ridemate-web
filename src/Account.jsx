import React, { useEffect, useRef, useState } from 'react';
import { supabase, authRedirect } from './supabase.js';
import { readCloud, requireUser, downloadCloud } from './cloud-data.js';
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

export default function Account({ account, onRestored, onBusy, localError, planSync }) {
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
    if (!window.confirm(`Lưu các kế hoạch lên ${session.user.email}? Nhật ký trên tài khoản được giữ nguyên.`)) return;
    await requireUser(supabase, userId);
    const payload = { version: 1, trip: workspace.trip, trips: workspace.trips || (workspace.trip?[workspace.trip]:[]), entries: cloud?.payload.entries || [] };
    const { data: revision, error } = await supabase.rpc('save_workspace', { expected_user_id: userId, expected_revision: cloud?.revision || 0, new_payload: payload });
    if (error?.code === '40001') throw new Error('Tài khoản vừa có thay đổi. Hãy kiểm tra bản trên tài khoản rồi lưu lại.');
    if (error) throw error;
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
    setMessage('Đã tải bản sao chuyến đi, nhật ký và ảnh về trình duyệt. Khi đăng nhập, trang Nhật ký luôn dùng dữ liệu trên tài khoản.');
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
      {!recovery && supabase && mode !== 'reset' && (
        <div className="oauth-divider">
          <span>hoặc</span>
        </div>
      )}
      {!recovery && supabase && mode !== 'reset' && (
        <button disabled={busy} className="oauth-btn google" onClick={() => run(async () => {
          const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: authRedirect() }
          });
          if (error) throw error;
        })}>
          <svg viewBox="0 0 24 24" width="20" height="20"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          Đăng nhập bằng Google
        </button>
      )}
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
      <p>Kế hoạch, lịch trình, ghi chú và checklist tự đồng bộ theo tài khoản. Khi mất mạng, bản sửa được giữ trên thiết bị để gửi lại. Nhật ký lưu trực tiếp theo tài khoản.</p>
      {planSync&&<button className="soft" disabled={busy||planSync.loading} onClick={()=>run(async()=>{if(window.confirm('Nhập các kế hoạch khách trên trình duyệt này vào tài khoản hiện tại? Kế hoạch trùng ID được giữ theo tài khoản.'))planSync.importGuest();})}>Nhập kế hoạch khách từ trình duyệt</button>}
      <div className="account-actions">
        <button disabled={busy} className="soft" onClick={inspect}>Kiểm tra bản trên tài khoản</button>
        {!planSync&&<><button disabled={busy || cloud === undefined} className="green" onClick={upload}>Lưu các kế hoạch</button>
        <button disabled={busy || !cloud} className="soft" onClick={download}>Tải về trình duyệt</button></>}
      </div>
      {cloud && <p>Bản {cloud.revision} · {new Date(cloud.updated_at).toLocaleString('vi-VN')} · {cloud.payload.entries.length} bài nhật ký · {(cloud.payload.trips || (cloud.payload.trip?[cloud.payload.trip]:[])).length} kế hoạch</p>}
      <p>Nhật ký cũ lưu riêng trên trình duyệt có thể nhập từ trang Nhật ký bằng nút “Nhập nhật ký cũ từ trình duyệt”. Việc lưu chuyến không ghi đè nhật ký.</p>
      <button disabled={busy} className="soft" onClick={() => run(async () => { const { error } = await supabase.auth.signOut({ scope: 'local' }); if (error) throw error; })}>Đăng xuất</button>
      <p className="muted-copy">Đăng xuất quay về kế hoạch khách. Bản dự phòng của mỗi tài khoản được giữ riêng trên thiết bị; không tự nhập sang tài khoản khác.</p>
    </>}
    {!planSync&&<div className="account-actions"><button disabled={busy} className="soft" onClick={undo}>Khôi phục bản trước khi tải</button></div>}
    {busy && <p role="status">Đang xử lý dữ liệu… Hãy giữ trang này mở.</p>}
    {(error || account.error) && <p role="alert" className="storage-warning">{error || account.error}</p>}
    {message && <p role="status" className="save-feedback">{message}</p>}
  </section></main>;
}
