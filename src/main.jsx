import TripDateInput from './TripDateInput.jsx';
import { useNavigationState, useNavigationBlock } from './useNavigationState.js';
// Feature styles remain before responsive.css to preserve the existing cascade.
import './ai-assistant.css';
import './assistant-planner.css';
import './chat-history.css';
import './time-picker.css';
import './journal.css';
import './stays/stays.css';
import ScreenContent from './ScreenContent.jsx';
import Plans from './Plans.jsx';
import usePlanSync from './usePlanSync.js';
import {putPlan,removePlan} from './plans-data.js';
import OriginSelect from './OriginSelect.jsx';
import {tripOrigin} from './origin-data.js';
import {directionsUrl} from './route-data.js';
import {BookingProvider,useBookings} from './stays/BookingContext.jsx';
import {tripWithStays} from './stays/booking-data.js';
import React,{lazy,useState,useEffect,useMemo} from 'react';
import { TripForm, Journey, TripChecklist } from './Journey.jsx';
import { initialDetails, createTrip, editTripDetails, dateRange, readTrip, saveTrip, validDetails } from './trip-data.js';
import {createRoot} from 'react-dom/client';
import './styles.css';
import './journey.css';
import Account, { useAccount } from './Account.jsx';
import { accountName } from './account-name.js';
import ToolIcon from './ToolIcon.jsx';
import ProvinceSelect from './ProvinceSelect.jsx';
import ProvinceDirectory from './ProvinceDirectory.jsx';
import { LocationProvider, LocationStatus } from './Location.jsx';
import { TripRouteProvider } from './TripRouteContext.jsx';
import TripCompanion from './TripCompanion.jsx';
import DeferredDestinationMap from './DeferredDestinationMap.jsx';
import './mobile-journey.css';
import './responsive.css';
import './trip-date-input.css';
import BrandLogo from './BrandLogo.jsx';

const AIAssistant = lazy(() => import('./AIAssistant.jsx'));
const Journal = lazy(() => import('./Journal.jsx'));
const Stays = lazy(() => import('./stays/Stays.jsx'));

