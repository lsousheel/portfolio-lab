import json
from pathlib import Path
string={'type':'string'}
number={'type':'number'}
integer={'type':'integer'}
def obj(props,required=None):return {'type':'object','properties':props,'required':required or list(props)}
leg=obj({'symbol':{'type':'string','pattern':'^[A-Z][A-Z0-9.-]{0,9}$'},'side':{'type':'string','enum':['BUY','SELL']},'quantity':{'type':'integer','minimum':1,'maximum':1000000}})
paths={}
def route(path,method,summary,body=None,idem=False,public=False,success='200',response=None):
 params=[{'name':p[1:-1],'in':'path','required':True,'schema':string} for p in path.split('/') if p.startswith('{')]
 if idem:params.append({'name':'Idempotency-Key','in':'header','required':True,'schema':{'type':'string','minLength':1,'maxLength':100},'description':'Stable per portfolio; reuse only with identical action and body.'})
 op={'summary':summary,'operationId':method+'_'+path.replace('/','_').replace('{','').replace('}',''),'parameters':params,'responses':{success:{'description':'Success','content':{'application/json':{'schema':response or {'type':'object','additionalProperties':True}}}},'401':{'description':'Missing or invalid token'},'404':{'description':'Absent or not owned'},'409':{'description':'State or idempotency conflict'},'422':{'description':'Invalid input, insufficient resources or stale quote'},'500':{'description':'Internal error; transaction rolled back'},'503':{'description':'Provider quota or availability error'}}}
 if body:op['requestBody']={'required':True,'content':{'application/json':{'schema':body}}}
 if public:op['security']=[]
 paths.setdefault(path,{})[method]=op
route('/health','get','Simulator health',public=True)
route('/users','post','Create local demo identity; token returned once',obj({'name':{'type':'string','minLength':1,'maxLength':80}}),public=True,success='201',response=obj({'id':string,'name':string,'token':string}))
route('/me','get','Inspect authenticated user')
route('/portfolios','get','List own portfolios',response={'type':'array','items':{'type':'object'}})
route('/portfolios','post','Create empty simulated portfolio',obj({'horizon':{'type':'integer','enum':[1,2,5]}}),success='201')
route('/portfolios/{id}','get','Inspect own portfolio, cash and whole-share holdings')
route('/portfolios/{id}/funds','post','Add simulated USD cash',obj({'amount':{'type':'string','pattern':'^\\d{1,9}(\\.\\d{1,2})?$','example':'10000.00'}}),idem=True)
route('/portfolios/{id}/activity','get','List own orders and executions')
route('/portfolios/{id}/orders','post','Queue whole-share market simulator order',leg,idem=True,success='201')
route('/portfolios/{id}/orders/{order}/cancel','post','Cancel only a pending order')
route('/portfolios/{id}/orders/{order}/execute','post','Execute one pending order atomically',idem=True)
route('/portfolios/{id}/rebalance','post','Execute coordinated legs atomically, sells first',obj({'legs':{'type':'array','items':leg,'minItems':1,'maxItems':40}}),idem=True)
route('/portfolios/{id}/recommendations','post','Record indicators and constrained allocation without trading',obj({'symbols':{'type':'array','items':string,'minItems':5,'maxItems':20,'uniqueItems':True},'cutoff':{'type':'string','format':'date'},'horizon':{'type':'integer','enum':[1,2,5]},'riskYears':{'type':'integer','enum':[1,2,5,10,20]}},['symbols','cutoff']),success='201')
route('/portfolios/{id}/recommendations/{rid}','get','Retrieve stored recommendation')
route('/portfolios/{id}/recommendations/{rid}/proposal','post','Convert target weights to fresh-quote whole-share legs')
route('/portfolios/{id}/recommendations/{rid}/explain','post','Retrieve separate AI commentary and optional news')
route('/portfolios/{id}/recommendations/{rid}/evaluate','post','Evaluate on at least 61 common observations after cutoff',obj({'end':{'type':'string','format':'date'}}))
route('/market/{symbol}/history','get','Fetch and persist up to 20 years of adjusted history')
paths['/market/{symbol}/history']['get']['parameters'].append({'name':'cutoff','in':'query','schema':{'type':'string','format':'date'},'description':'Defaults to current UTC day'})
route('/market/{symbol}/quote','get','Read quote including observation time; may be delayed')
route('/market/{symbol}/replay','post','Chronological SMA strategy with 10 bps one-way total costs',obj({'cutoff':{'type':'string','format':'date'},'horizon':{'type':'integer','enum':[1,2,5]}}))
route('/admin/baskets','post','Admin: collect all pending orders through fixed cutoff; full fills',obj({'key':string,'cutoff':{'type':'string','format':'date-time'}}))
paths['/admin/baskets']['post']['security']=[{'AdminBearer':[]}]
spec={'openapi':'3.1.0','info':{'title':'Programming Finance Simulator','version':'1.0.0','description':'Local academic simulation. Monetary values are decimal strings. No real brokerage or live execution. Synthetic default provider. Order failures leave pending orders unchanged; batches record business rejections.'},'servers':[{'url':'http://localhost:3000'}],'security':[{'LocalBearer':[]}],'components':{'securitySchemes':{'LocalBearer':{'type':'http','scheme':'bearer','description':'Token from POST /users; local demo only'},'AdminBearer':{'type':'http','scheme':'bearer','description':'ADMIN_TOKEN environment value'}}},'paths':paths}
Path('docs/openapi.json').write_text(json.dumps(spec,indent=2))
print(len(paths),'OpenAPI paths')
