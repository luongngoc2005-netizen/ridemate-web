import React,{useState,useEffect} from 'react';
import { TripForm, Journey, TripChecklist } from './Journey.jsx';
import { initialDetails, createTrip, editTripDetails, dateRange, readTrip, saveTrip, validDetails } from './trip-data.js';
import {createRoot} from 'react-dom/client';
import './styles.css';
import './journey.css';
import Journal from './Journal.jsx';
import Account, { useAccount } from './Account.jsx';
import { accountName } from './account-name.js';
import ToolIcon from './ToolIcon.jsx';

const routes=[
  ['Hà Nội → Hà Giang','~320 km','4 ngày','https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=85'],
  ['Hà Nội → Cao Bằng','~280 km','3 ngày','https://images.unsplash.com/photo-1501854140801-50d01698950b?auto=format&fit=crop&w=900&q=85'],
  ['Hà Nội → Mộc Châu','~200 km','2 ngày','https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=900&q=85'],
  ['Hà Nội → Cát Bà','~160 km','2 ngày','https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=900&q=85']
];
const tools=[['fuel','Cây xăng','gas station'],['repair','Sửa xe','motorcycle repair'],['food','Ăn uống','restaurant'],['bed','Chỗ nghỉ','hotel'],['medical','Y tế','hospital'],['pin','Điểm hot','tourist attraction']];
const searchMaps=q=>window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`,'_blank');
const directions=(a,b)=>window.open(`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(a)}&destination=${encodeURIComponent(b)}&travelmode=driving`,'_blank');

function Nav({page,setPage,user}){return <header className="nav"><button className="logo" onClick={()=>setPage('home')}><span>▲</span>RideMate</button><nav>{[['home','Khám phá'],['create','Lên kế hoạch'],['tools','Công cụ'],['journal','Nhật ký hành trình'],['ai','AI Assistant']].map(([k,v])=><button className={page===k?'active':''} onClick={()=>setPage(k)} key={k}>{v}</button>)}</nav><button className="account-link" title={user ? accountName(user) : undefined} aria-label={user ? `Tài khoản của ${accountName(user)}` : 'Tài khoản'} onClick={()=>setPage('account')}>{user ? accountName(user) : 'Tài khoản'}</button></header>}

function Home({trip: savedTrip,onCreate,setPage}){const [trip,setTrip]=useState(()=>({...initialDetails,...savedTrip}));return <main className="dash"><div className="maincol">
  <section className="hero"><div><small>RIDE MORE · EXPLORE FURTHER</small><h1>Những cung đường<br/>đẹp hơn khi đi cùng<br/>RideMate</h1><p>Lên kế hoạch dễ dàng · Hành trình an toàn hơn · Trải nghiệm nhiều hơn.</p></div>
    <form className="tripbar" onSubmit={e=>{e.preventDefault();onCreate(trip)}}><label>Điểm xuất phát<input required maxLength={150} value={trip.origin} onChange={e=>setTrip({...trip,origin:e.target.value})}/></label><label>Điểm đến<input required maxLength={150} value={trip.destination} onChange={e=>setTrip({...trip,destination:e.target.value})}/></label><label>Ngày đi<input required type="date" value={trip.date} onChange={e=>setTrip({...trip,date:e.target.value})}/></label><label>Số ngày<input required type="number" min="1" max="30" step="1" value={trip.days} onChange={e=>setTrip({...trip,days:e.target.value})}/></label><button className="orange" type="submit">Tạo chuyến đi →</button></form>
  </section>
  <section className="box"><div className="title"><h2>Công cụ hỗ trợ nhanh</h2><button onClick={()=>setPage('tools')}>Xem tất cả →</button></div><div className="quick"><button onClick={()=>setPage('checklist')}><span><ToolIcon name="checklist"/></span>Checklist</button>{tools.map(t=><button key={t[1]} onClick={()=>searchMaps(t[2])}><span><ToolIcon name={t[0]}/></span>{t[1]}</button>)}<button onClick={()=>setPage('ai')}><span><ToolIcon name="assistant"/></span>AI Assistant</button></div></section>
  <section><div className="title"><h2>Gợi ý cung đường nổi bật</h2><div className="tabs">Miền Bắc · Miền Trung · Miền Nam</div></div><div className="routes">{routes.map(r=><article key={r[0]}><img src={r[3]}/><div><h3>{r[0]}</h3><small>◈ {r[1]} &nbsp; ◷ {r[2]}</small><p>Cung đường giàu trải nghiệm, phù hợp cho chuyến đi tự túc bằng xe máy.</p></div></article>)}</div></section>
</div><aside className="side">{savedTrip && <section className="box"><div className="title"><h2>Chuyến đi của bạn</h2><button onClick={()=>setPage('trip')}>Xem chi tiết →</button></div><h3>{savedTrip.origin} → {savedTrip.destination}</h3><p>{dateRange(savedTrip)} · {savedTrip.days} ngày</p><p>{savedTrip.itinerary.reduce((total,day)=>total+day.places.length,0)} điểm tham quan · {savedTrip.checklist.filter(item=>item.done).length}/{savedTrip.checklist.length} mục chuẩn bị</p><button className="green full" onClick={()=>setPage('trip')}>Quay lại tổng quan hành trình →</button></section>}
<section className="box"><div className="title"><h2>Bản đồ gợi ý</h2><button onClick={()=>directions(trip.origin,trip.destination)}>Mở Google Maps ↗</button></div><iframe title="map" className="map" src={`https://www.google.com/maps?q=${encodeURIComponent(trip.destination)}&output=embed`}></iframe></section>
<section className="box"><div className="title"><h2>Nhật ký của bạn</h2><button onClick={()=>setPage('journal')}>Mở nhật ký →</button></div><p>Xem album, viết lại kỷ niệm và tổng kết những chuyến đi theo năm.</p><button className="soft" onClick={()=>setPage('journal')}>Xem các hành trình đã lưu</button></section></aside></main>}

