// Report #3: historical SMA/RSI suggestions, current Finnhub quotes, virtual trades and P&L.
const $ = id => document.getElementById(id);
const state = { token: sessionStorage.getItem('pf_token') || '', portfolio: '' };
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = x => x == null ? 'N/A' : '$' + Number(x).toFixed(2);
const errorText = err => err instanceof Error ? err.message : String(err);
const status = text => { $('status').textContent = text; };
const request = async (url, method = 'GET', data) => {
  const response = await fetch(url, {method, headers:{ ...(state.token ? {'Authorization':'Bearer ' + state.token} : {}), ...(data ? {'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID()} : {}) }, ...(data ? {body:JSON.stringify(data)} : {})});
  const json = await response.json();
  if (!response.ok) throw Error(json.error || 'Request failed');
  return json;
};
const run = fn => async event => {event?.preventDefault?.(); try {await fn(event); status('');} catch (error) {status(errorText(error));}};
const requirePortfolio = () => {if (!state.token || !state.portfolio) throw Error('Create an account and choose a portfolio first'); return state.portfolio;};
async function loadPortfolios() {
  if (!state.token) return;
  const data = await request('/portfolios');
  $('portfolios').innerHTML = data.map(p => `<option value="${esc(p.id)}">Portfolio ${esc(p.id.slice(0,8))} (${esc(p.horizon)} yr)</option>`).join('');
  state.portfolio = data.some(p=>p.id===state.portfolio) ? state.portfolio : (data[0]?.id || '');
  $('portfolios').value = state.portfolio;
  $('account-status').textContent = 'Account connected. Keep your token private; it is saved for this browser tab.';
  if (state.portfolio) {await showBalance(); await refresh();}
}
async function showBalance(){const p = await request('/portfolios/' + requirePortfolio()); $('balance').textContent = 'Available virtual cash: ' + money(p.cash);}
$('account-form').addEventListener('submit',run(async()=>{const u=await request('/users','POST',{name:$('name').value.trim()}); state.token=u.token; sessionStorage.setItem('pf_token',u.token); $('token').value=u.token; await loadPortfolios();}));
$('use-token').addEventListener('click',run(async()=>{state.token=$('token').value.trim(); if(!state.token) throw Error('Paste an account token first'); await request('/me'); sessionStorage.setItem('pf_token',state.token); await loadPortfolios();}));
$('portfolio-form').addEventListener('submit',run(async()=>{if(!state.token) throw Error('Create an account first'); const p=await request('/portfolios','POST',{horizon:Number($('horizon').value)}); state.portfolio=p.id; await loadPortfolios(); $('portfolios').value=p.id; state.portfolio=p.id; await showBalance();}));
$('portfolios').addEventListener('change',run(async()=>{state.portfolio=$('portfolios').value; await showBalance(); await refresh();}));
$('fund-form').addEventListener('submit',run(async()=>{await request('/portfolios/'+requirePortfolio()+'/funds','POST',{amount:Number($('fund').value).toFixed(2)}); await showBalance();}));
const table=(head,rows)=>`<div class="table-wrap"><table><thead><tr>${head.map(h=>'<th>'+esc(h)+'</th>').join('')}</tr></thead><tbody>${rows.map(row=>'<tr>'+row.map(cell=>'<td>'+esc(cell)+'</td>').join('')+'</tr>').join('')}</tbody></table></div>`;
$('recommend').addEventListener('click',run(async()=>{
  const symbols=[...document.querySelectorAll('#symbols input:checked')].map(x=>x.value);
  if(!symbols.length)throw Error('Select at least one stock');
  const result=await request('/portfolios/'+requirePortfolio()+'/recommendations','POST',{symbols,cutoff:'2026-10-02'});
  $('recommendations').innerHTML='<p><strong>Method:</strong> '+esc(result.method)+'</p>'+table(['Stock','Historic close','SMA fast','SMA slow','RSI','Suggestion'],result.details.map(d=>[d.symbol,money(d.lastHistoricalPrice),d.indicators.fast?.toFixed(2)??'N/A',d.indicators.slow?.toFixed(2)??'N/A',d.indicators.rsi?.toFixed(1)??'N/A',d.suggestion]));
}));
$('order-form').addEventListener('submit',run(async()=>{
  const id=requirePortfolio(), symbol=$('trade-symbol').value, side=$('side').value, quantity=Number($('quantity').value);
  if(!Number.isSafeInteger(quantity)||quantity<1)throw Error('Enter a positive whole number of shares');
  const order=await request('/portfolios/'+id+'/orders','POST',{symbol,side,quantity});
  try { const result=await request('/portfolios/'+id+'/orders/'+order.id+'/execute','POST',{});
    $('trade-message').textContent=`${side} ${quantity} ${symbol} virtually at ${money(result.price)} per share.`;
  } catch(error) { $('trade-message').textContent='Order saved as pending. Execution failed: '+errorText(error); throw error; }
  await showBalance(); await refresh();
}));
async function refresh(){
 const result=await request('/portfolios/'+requirePortfolio()+'/monitor');
 $('summary').textContent=result.summary || 'No positions yet.';
 const lines=result.lines || [];
 if(!lines.length){
   $('valuation-details').textContent='Cash: '+money(result.cash)+' · No open stock positions.';
 } else if(result.valuationComplete===false){
   $('valuation-details').textContent='PARTIAL valuation only · Cash: '+money(result.cash)+' · Known stock value: '+money(result.stockValue)+' · Known total (not full portfolio value): '+money(result.totalValue)+' · Unpriced cost basis: '+money(result.missingCostBasis)+' · Gain/loss applies only to priced holdings.';
 } else {
   $('valuation-details').textContent='Cash: '+money(result.cash)+' · Stock value: '+money(result.stockValue)+' · Total portfolio value: '+money(result.totalValue)+' · Unrealized gain/loss: '+money(result.gain)+' ('+result.gainPct+'%).';
 }
 $('monitor-time').textContent=result.checkedAt?'Last checked: '+new Date(result.checkedAt).toLocaleString()+' · Quotes show their original market timestamps.':'';
 $('positions').innerHTML=lines.length?table(['Stock','Shares','Avg. buy','Latest quote','Quote time','Gain / loss','Gain %','Status'],lines.map(x=>[x.symbol,x.quantity,money(x.avgCost),money(x.price),x.observedAt?new Date(x.observedAt).toLocaleString():'Unavailable',money(x.gain),x.gainPct==null?'N/A':x.gainPct+'%',x.status])):'<p>No shares held yet.</p>';
 if(Object.keys(result.errors||{}).length)status('Some stock prices are unavailable: '+Object.keys(result.errors).join(', '));
}
$('refresh').addEventListener('click',run(refresh));
async function init(){
 try {const config=await request('/app-config'); const symbols=config.symbols||[];
 $('symbols').innerHTML=symbols.map(s=>`<label><input type="checkbox" value="${esc(s)}" ${['AAPL','MSFT','NVDA'].includes(s)?'checked':''}>${esc(s)}</label>`).join('');
 $('trade-symbol').innerHTML=symbols.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join('');
 if(state.token){$('token').value=state.token; await loadPortfolios();}
 } catch(error){status(errorText(error));}
}
init();
setInterval(()=>{if(state.portfolio)refresh().catch(e=>status(errorText(e)));},60000);
