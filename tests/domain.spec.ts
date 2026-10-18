import {align,covariance,horizon,indicators,metrics,money,optimize,proposal,replay,rsi,sma} from '../src/domain.js';
import {AlphaVantage,jsonRequest,normalize,OfflineProvider} from '../src/providers.js';
describe('Financial domain: independently derived examples',()=>{
 it('SMA arithmetic and warmup',()=>{expect(sma([1,2,3,4],3)).toBe(3);expect(sma([1],2)).toBeNull();});
 it('RSI simple averages: 2 gains, 1 loss => 66.6667',()=>{expect(rsi([10,11,10,11],3)).toBeCloseTo(66.6666667,6);expect(rsi(Array(15).fill(10))).toBe(50);expect(rsi(Array.from({length:15},(_,i)=>i+1))).toBe(100);expect(rsi([1,2])).toBeNull();});
 it('does not substitute zeros for unavailable indicators',()=>{expect(indicators([10],1).fast).toBeNull();expect(indicators([10],1).signal).toBe('insufficient');});
 it('supports only the specified horizons',()=>{expect([1,2,5].map(x=>horizon(x).frequency)).toEqual(['monthly','quarterly','semiannual']);expect(()=>horizon(3)).toThrow();});
 it('drawdown and return from [100,120,90,108]',()=>{const m=metrics([100,120,90,108]);expect(m.totalReturn).toBeCloseTo(.08);expect(m.maxDrawdown).toBeCloseTo(-.25);expect(metrics([100,100,100]).sharpe).toBeNull();});
 it('money rounds half up without binary cent errors',()=>{expect(money('1.005').toFixed(2)).toBe('1.01');expect(money('0.1').plus('0.2').toFixed(2)).toBe('0.30');});
 it('two independent identical risks yield equal weights',()=>{const o=optimize([[.04,0],[0,.04]],.8);expect(o.weights[0]).toBeCloseTo(.5,6);expect(o.converged).toBeTrue();});
 it('inverse variance weights for diagonal [1,4] are [.8,.2]',()=>{const o=optimize([[1,0],[0,4]],.9);expect(o.weights[0]).toBeCloseTo(.8,5);});
 it('concentration, singular and infeasible matrices',()=>{expect(()=>optimize([[1,0],[0,1]],.2)).toThrow();const o=optimize(Array.from({length:5},()=>Array(5).fill(0)));expect(o.weights.every(w=>w<=.2+1e-9)).toBeTrue();expect(o.weights.reduce((a,b)=>a+b)).toBeCloseTo(1,8);});
 it('alignment uses shared dates and rejects missing history',()=>{expect(()=>align([[{date:'2020-01-01',close:1}],[]])).toThrow();});
 it('whole-share proposal retains residual cash',()=>{const p=proposal(['A','B'],[.5,.5],{A:'12.50',B:'30.00'},{},'100.00');expect(p.legs.map(l=>l.quantity)).toEqual([4,1]);expect(p.residualCash).toBe('20.00');});
 it('normalizes ordering and identical duplicates; rejects conflicting data',()=>{expect(normalize([{date:'2020-01-02',close:2},{date:'2020-01-01',close:1},{date:'2020-01-01',close:1}],'2020-01-01')).toEqual([{date:'2020-01-01',close:1}]);expect(()=>normalize([{date:'2020-01-01',close:1},{date:'2020-01-01',close:2}],'2020-01-02')).toThrow();});
 it('replay decisions precede executions and future shock cannot change prior decisions',()=>{const bars=Array.from({length:250},(_,i)=>({date:new Date(Date.UTC(2020,0,i+1)).toISOString().slice(0,10),close:100+i}));const a=replay(bars,1),changed=bars.map((b,i)=>({...b,close:i>=200?1000:b.close})),b=replay(changed,1);expect(a.audit.every(x=>x.signal<x.execution)).toBeTrue();expect(a.audit.filter(x=>x.execution<bars[200].date)).toEqual(b.audit.filter(x=>x.execution<bars[200].date));});
});
describe('Provider contracts (no network)',()=>{
 it('labels synthetic data and respects cutoff',async()=>{const p=new OfflineProvider(()=>new Date('2026-10-16T14:00:00Z'));const h=await p.history('AAPL','2020-01-01');expect(h.provider).toBe('synthetic-v1');expect(h.bars.at(-1)!.date<='2020-01-01').toBeTrue();await expectAsync(p.history('INVALID','2020-01-01')).toBeRejected();});
 it('bounds 429 retries',async()=>{let calls=0;const fake=(async()=>{calls++;return new Response('{}',{status:429});}) as typeof fetch;await expectAsync(jsonRequest('https://example.invalid',{},fake)).toBeRejected();expect(calls).toBe(3);});
 it('bounds timeout retries',async()=>{let calls=0;const fake=((_url:unknown,init:any)=>new Promise((_resolve,reject)=>{calls++;init.signal.addEventListener('abort',()=>reject(Error('timeout')));})) as typeof fetch;await expectAsync(jsonRequest('https://example.invalid',{},fake,10)).toBeRejected();expect(calls).toBe(3);});
 it('rejects quota bodies instead of falling back to fixtures',async()=>{const fake=(async()=>new Response(JSON.stringify({Information:'premium required'}))) as typeof fetch;await expectAsync(new AlphaVantage('test',fake).history('IBM','2020-01-01')).toBeRejected();});
});