function Tools({setPage}){return <main className="page"><h1>Công cụ hỗ trợ</h1><p>Những công cụ nhỏ, cho hành trình lớn hơn.</p><div className="toolgrid"><button onClick={()=>setPage('checklist')}><span><ToolIcon name="checklist"/></span><h3>Checklist</h3><p>Chuẩn bị giấy tờ, hành lý và tình trạng xe.</p></button>{tools.map(t=><button key={t[1]} onClick={()=>searchMaps(t[2])}><span><ToolIcon name={t[0]}/></span><h3>{t[1]}</h3><p>Tìm nhanh trên Google Maps khi cần.</p></button>)}<button onClick={()=>setPage('ai')}><span><ToolIcon name="assistant"/></span><h3>AI Assistant</h3><p>Gợi ý mẫu về lịch trình và chuẩn bị chuyến đi.</p></button></div></main>}

function AI({trip}){const [msgs,setMsgs]=useState([{r:'ai',t:'Xin chào! Tôi là RideMate AI. Tôi có thể hỗ trợ lịch trình, checklist, chuẩn bị xe và xử lý tình huống.'}]);const [txt,setTxt]=useState('');const send=t=>{t=t||txt;if(!t.trim())return;let q=t.toLowerCase(),a=`Với chuyến ${trip.origin} → ${trip.destination} trong ${trip.days} ngày, hãy giữ lịch trình vừa sức và kiểm tra xe trước khi đi.`;if(q.includes('thủng')||q.includes('sự cố'))a='Đưa xe vào vị trí an toàn, kiểm tra lốp và dùng công cụ “Sửa xe” để mở Google Maps tìm điểm hỗ trợ gần nhất.';if(q.includes('checklist'))a='Gợi ý: CCCD, bằng lái, đăng ký xe, áo mưa, sạc dự phòng, nước, bộ vá lốp; kiểm tra lốp, phanh, dầu nhớt và đèn.';if(q.includes('lịch trình')||q.includes('hà giang'))a=trip.itinerary?trip.itinerary.map((day,index)=>`Ngày ${index+1}: ${day.title}${day.places.length?' — '+day.places.map(place=>place.name).join(', '):''}`).join('\n'):'Hãy tạo chuyến đi trước để xem lịch trình và các điểm tham quan gợi ý.';setMsgs([...msgs,{r:'user',t},{r:'ai',t:a}]);setTxt('')};return <main className="page narrow"><section className="card chat"><div className="chathead"><h1>AI Assistant</h1><span>Trả lời mẫu · chưa kết nối AI</span></div><div className="prompts">{['Gợi ý lịch trình Hà Giang 4 ngày','Tạo checklist','Xe tôi bị thủng lốp'].map(p=><button key={p} onClick={()=>send(p)}>{p}</button>)}</div><div className="messages">{msgs.map((m,i)=><div className={`bubble ${m.r}`} key={i}>{m.t}</div>)}</div><div className="inputrow"><input value={txt} onChange={e=>setTxt(e.target.value)} onKeyDown={e=>e.key==='Enter'&&send()} placeholder="Nhập câu hỏi..."/><button onClick={()=>send()}>➤</button></div></section></main>}

