import React,{useState} from 'react';
import ToolIcon from './ToolIcon.jsx';

export default function ChatHistory({rows,activeId,disabled,onOpen,onNew,onRename,onDelete,onExport,status,error,onRetry,userId}){
 const [query,setQuery]=useState(''),[editing,setEditing]=useState(null),[title,setTitle]=useState('');
 const visible=rows.filter(row=>!row.chat.deleted).map(row=>row.chat).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
 const fold=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toLowerCase();
 const filtered=visible.filter(chat=>fold(`${chat.title} ${chat.tripLabel} ${chat.snapshot.messages.map(m=>m.text||m.draft?.summary||'').join(' ')}`).includes(fold(query)));
 return <div className="chat-history-content">
  <div className="chat-history-heading"><h2>Lịch sử chat</h2><button type="button" className="soft" disabled={disabled} onClick={onNew}><ToolIcon name="plus"/> Chat mới</button></div>
  <label className="chat-history-search">Tìm hội thoại<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Tên chuyến đi hoặc tin nhắn…"/></label>
  <p className="chat-history-status" role="status">{userId?status==='synced'?'Đã đồng bộ lịch sử.':status==='syncing'?'Đang đồng bộ lịch sử…':'Lịch sử lưu riêng theo tài khoản.':'Lịch sử khách lưu trên trình duyệt này.'}</p>
  {error&&<p className="chat-history-error" role="alert">{error}</p>}
  {userId&&<button type="button" className="chat-sync" disabled={disabled||status==='syncing'} onClick={onRetry}>Đồng bộ lại</button>}
  {!filtered.length&&<p className="chat-history-empty">{visible.length?'Không tìm thấy hội thoại.':'Chưa có hội thoại. Bắt đầu chat để lưu lại quá trình lên kế hoạch.'}</p>}
  <ul className="chat-history-list">{filtered.map(chat=><li key={chat.id} className={chat.id===activeId?'selected':''}>
   {editing===chat.id?<form onSubmit={e=>{e.preventDefault();if(title.trim()){onRename(chat.id,title.trim());setEditing(null);}}}><label>Tên hội thoại<input autoFocus maxLength={100} required value={title} onChange={e=>setTitle(e.target.value)}/></label><div><button type="submit" disabled={disabled}>Lưu tên</button><button type="button" onClick={()=>setEditing(null)}>Hủy</button></div></form>:<>
    <button className="chat-history-open" disabled={disabled} type="button" aria-current={chat.id===activeId?'true':undefined} onClick={()=>onOpen(chat.id)}><b>{chat.title}</b>{chat.tripLabel&&<span>{chat.tripLabel}</span>}<small>{new Date(chat.updatedAt).toLocaleString('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}</small></button>
    <div className="chat-history-actions"><button type="button" disabled={disabled} aria-label={`Đổi tên ${chat.title}`} onClick={()=>{setEditing(chat.id);setTitle(chat.title);}}>Đổi tên</button><button type="button" disabled={disabled} aria-label={`Xóa chat ${chat.title}`} onClick={()=>{if(window.confirm(`Xóa hội thoại “${chat.title}”? Kế hoạch đã tạo vẫn được giữ.`))onDelete(chat.id);}}>Xóa</button></div>
   </>}
  </li>)}</ul>
  <button type="button" className="chat-export" onClick={onExport}>Xuất lịch sử JSON</button>
 </div>;
}
