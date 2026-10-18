import React, { useEffect, useRef, useState } from 'react';
import { dateRange } from './trip-data.js';
import './plans.css';

export default function Plans({ plans, onOpen, onCreate, onDelete }) {
  const [deletingId, setDeletingId] = useState(null), [error, setError] = useState('');
  const dialog = useRef(null);
  const deleting = plans.find(plan => plan.id === deletingId);
  useEffect(() => {
    if (deleting && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [deleting?.id]);
  const confirmDelete = () => {
    try {
      if (onDelete(deleting.id) === false) { setError('Chưa xóa được kế hoạch. Hãy thử lại.'); return; }
      setDeletingId(null); setError('');
    } catch (error) { setError(error.message || 'Chưa xóa được kế hoạch.'); }
  };
  return <main className="page">
    <div className="title"><h1>Kế hoạch của tôi ({plans.length})</h1><button className="green" onClick={onCreate}>Tạo kế hoạch mới</button></div>

    {plans.length === 0 && <section className="box">Chưa có kế hoạch. Tạo kế hoạch đầu tiên để bắt đầu.</section>}
    <div className="plans-grid">{plans.map(plan => <article className="box" key={plan.id}>
      <h2>{plan.origin} → {plan.destination}</h2><p>{dateRange(plan)} · {plan.days} ngày</p>
      <p>{plan.itinerary.reduce((n, day) => n + day.places.length, 0)} điểm · {plan.completedAt ? 'Đã hoàn thành' : 'Đang lên kế hoạch'}</p>
      <div className="plan-actions"><button className="green" onClick={() => onOpen(plan.id)}>Mở kế hoạch</button>
        <button className="plan-delete" onClick={() => { setError(''); setDeletingId(plan.id); }} aria-label={`Xóa kế hoạch ${plan.origin} đến ${plan.destination}`}>Xóa kế hoạch</button></div>
    </article>)}</div>
    {deleting && <dialog ref={dialog} className="plan-delete-dialog" aria-labelledby="delete-plan-title" onClose={() => setDeletingId(null)}>
      <h2 id="delete-plan-title">Xóa kế hoạch này?</h2><p><b>{deleting.origin} → {deleting.destination}</b></p>
      <p>Lịch trình, checklist và ghi chú trong kế hoạch sẽ bị xóa. Nhật ký và đơn chỗ nghỉ đã lưu vẫn được giữ.</p>
      {error && <p role="alert">{error}</p>}
      <div className="plan-actions"><button autoFocus className="soft" onClick={() => setDeletingId(null)}>Hủy</button><button className="plan-delete confirm" onClick={confirmDelete}>Xóa kế hoạch</button></div>
    </dialog>}
  </main>;
}