function App(){
  const account = useAccount();
  const [accountBusy,setAccountBusy] = useState(false);
  const [loaded] = useState(() => { try { return readTrip(window.localStorage); } catch { return { trip: null, error: 'Trình duyệt không cho phép lưu dữ liệu. Thay đổi chỉ được giữ khi trang còn mở.' }; } });
  const [trip,setTrip] = useState(loaded.trip);
  const [storageError,setStorageError] = useState(loaded.error);
  const [page,setCurrentPage] = useState('home');
  const [completionTrip,setCompletionTrip] = useState(null);
  const [view,setView] = useState('overview');
  const [feedback,setFeedback] = useState('');
  useEffect(()=>{if(account.recovery)setCurrentPage('account');},[account.recovery]);
  useEffect(()=>{
    if(!accountBusy)return;
    const warn = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload',warn);
    return ()=>window.removeEventListener('beforeunload',warn);
  },[accountBusy]);
  useEffect(()=>{ if(!trip)return; try { setStorageError(saveTrip(window.localStorage,trip)); } catch { setStorageError('Trình duyệt không cho phép lưu thay đổi. Hãy giữ trang này mở.'); } },[trip]);
  const setPage=next=>{if(accountBusy)return;setCompletionTrip(null);setView('overview');setCurrentPage(next);setFeedback('');window.scrollTo({top:0,behavior:'instant'});};
  const create=details=>{
    if(!validDetails(details)){setFeedback('Vui lòng nhập điểm đi, điểm đến, ngày đi và số ngày từ 1 đến 30.');return;}
    if(trip && !window.confirm('Tạo chuyến đi mới sẽ thay thế chuyến đi đang lưu trên trình duyệt này. Bạn có muốn tiếp tục?'))return;
    setTrip(createTrip(details));setPage('trip');setFeedback('Đã tạo chuyến đi. Bạn có thể chỉnh lịch trình và ghi chú bên dưới.');
  };
  const edit=details=>{if(!validDetails(details)){setFeedback('Vui lòng kiểm tra thông tin chuyến đi.');return;}setTrip(current=>editTripDetails(current,details));setPage('trip');setFeedback('Đã lưu thông tin chuyến đi. Các ngày được giữ lại vẫn có lịch trình và ghi chú của bạn.');};
  const finishTrip=()=>{setPage('journal');setCompletionTrip(trip);};
  const journalChanged=(entry,deleted=false)=>{setTrip(current=>current && entry.sourceTripId===current.id ? {...current,completedAt:deleted?null:entry.date,journalId:deleted?null:entry.id}:current);};
  let content;
  if(page==='account')content=<Account account={account} localError={storageError} onBusy={setAccountBusy} onRestored={restored=>{setTrip(restored);setStorageError('');}}/>;
  else if(page==='home')content=<Home key={trip?.id || 'new'} trip={trip} onCreate={create} setPage={setPage}/>;
  else if(page==='create'||page==='edit')content=<TripForm key={page} trip={page==='edit'&&trip?trip:initialDetails} editing={page==='edit'&&!!trip} onSave={page==='edit'?edit:create} onCancel={()=>setPage(trip?'trip':'home')}/>;
  else if(page==='trip'&&trip)content=<Journey trip={trip} setTrip={setTrip} view={view} setView={setView} onEdit={()=>setPage('edit')} onFinish={finishTrip} setPage={setPage}/>;
  else if(page==='checklist'&&trip)content=<TripChecklist trip={trip} setTrip={setTrip}/>;
  else if(page==='trip'||page==='checklist')content=<main className="page narrow"><h1>Chưa có chuyến đi</h1><p>Tạo chuyến đi để lưu lịch trình, checklist và ghi chú của bạn.</p><button className="green" onClick={()=>setPage('create')}>Tạo chuyến đi</button></main>;
  else if(page==='tools')content=<Tools setPage={setPage}/>;
  else if(page==='ai')content=<AI trip={trip||initialDetails}/>;
  else content=<Journal completionTrip={completionTrip} onEntryChange={journalChanged}/>;
  return <><Nav page={page} setPage={setPage} user={account.session?.user}/>{trip && <div className="trip-return"><button onClick={()=>setPage('trip')}>← Tổng quan hành trình</button><span>{trip.origin} → {trip.destination}</span></div>}{storageError?<p className="storage-warning" role="alert">{storageError}</p>:trip?<p className="storage-hint">Chuyến đi được lưu trên trình duyệt này. Mở Tài khoản để lưu hoặc tải bản dữ liệu giữa các thiết bị.</p>:null}{feedback&&<p className="save-feedback app-feedback" role="status">{feedback}</p>}{content}<footer><b>▲ RideMate</b><span>Đi xa hơn, an toàn hơn, trải nghiệm nhiều hơn.</span><span>Giới thiệu · Hỗ trợ · Góp ý · Chính sách bảo mật</span></footer></>;
}
createRoot(document.getElementById('root')).render(<App/>);
