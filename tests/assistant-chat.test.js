import test from 'node:test';
import assert from 'node:assert/strict';
import {chatAction,draftExample} from '../src/assistant-chat.js';
test('one chat routes itinerary requests before attraction keywords',()=>{
 for(const hasTrip of [false,true])assert.equal(chatAction(draftExample,{hasTrip}),'newDraft');
 assert.equal(chatAction('Lập lịch 3 ngày Hà Nội đi Cao Bằng',{hasTrip:true}),'newDraft');
});
test('follow-up edits stay attached to the draft, sightseeing does not replace it',()=>{
 assert.equal(chatAction('Bỏ Bản Giốc, thêm ngày nghỉ',{hasDraft:true}),'editDraft');
 assert.equal(chatAction('Cao Bằng có gì chơi?',{hasDraft:true}),'explore');
 assert.equal(chatAction('Kiểm tra chuyến đi của tôi',{hasTrip:true,hasDraft:true}),'review');
 assert.equal(chatAction('Tạo lịch trình mới đi Mộc Châu',{hasDraft:true}),'newDraft');
});
