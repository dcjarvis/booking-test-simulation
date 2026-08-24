const { simulateModel2DemandAware, buildComparableDemand } = require('./model2-demand-aware');
const assert = require('assert');
const INTERVALS = 16;
function mulberry32(a){return function(){a|=0;a=(a+0x6d2b79f7)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
function shuffle(a,r){for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]];}}
function prefWeights(maxStart, peakBias){const b=peakBias/100,w=[];for(let i=0;i<=maxStart;i++){const peaks=Math.exp(-((i-3)**2)/6)+0.8*Math.exp(-((i-10)**2)/6);w.push((1-b)+b*2.2*peaks);}return w;}
function sample(weights,roll){const total=weights.reduce((a,c)=>a+c,0);let r=roll*total;for(let i=0;i<weights.length;i++){r-=weights[i];if(r<=0)return i;}return weights.length-1;}
function basic(p,demand){const occ=new Array(INTERVALS).fill(0),starts={2:[],4:[]},rej={2:0,4:0},accepted={2:0,4:0};for(let s=0;s<=14;s++)starts[2].push(s);for(let s=0;s<=12;s++)if(!p.hourAlign||s%2===0)starts[4].push(s);for(const c of demand){const cap=c.dur===2?p.seats-p.reserve:p.seats;const pref=sample(prefWeights(INTERVALS-c.dur,p.peakBias),c.prefRoll);const candidates=starts[c.dur].filter(s=>{for(let i=s;i<s+c.dur;i++)if(occ[i]+1>cap)return false;return c.flexible||Math.abs(s-pref)<=1;});if(!candidates.length){rej[c.dur]++;continue;}let pick;if(p.smart){let best=-Infinity;for(const s of candidates){let load=0;for(let i=s;i<s+c.dur;i++)load+=occ[i];const score=load*100-Math.abs(s-pref);if(score>best){best=score;pick=s;}}}else pick=candidates.reduce((a,s)=>Math.abs(s-pref)<Math.abs(a-pref)?s:a,candidates[0]);for(let i=pick;i<pick+c.dur;i++)occ[i]++;accepted[c.dur]++;}return {occ,accepted,rejected:rej,totalAccepted:accepted[2]+accepted[4]};}
const scenarios=[
 {name:'low demand',demand:80,twoHourShare:30,lastMinuteShare:40,seats:10},
 {name:'balanced',demand:120,twoHourShare:40,lastMinuteShare:40,seats:10},
 {name:'high demand',demand:180,twoHourShare:40,lastMinuteShare:40,seats:10},
 {name:'2h heavy',demand:120,twoHourShare:70,lastMinuteShare:40,seats:10},
 {name:'small centre',demand:80,twoHourShare:40,lastMinuteShare:40,seats:4},
 {name:'large centre',demand:180,twoHourShare:40,lastMinuteShare:40,seats:20}
];
const seeds=Array.from({length:100},(_,i)=>i+1);
for(const s of scenarios){let m1=0,m2=0,m1rej=0,m2rej=0;for(const seed of seeds){const p={...s,overbook:0,reserve:0,peakBias:50,hourAlign:true,smart:true};const demand=buildComparableDemand(p,seed).ordered;const a=basic(p,demand),b=simulateModel2DemandAware(p,seed,demand);m1+=a.totalAccepted;m2+=b.totalAccepted;m1rej+=a.rejected[2]+a.rejected[4];m2rej+=b.rejected[2]+b.rejected[4];assert(Math.max(...b.occ)<=p.seats,`${s.name}: Model2 capacity violation seed ${seed}`);}
console.log(JSON.stringify({scenario:s.name,seeds:seeds.length,model1AcceptedAvg:m1/seeds.length,model2AcceptedAvg:m2/seeds.length,deltaAcceptedAvg:(m2-m1)/seeds.length,model1RejectedAvg:m1rej/seeds.length,model2RejectedAvg:m2rej/seeds.length,model2WinRate:seeds.filter(seed=>{const p={...s,overbook:0,reserve:0,peakBias:50,hourAlign:true,smart:true};const d=buildComparableDemand(p,seed).ordered;return simulateModel2DemandAware(p,seed,d).totalAccepted>basic(p,d).totalAccepted;}).length/seeds.length},null,2));}