const tools=[['fuel','Cây xăng','gas station'],['repair','Sửa xe','motorcycle repair'],['food','Ăn uống','restaurant'],['bed','Chỗ nghỉ','hotel'],['medical','Y tế','hospital'],['pin','Điểm hot','tourist attraction']];
const searchMaps=q=>window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`,'_blank');
const directions=(a,b)=>window.open(directionsUrl(a,b),'_blank','noopener,noreferrer');

function Nav({page,setPage,user}){return <header className="nav"><button className="logo" aria-label="RideMate — về trang khám phá" onClick={()=>setPage('home')}><BrandLogo/></button><nav aria-label="Điều hướng chính">{[['home','Khám phá'],['plans','Kế hoạch'],['journal','Nhật ký'],['tools','Công cụ'],['ai','AI Assistant']].map(([k,v])=><button className={page===k?'active':''} aria-current={page===k?'page':undefined} onClick={()=>setPage(k)} key={k}><ToolIcon name={({home:'mountain',plans:'route',journal:'image',tools:'repair',ai:'assistant'})[k]} className="nav-item-icon"/><span>{v}</span></button>)}</nav><button className="account-link" title={user ? accountName(user) : undefined} aria-label={user ? `Tài khoản của ${accountName(user)}` : 'Tài khoản'} onClick={()=>setPage('account')}>{user ? accountName(user) : 'Tài khoản'}</button></header>}

function Home({trip: savedTrip,onCreate,setPage}){const [trip,setTrip]=useState(()=>({...initialDetails,...savedTrip}));return <main className="dash"><div className="maincol">
  <section className="hero"><div><small>RIDE MORE · EXPLORE FURTHER</small><h1>Những cung đường<br/>đẹp hơn khi đi cùng<br/>RideMate</h1><p>Lên kế hoạch dễ dàng · Hành trình an toàn hơn · Trải nghiệm nhiều hơn.</p></div>
    <form className="tripbar" onSubmit={e=>{e.preventDefault();onCreate(trip)}}><OriginSelect value={trip} onChange={setTrip} showLocationHint={false}/><label>Điểm đến<ProvinceSelect required showLocationHint={false} value={trip.destination} onChange={e=>setTrip({...trip,destination:e.target.value})}/></label><label>Ngày đi<TripDateInput value={trip.date} onChange={date=>setTrip({...trip,date})}/></label><label>Số ngày<input required type="number" min="1" max="30" step="1" value={trip.days} onChange={e=>setTrip({...trip,days:e.target.value})}/></label><button className="orange" type="submit">Tạo chuyến đi <ToolIcon name="arrowRight" className="inline-icon"/></button></form>
  </section>
  <section className="box"><div className="title"><h2>Công cụ hỗ trợ nhanh</h2><button onClick={()=>setPage('tools')}>Xem tất cả <ToolIcon name="arrowRight" className="inline-icon"/></button></div><div className="quick"><button onClick={()=>setPage('checklist')}><span><ToolIcon name="checklist"/></span>Checklist</button>{tools.map(t=><button key={t[1]} onClick={()=>t[0]==='bed'?setPage('stays'):searchMaps(t[2])}><span><ToolIcon name={t[0]}/></span>{t[1]}</button>)}<button onClick={()=>setPage('ai')}><span><ToolIcon name="assistant"/></span>AI Assistant</button></div></section>
</div><aside className="side">{savedTrip && <section className="box"><div className="title"><h2>Chuyến đi của bạn</h2><button onClick={()=>setPage('trip')}>Xem chi tiết <ToolIcon name="arrowRight" className="inline-icon"/></button></div><h3>{savedTrip.origin} <ToolIcon name="arrowRight" className="inline-icon"/> {savedTrip.destination}</h3><p>{dateRange(savedTrip)} · {savedTrip.days} ngày</p><p>{savedTrip.itinerary.reduce((total,day)=>total+day.places.length,0)} điểm tham quan · {savedTrip.checklist.filter(item=>item.done).length}/{savedTrip.checklist.length} mục chuẩn bị</p><button className="green full" onClick={()=>setPage('trip')}>Quay lại tổng quan hành trình <ToolIcon name="arrowRight" className="inline-icon"/></button></section>}
<section className="box"><div className="title"><h2>Bản đồ gợi ý</h2><button onClick={()=>directions(tripOrigin(trip),trip.destination)}>Mở Google Maps <ToolIcon name="external" className="inline-icon"/></button></div>{savedTrip?.completedAt ? <p>Chuyến đi đã hoàn thành. Bản đồ không tự tải.</p> : <DeferredDestinationMap name={trip.destination}/>}</section>
<section className="box"><div className="title"><h2>Nhật ký của bạn</h2><button onClick={()=>setPage('journal')}>Mở nhật ký <ToolIcon name="arrowRight" className="inline-icon"/></button></div><button className="soft" onClick={()=>setPage('journal')}>Xem các hành trình đã lưu</button></section></aside></main>}

function Tools({setPage}){return <main className="page"><h1>Công cụ hỗ trợ</h1><p>Những công cụ nhỏ, cho hành trình lớn hơn.</p><div className="toolgrid"><button onClick={()=>setPage('checklist')}><span><ToolIcon name="checklist"/></span><h3>Checklist</h3><p>Chuẩn bị giấy tờ, hành lý và tình trạng xe.</p></button>{tools.map(t=><button key={t[1]} onClick={()=>t[0]==='bed'?setPage('stays'):searchMaps(t[2])}><span><ToolIcon name={t[0]}/></span><h3>{t[1]}</h3><p>Tìm nhanh trên Google Maps khi cần.</p></button>)}<button onClick={()=>setPage('ai')}><span><ToolIcon name="assistant"/></span><h3>AI Assistant</h3><p>Kiểm tra lịch trình theo hồ sơ người lái và thời gian của bạn.</p></button></div><ProvinceDirectory/></main>}


function App(){const account=useAccount();return <BookingProvider userId={account.session?.user.id} authLoading={account.loading}><AppContent account={account}/></BookingProvider>}
function AppContent({account}){
  const bookingData=useBookings();
  const [stayDate,setStayDate]=useNavigationState('stayDate', null);
  const [reviewRequested,setReviewRequested]=useNavigationState('reviewRequested', false);
  const [accountBusy,setAccountBusy] = useState(false);
  useNavigationBlock(accountBusy);
  const sync=usePlanSync(account),plans=sync.plans;
  const [activeId,setActiveId]=useNavigationState('activeId', null);
  const trip=plans.find(p=>p.id===activeId)||null;
  const plansRef=React.useRef(plans);plansRef.current=plans;
  const changePlans=updater=>{try{sync.changePlans(updater);setStorageError('');return true;}catch(e){setStorageError(e.message);return false;}};
  const setTrip=updater=>{const id=activeId;return changePlans(current=>current.map(p=>p.id===id?(typeof updater==='function'?updater(p):updater):p));};
  const mapTrip=useMemo(()=>tripWithStays(trip,bookingData.bookings),[trip,bookingData.bookings]);
  const [storageError,setStorageError] = useState('');
  const previousOwner = React.useRef(sync.owner);
  useEffect(()=>{if(previousOwner.current!==sync.owner){setActiveId(null,{replace:true});previousOwner.current=sync.owner;}setStorageError('');},[sync.owner]);
  const [page,setCurrentPage] = useNavigationState('page', 'home');
  const [completionTrip,setCompletionTrip] = useNavigationState('completionTrip', null);
  const [view,setView] = useNavigationState('view', 'overview');
  const [feedback,setFeedback] = useState('');
  useEffect(()=>{if(account.recovery)setCurrentPage('account');},[account.recovery]);
  useEffect(()=>{
    if(!accountBusy)return;
    const warn = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload',warn);
    return ()=>window.removeEventListener('beforeunload',warn);
  },[accountBusy]);
  const setPage=(next,date=null)=>{if(accountBusy)return;setReviewRequested(next==='ai-review');if(next==='ai-review')next='ai';if(next==='plans')setActiveId(null);setStayDate(date);setCompletionTrip(null);setView('overview');setCurrentPage(next);setFeedback('');window.scrollTo({top:0,behavior:'instant'});};
  const create=details=>{
    if(!validDetails(details)){setFeedback('Vui lòng nhập điểm đi, điểm đến, ngày đi và số ngày từ 1 đến 30.');return;}
    if(!changePlans(current=>putPlan(current,createTrip(details))))return;setPage('plans');setFeedback('Đã tạo kế hoạch. Chọn Mở kế hoạch để xem lịch trình và bản đồ.');
  };
  const edit=details=>{if(!validDetails(details)){setFeedback('Vui lòng kiểm tra thông tin chuyến đi.');return;}if(!setTrip(current=>editTripDetails(current,details)))return;setPage('trip');setFeedback('Đã lưu thông tin chuyến đi. Các ngày được giữ lại vẫn có lịch trình và ghi chú của bạn.');};
  const createFromAssistant=plan=>{
    if(accountBusy)throw new Error('Đang đồng bộ tài khoản. Hãy thử lưu lại sau.');
    const next=putPlan(plansRef.current,plan);
    // Commit to storage before navigating: a failed write must leave the draft intact.
    sync.changePlans(next);setStorageError('');
  };
  const finishTrip=()=>{setPage('journal');setCompletionTrip(trip);};
  const journalChanged=(entry,deleted=false)=>{changePlans(current=>current.map(p=>entry.sourceTripId===p.id?{...p,completedAt:deleted?null:entry.date,journalId:deleted?null:entry.id}:p));};
  const deletePlan=id=>{
    if(accountBusy)return false;
    if(!changePlans(current=>removePlan(current,id)))return false;
    if(activeId===id)setActiveId(null);
    setFeedback('Đã xóa kế hoạch. Nhật ký và đơn chỗ nghỉ đã lưu vẫn được giữ.');
    return true;
  };
  let content;
  if(page==='account')content=<Account account={account} planSync={sync} localError={storageError} onBusy={setAccountBusy} onRestored={()=>{setActiveId(null);sync.retry();}}/>;
  else if(page==='plans')content=<Plans key={sync.owner} plans={plans} onDelete={deletePlan} onCreate={()=>setPage('create')} onOpen={id=>{setActiveId(id);setPage('trip');}}/>;
  else if(page==='home')content=<Home key={trip?.id || 'new'} trip={trip} onCreate={create} setPage={setPage}/>;
  else if(page==='create'||page==='edit')content=<TripForm key={page} trip={page==='edit'&&trip?trip:initialDetails} editing={page==='edit'&&!!trip} onSave={page==='edit'?edit:create} onCancel={()=>setPage(trip?'trip':'home')}/>;
  else if(page==='trip'&&trip)content=<Journey key={trip.id} trip={trip} setTrip={setTrip} view={view} setView={setView} onEdit={()=>setPage('edit')} onFinish={finishTrip} setPage={setPage} journal={account.loading ? <p role="status">Đang mở tài khoản…</p> : <Journal key={account.session?.user.id || 'guest'} userId={account.session?.user.id} onEntryChange={journalChanged} embedded/>}/>;
  else if(page==='checklist'&&trip)content=<TripChecklist trip={trip} setTrip={setTrip} onBack={()=>setPage('trip')}/>;
  else if(page==='trip'||page==='checklist')content=<main className="page narrow"><h1>Chưa có chuyến đi</h1><p>Tạo chuyến đi để lưu lịch trình, checklist và ghi chú của bạn.</p><button className="green" onClick={()=>setPage('create')}>Tạo chuyến đi</button></main>;
  else if(page==='stays')content=<Stays key={`${account.session?.user.id||'guest'}:${stayDate}`} trip={trip} initialDate={stayDate}/>;
  else if(page==='tools')content=<Tools setPage={setPage}/>;
  else if(page==='ai')content=<AIAssistant trip={trip} setTrip={setTrip} setPage={setPage} onCreatePlan={createFromAssistant} onOpenPlan={id=>{setActiveId(id);setPage('trip');}} initialReview={reviewRequested} userId={account.session?.user.id}/>;
  else content=account.loading ? <main className="page" role="status">Đang mở tài khoản…</main> : <Journal key={account.session?.user.id || "guest"} userId={account.session?.user.id} completionTrip={plans.find(plan=>plan.id===completionTrip?.id)||null} onEntryChange={journalChanged} onBack={trip?()=>setPage('trip'):null}/>;
  return <TripRouteProvider key={`${trip?.id}:${trip?.origin}:${trip?.destination}`} trip={mapTrip}><Nav page={page} setPage={setPage} user={account.session?.user}/><div className="app-content"><LocationStatus/>{page==='plans'&&<div className="plans-shortcut"><button className="soft" onClick={()=>setPage('plans')}>Kế hoạch của tôi ({plans.length})</button></div>}{trip && <div className="trip-return"><span>{trip.origin} <ToolIcon name="arrowRight" className="inline-icon"/> {trip.destination}</span><button onClick={()=>setPage('ai-review')}>Kiểm tra chuyến đi của tôi</button></div>}{sync.error&&<div className="storage-warning" role="alert"><p>{sync.error}</p><button onClick={()=>sync.retry()}>Thử đồng bộ lại</button>{sync.conflict&&<><button onClick={()=>{if(window.confirm("Chọn bản trên thiết bị cho những nội dung bị xung đột?"))sync.retry("local");}}>Giữ bản trên thiết bị</button><button onClick={()=>{if(window.confirm("Chọn bản tài khoản cho những nội dung bị xung đột?"))sync.retry("remote");}}>Giữ bản tài khoản</button></>}</div>}{storageError?<p className="storage-warning" role="alert">{storageError}</p>:trip&&(!account.session||sync.status!=="synced")?<p className="storage-hint">{account.session ? "Kế hoạch được giữ trên thiết bị; đang chờ đồng bộ tài khoản." : "Kế hoạch khách lưu trên trình duyệt này. Đăng nhập để tự đồng bộ; nhập kế hoạch khách tại Tài khoản."}</p>:null}{feedback&&<p className="save-feedback app-feedback" role="status">{feedback}</p>}{sync.loading&&page!=="account"?<main className="page" role="status">Đang mở kế hoạch theo tài khoản…</main>:<ScreenContent key={`${page}:${activeId || ""}`}>{content}</ScreenContent>}{trip && !trip.completedAt && !accountBusy && <TripCompanion key={`companion:${trip.id}`} trip={mapTrip} setTrip={setTrip}/>}</div><footer><BrandLogo/><span>Đi xa hơn, an toàn hơn, trải nghiệm nhiều hơn.</span><span>Giới thiệu · Hỗ trợ · Góp ý · Chính sách bảo mật</span></footer></TripRouteProvider>;
}
createRoot(document.getElementById('root')).render(<LocationProvider><App/></LocationProvider>);
