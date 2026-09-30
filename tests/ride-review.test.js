import test from 'node:test';
import assert from 'node:assert/strict';
import {assessDay,daySignature,cleanProfile,deferPlace,restorePlace} from '../src/ride-review.js';
const profile={bike:'scooter',party:'solo',experience:'new',hours:4,avoidDark:'yes'};
function fixture(){
 const trip={origin:'A',destination:'B',itinerary:[{id:'d1',places:[{id:'p1',name:'P',coordinates:[105,21]}],note:'Giữ ghi chú'},{id:'d2',places:[]}]};
 const day=trip.itinerary[0];
 day.rideReview={departure:'14:00',driving:5,visit:60,rest:30,finishBy:'18:00',drivingSignature:daySignature(trip,day),visitSignature:daySignature(trip,day)};
 return {trip,day};
}
test('counts riding, visits and breaks against rider limits',()=>{
 const {trip,day}=fixture(),r=assessDay(trip,day,profile,null);
 assert.equal(r.total,390);assert.equal(r.question,undefined);assert.equal(r.issues.length,2);
});
test('asks one missing question and does not substitute whole route for a day',()=>{
 const {trip,day}=fixture();delete day.rideReview.driving;
 const route={mode:'motorcycle',durationSeconds:10000,unresolved:[]};
 assert.equal(assessDay(trip,day,profile,route).driving,null);
 assert.equal(assessDay(trip,day,profile,route).question.key,'driving');
 assert.equal(assessDay(trip,day,{},route).question.key,'bike');
});
test('only complete single-day motorcycle route can supply an estimate',()=>{
 const {trip,day}=fixture();trip.itinerary=[day];day.rideReview={};
 const route={mode:'motorcycle',durationSeconds:7200,unresolved:[]};
 assert.equal(assessDay(trip,day,profile,route).driving,120);
 assert.equal(assessDay(trip,day,profile,{...route,unresolved:['P']}).driving,null);
 assert.equal(assessDay(trip,day,profile,{...route,mode:'driving'}).driving,null);
});
test('deferral preserves point, note, other days, and supports idempotent restoration',()=>{
 const {trip,day}=fixture(),point=day.places[0];
 const changed=deferPlace(trip,day.id,point.id);
 assert.equal(trip.itinerary[0].places.length,1);
 assert.equal(changed.itinerary[0].places.length,0);
 assert.deepEqual(changed.itinerary[0].deferredPlaces,[point]);
 assert.equal(changed.itinerary[0].note,day.note);
 assert.equal(changed.itinerary[1],trip.itinerary[1]);
 assert.equal(assessDay(changed,changed.itinerary[0],profile,null).driving,null);
 const restored=restorePlace(changed,day.id,point.id);
 assert.deepEqual(restored.itinerary[0].places,[point]);
 assert.deepEqual(restorePlace(restored,day.id,point.id),restored);
});
test('external itinerary edits invalidate old time inputs',()=>{
 const {trip,day}=fixture();day.places.push({id:'p2',name:'Extra'});
 assert.equal(assessDay(trip,day,profile,null).driving,null);
 assert.equal(assessDay(trip,day,profile,null).total,null);
});
test('profile validation and missing/invalid times never produce a reassuring result',()=>{
 assert.deepEqual(cleanProfile({hours:-1,bike:'car',avoidDark:false}),{});
 const {trip,day}=fixture();day.rideReview.departure='25:00';
 assert.equal(assessDay(trip,day,profile,null).question.key,'departure');
 day.rideReview.departure='07:00';day.rideReview.rest='';
 assert.equal(assessDay(trip,day,profile,null).total,null);
 assert.equal(assessDay(trip,day,profile,null).question.key,'rest');
});
