(() => {
  const $ = (q, root=document) => root.querySelector(q);
  const $$ = (q, root=document) => [...root.querySelectorAll(q)];
  const state = {
    snapshot: null,
    agents: null,
    broker: null,
    selectedSymbol: null,
    logs: [],
    cycleTimer: null,
  };

  const riskWeight = (r) => {
    const s=(r||'').toLowerCase();
    if(s.includes('bajo')) return 18;
    if(s.includes('moder')) return 48;
    if(s.includes('alto')) return 82;
    return 55;
  };
  const scoreOpportunity = (m) => {
    const decision = {Estudiar:82, Observar:62, Esperar:34, Descartar:15}[m.decision] ?? 50;
    const penalty = {Bajo:0, Moderado:8, Alto:24}[m.risk] ?? 12;
    const freshness = freshnessScore(m.date);
    return Math.max(0, Math.min(100, Math.round(decision - penalty + freshness)));
  };
  const freshnessScore = (d) => {
    if(!d) return -10;
    const date = new Date(d.length===10 ? d+'T00:00:00Z' : d);
    if(Number.isNaN(date.getTime())) return -8;
    const days=(Date.now()-date.getTime())/86400000;
    if(days<=1.5) return 8;
    if(days<=4) return 3;
    if(days<=10) return -3;
    return -10;
  };
  const fmtARS = (v) => v==null ? '—' : new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(v);
  const fmtUSD = (v) => v==null ? '—' : new Intl.NumberFormat('es-AR',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(v);
  const fmtPct = (v, digits=2) => v==null ? '—' : Number(v).toFixed(digits)+'%';
  const fmtDate = (v) => {
    if(!v) return '—';
    const d=new Date(v.length===10?v+'T00:00:00Z':v);
    return Number.isNaN(d.getTime()) ? v : new Intl.DateTimeFormat('es-AR',{dateStyle:'medium',timeStyle:v.length>10?'short':undefined,timeZone:'America/Argentina/Cordoba'}).format(d);
  };
  const riskClass = (r) => {
    const s=(r||'').toLowerCase();
    if(s.includes('bajo')) return 'good';
    if(s.includes('moder')) return 'warn';
    return 'bad';
  };
  const statusClass = (s) => {
    const x=(s||'').toUpperCase();
    if(x==='LISTO'||x==='OK'||x==='ACTIVO') return 'good';
    if(x==='BLOQUEADO'||x==='ERROR') return 'bad';
    return 'warn';
  };
  const addLog = (text) => {
    const now = new Date().toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'});
    state.logs.unshift({time:now,text});
    state.logs=state.logs.slice(0,8);
    renderLogs();
  };
  const renderLogs = () => {
    const el=$('#activityLog');
    if(!el) return;
    el.innerHTML = state.logs.length ? state.logs.map(x =>
      '<div class="log-row"><div class="log-time">'+x.time+'</div><div class="log-text">'+escapeHtml(x.text)+'</div></div>'
    ).join('') : '<div class="empty">Sin eventos registrados en esta sesión.</div>';
  };
  const escapeHtml = (s) => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

  function renderKpis(){
    const s=state.snapshot, b=state.broker;
    if(!s) return;
    $('#kpiCapital').textContent=fmtARS(s.capital_ars);
    $('#kpiUsd').textContent=fmtUSD(s.usd_reference);
    $('#kpiCash').textContent=fmtUSD(b?.cash);
    $('#kpiEquity').textContent=fmtUSD(b?.equity);
    $('#kpiDayPnl').textContent=fmtUSD(b?.day_pnl);
    $('#kpiTotalPnl').textContent=fmtUSD(b?.total_pnl);
    $('#kpiDayPnl').className='kpi-value '+(b?.day_pnl>0?'good':b?.day_pnl<0?'bad':'');
    $('#kpiTotalPnl').className='kpi-value '+(b?.total_pnl>0?'good':b?.total_pnl<0?'bad':'');
    $('#snapshotAge').textContent='Mercado: '+fmtDate(s.last_updated);
    $('#brokerSync').textContent=b?.last_sync ? 'Broker: '+fmtDate(b.last_sync) : 'Broker sin conectar';
    const tb=(s.market||[]).find(x=>x.symbol==='DGS3MO');
    $('#tbillRef').textContent=tb?fmtPct(tb.value):'—';
  }

  function renderMarket(){
    const grid=$('#marketGrid');
    const table=$('#marketTableBody');
    if(!state.snapshot) return;
    const market=state.snapshot.market||[];
    grid.innerHTML=market.map(m=>{
      const score=scoreOpportunity(m);
      const price=m.kind==='yield'?fmtPct(m.value):fmtUSD(m.value);
      const risk=riskWeight(m.risk);
      return '<article class="market-card '+(state.selectedSymbol===m.symbol?'selected':'')+'" data-symbol="'+escapeHtml(m.symbol)+'">'+
        '<div class="symbol">'+escapeHtml(m.symbol)+'</div>'+
        '<div class="market-name">'+escapeHtml(m.name)+'</div>'+
        '<div class="market-price">'+price+'</div>'+
        '<div class="meta-row"><span class="muted">Riesgo</span><strong class="'+riskClass(m.risk)+'">'+escapeHtml(m.risk)+'</strong></div>'+
        '<div class="meta-row"><span class="muted">Prioridad</span><strong class="score">'+score+'/100</strong></div>'+
        '<div class="meta-row"><span class="muted">Dato</span><span>'+escapeHtml(fmtDate(m.date))+'</span></div>'+
        '<div class="riskbar"><span style="width:'+risk+'%"></span></div>'+
      '</article>';
    }).join('');

    table.innerHTML=market.map(m=>{
      const score=scoreOpportunity(m);
      const value=m.kind==='yield'?fmtPct(m.value):fmtUSD(m.value);
      return '<tr class="selectable" data-symbol="'+escapeHtml(m.symbol)+'">'+
        '<td><strong>'+escapeHtml(m.symbol)+'</strong><div class="muted">'+escapeHtml(m.name)+'</div></td>'+
        '<td>'+value+'</td>'+
        '<td>'+escapeHtml(m.signal||'—')+'</td>'+
        '<td class="'+riskClass(m.risk)+'">'+escapeHtml(m.risk||'—')+'</td>'+
        '<td>'+escapeHtml(m.decision||'—')+'</td>'+
        '<td><strong>'+score+'</strong><span class="muted"> /100</span></td>'+
        '<td>'+escapeHtml(fmtDate(m.date))+'</td>'+
      '</tr>';
    }).join('');

    $$('.market-card').forEach(el=>el.addEventListener('click',()=>selectSymbol(el.dataset.symbol)));
    $$('#marketTableBody tr').forEach(el=>el.addEventListener('click',()=>selectSymbol(el.dataset.symbol)));
  }

  function renderOpportunities(){
    const el=$('#opportunitiesGrid');
    if(!state.snapshot) return;
    const items=[...(state.snapshot.market||[])].sort((a,b)=>scoreOpportunity(b)-scoreOpportunity(a));
    el.innerHTML=items.slice(0,6).map(m=>{
      const score=scoreOpportunity(m);
      return '<article class="opportunity-card '+(state.selectedSymbol===m.symbol?'selected':'')+'" data-symbol="'+escapeHtml(m.symbol)+'">'+
        '<div class="symbol">'+escapeHtml(m.symbol)+'</div>'+
        '<div style="display:flex;align-items:end;justify-content:space-between;gap:8px;margin-top:5px">'+
          '<div><div class="market-name">'+escapeHtml(m.name)+'</div><div class="'+riskClass(m.risk)+'">'+escapeHtml(m.risk)+'</div></div>'+
          '<div class="big-score">'+score+'</div>'+
        '</div>'+
        '<div class="meta-row"><span class="muted">Señal</span><span>'+escapeHtml(m.signal)+'</span></div>'+
        '<div class="meta-row"><span class="muted">Estado</span><strong>'+escapeHtml(m.decision)+'</strong></div>'+
        '<div class="meta-row"><span class="muted">Puntaje</span><span class="muted">prioridad interna, no probabilidad</span></div>'+
      '</article>';
    }).join('');
    $$('.opportunity-card').forEach(x=>x.addEventListener('click',()=>selectSymbol(x.dataset.symbol)));
  }

  function renderAgents(){
    const s=state.snapshot, a=state.agents;
    const agents=s?.agents||[];
    const outputs=a?.status==='OK' ? (a.outputs||{}) : {};
    const el=$('#agentsGrid');
    el.innerHTML=agents.map(agent=>{
      const ai=outputs[agent.name];
      const status=ai?'IA':agent.status;
      const msg=ai||agent.message;
      return '<article class="agent-card" data-agent="'+escapeHtml(agent.name)+'">'+
        '<div class="agent-top"><div class="agent-name">'+escapeHtml(agent.name)+'</div>'+
        '<span class="agent-status '+statusClass(status)+'">'+escapeHtml(status)+'</span></div>'+
        '<div class="agent-msg">'+escapeHtml(msg)+'</div>'+
      '</article>';
    }).join('');
    $('#agentLayerState').textContent=a?.status==='OK'?'ACTIVO':'PREPARADO';
    $('#agentLayerState').className=a?.status==='OK'?'good':'warn';
  }

  function renderBroker(){
    const b=state.broker||{};
    const connected=b.status==='CONNECTED';
    $('#brokerBadge').innerHTML='<span class="dot '+(connected?'':'red')+'"></span>'+(connected?'Broker conectado':'Broker desconectado');
    $('#brokerProvider').textContent=b.provider||'No conectado';
    $('#brokerAccount').textContent=b.account_masked||'—';
    $('#brokerStateText').textContent=b.status||'DISCONNECTED';
    $('#brokerStateText').className=connected?'good':'bad';

    const pos=$('#positionsBody');
    if(connected && b.positions?.length){
      pos.innerHTML=b.positions.map(p=>'<tr>'+
        '<td><strong>'+escapeHtml(p.symbol)+'</strong></td><td>'+escapeHtml(p.qty)+'</td>'+
        '<td>'+fmtUSD(p.avg_price)+'</td><td>'+fmtUSD(p.market_price)+'</td>'+
        '<td class="'+(p.unrealized_pnl>=0?'good':'bad')+'">'+fmtUSD(p.unrealized_pnl)+'</td>'+
        '<td>'+fmtPct(p.weight_pct)+'</td></tr>').join('');
    }else{
      pos.innerHTML='<tr><td colspan="6"><div class="empty">Conectá un broker en modo lectura para ver posiciones reales.</div></td></tr>';
    }

    const ord=$('#ordersBody');
    if(connected && b.orders?.length){
      ord.innerHTML=b.orders.map(o=>'<tr><td>'+escapeHtml(o.symbol)+'</td><td>'+escapeHtml(o.side)+'</td><td>'+escapeHtml(o.type)+'</td><td>'+escapeHtml(o.qty)+'</td><td>'+fmtUSD(o.limit_price)+'</td><td>'+escapeHtml(o.status)+'</td></tr>').join('');
    }else{
      ord.innerHTML='<tr><td colspan="6"><div class="empty">No hay órdenes del broker disponibles.</div></td></tr>';
    }
  }

  function selectSymbol(symbol){
    state.selectedSymbol=symbol;
    renderMarket();
    renderOpportunities();
    renderSelectedOpportunity();
    populateTicket(symbol);
    addLog('Activo seleccionado: '+symbol+'.');
  }

  function renderSelectedOpportunity(){
    const m=(state.snapshot?.market||[]).find(x=>x.symbol===state.selectedSymbol);
    const box=$('#selectedOpportunity');
    if(!m){box.innerHTML='<div class="empty">Seleccioná un activo para ver el análisis.</div>';return;}
    const score=scoreOpportunity(m);
    const vol=m.volatility==null?'No disponible':fmtPct(m.volatility)+' · '+(m.volatility_window||'');
    box.innerHTML=
      '<div class="panel-head"><div><div class="panel-title">'+escapeHtml(m.symbol)+' · '+escapeHtml(m.name)+'</div>'+
      '<div class="panel-sub">'+escapeHtml(m.signal||'')+' · dato '+escapeHtml(fmtDate(m.date))+'</div></div>'+
      '<div class="big-score">'+score+'</div></div>'+
      '<div class="meta-row"><span class="muted">Riesgo</span><strong class="'+riskClass(m.risk)+'">'+escapeHtml(m.risk)+'</strong></div>'+
      '<div class="meta-row"><span class="muted">Decisión</span><strong>'+escapeHtml(m.decision)+'</strong></div>'+
      '<div class="meta-row"><span class="muted">Volatilidad</span><span>'+escapeHtml(vol)+'</span></div>'+
      '<div class="meta-row"><span class="muted">Fuente</span><a href="'+escapeHtml(m.source_url||'#')+'" target="_blank" rel="noopener noreferrer">'+escapeHtml(m.source||'Fuente')+'</a></div>'+
      '<div class="alert" style="margin-top:10px">El puntaje es una regla interna de priorización. No representa probabilidad de ganancia.</div>';
  }

  function populateTicket(symbol){
    const m=(state.snapshot?.market||[]).find(x=>x.symbol===symbol);
    if(!m) return;
    $('#orderSymbol').value=m.symbol;
    $('#orderPrice').value=m.kind==='price'?Number(m.value).toFixed(2):'';
    $('#orderQty').value='1';
    updateTicketSummary();
  }

  function updateTicketSummary(){
    const symbol=$('#orderSymbol').value.trim().toUpperCase();
    const qty=Math.max(0,Number($('#orderQty').value)||0);
    const price=Math.max(0,Number($('#orderPrice').value)||0);
    const type=$('#orderType').value;
    const side=$('#orderSide').value;
    const notional=qty*price;
    $('#ticketSummary').innerHTML=
      '<div class="meta-row"><span class="muted">Activo</span><strong>'+escapeHtml(symbol||'—')+'</strong></div>'+
      '<div class="meta-row"><span class="muted">Lado / tipo</span><span>'+escapeHtml(side)+' · '+escapeHtml(type)+'</span></div>'+
      '<div class="meta-row"><span class="muted">Cantidad</span><span>'+qty+'</span></div>'+
      '<div class="meta-row"><span class="muted">Nominal estimado</span><strong>'+fmtUSD(notional)+'</strong></div>';
  }

  function prepareDraft(){
    const symbol=$('#orderSymbol').value.trim().toUpperCase();
    const qty=Math.max(0,Number($('#orderQty').value)||0);
    const price=Math.max(0,Number($('#orderPrice').value)||0);
    if(!symbol||qty<=0){addLog('Orden no preparada: revisá símbolo y cantidad.');return;}
    $('#draftState').textContent='BORRADOR LISTO';
    $('#draftState').className='good';
    addLog('Borrador preparado: '+$('#orderSide').value+' '+qty+' '+symbol+(price?' @ '+fmtUSD(price):'')+'.');
    const connected=state.broker?.status==='CONNECTED';
    $('#sendOrderBtn').disabled=!connected;
    $('#sendOrderHint').textContent=connected
      ? 'El broker está conectado. La orden deberá requerir tu aprobación explícita antes de enviarse.'
      : 'Envío deshabilitado: falta broker autenticado.';
  }

  function renderDecisionChain(){
    const el=$('#decisionChain');
    const m=(state.snapshot?.market||[]).find(x=>x.symbol===state.selectedSymbol);
    const sym=m?.symbol||'activo';
    const steps=[
      ['Datos de mercado','Carga precio/tasa, fecha, volatilidad y fuente.'],
      ['Especialista','Evalúa '+sym+' dentro de su sector y horizonte.'],
      ['Costos Argentina','Revisa spread, conversión, comisiones y acceso.'],
      ['Verificador','Contrasta cifras y marca datos no verificados.'],
      ['Riesgo','Compara contra T-Bill 3M y límites de exposición.'],
      ['Administrador Central','Emite ESTUDIAR / OBSERVAR / ESPERAR / DESCARTAR.'],
      ['Ejecución','Prepara orden; el envío requiere aprobación humana.']
    ];
    el.innerHTML=steps.map((x,i)=>'<div class="chain-step"><div class="chain-num">'+(i+1)+'</div><div><div class="chain-title">'+escapeHtml(x[0])+'</div><div class="chain-text">'+escapeHtml(x[1])+'</div></div></div>').join('');
  }

  function drawRiskChart(){
    const svg=$('#riskChart');
    const market=state.snapshot?.market||[];
    if(!market.length){svg.innerHTML='';return;}
    const items=market.filter(x=>x.symbol!=='DGS3MO');
    const w=600,h=180,p=26,max=50;
    const gap=(w-2*p)/items.length;
    const bars=items.map((m,i)=>{
      const v=Math.min(max,Math.max(0,Number(m.volatility)||0));
      const bh=(h-2*p)*(v/max);
      const x=p+i*gap+gap*.16, y=h-p-bh, bw=gap*.68;
      return '<rect x="'+x+'" y="'+y+'" width="'+bw+'" height="'+bh+'" rx="5" fill="var(--blue)" opacity=".75"></rect>'+
        '<text x="'+(x+bw/2)+'" y="'+(h-8)+'" text-anchor="middle" fill="var(--muted)" font-size="11">'+escapeHtml(m.symbol)+'</text>'+
        '<text x="'+(x+bw/2)+'" y="'+(Math.max(14,y-6))+'" text-anchor="middle" fill="var(--text)" font-size="11">'+v.toFixed(1)+'%</text>';
    }).join('');
    svg.setAttribute('viewBox','0 0 '+w+' '+h);
    svg.innerHTML='<line x1="'+p+'" y1="'+(h-p)+'" x2="'+(w-p)+'" y2="'+(h-p)+'" stroke="var(--line)"></line>'+bars;
  }

  async function loadJson(path){
    const r=await fetch(path+'?ts='+Date.now(),{cache:'no-store'});
    if(!r.ok) throw new Error(path+' HTTP '+r.status);
    return r.json();
  }

  async function loadAll(){
    $('#refreshBtn').disabled=true;
    $('#refreshBtn').textContent='Actualizando…';
    try{
      const [snapshot,agents,broker]=await Promise.all([
        loadJson('market_snapshot.json'),
        loadJson('agent_analysis.json').catch(()=>({status:'UNAVAILABLE'})),
        loadJson('broker_state.json').catch(()=>({status:'DISCONNECTED',positions:[],orders:[]}))
      ]);
      state.snapshot=snapshot;state.agents=agents;state.broker=broker;
      if(!state.selectedSymbol) state.selectedSymbol=(snapshot.market||[])[0]?.symbol||null;
      renderKpis();renderMarket();renderOpportunities();renderAgents();renderBroker();
      renderSelectedOpportunity();renderDecisionChain();drawRiskChart();
      const centralText=(agents?.status==='OK' && agents?.central) ? agents.central : (snapshot.central_message||'Sin dictamen disponible.');
      $('#centralDecision').textContent=centralText;
      $('#terminalState').textContent='TERMINAL ACTIVA';
      $('#terminalState').className='good';
      addLog('Terminal actualizada. Datos privados del broker: '+(broker.status==='CONNECTED'?'conectados':'no conectados')+'.');
    }catch(err){
      $('#terminalState').textContent='ERROR DE DATOS';
      $('#terminalState').className='bad';
      addLog('Error al cargar terminal: '+err.message);
    }finally{
      $('#refreshBtn').disabled=false;
      $('#refreshBtn').textContent='Actualizar terminal';
    }
  }

  function startAgentCycle(){
    if(state.cycleTimer){
      clearInterval(state.cycleTimer);state.cycleTimer=null;
      $$('.agent-card').forEach(x=>x.classList.remove('working'));
      $('#cycleBtn').textContent='Ver ciclo de agentes';
      addLog('Visualización de ciclo detenida.');
      return;
    }
    const cards=$$('.agent-card');
    if(!cards.length) return;
    let i=0;
    $('#cycleBtn').textContent='Detener ciclo';
    const tick=()=>{
      cards.forEach(x=>x.classList.remove('working'));
      const card=cards[i%cards.length];
      card.classList.add('working');
      addLog('Flujo visual: '+$('.agent-name',card).textContent+' procesa su etapa.');
      i++;
    };
    tick();state.cycleTimer=setInterval(tick,1400);
  }

  function activateTabs(){
    $$('.tab').forEach(btn=>btn.addEventListener('click',()=>{
      $$('.tab').forEach(x=>x.classList.remove('active'));
      $$('.view').forEach(x=>x.classList.remove('active'));
      btn.classList.add('active');
      $('#view-'+btn.dataset.view)?.classList.add('active');
    }));
  }

  function wireTicket(){
    ['#orderSymbol','#orderQty','#orderPrice','#orderType','#orderSide'].forEach(q=>$(q).addEventListener('input',updateTicketSummary));
    $('#prepareDraftBtn').addEventListener('click',prepareDraft);
    $('#sendOrderBtn').addEventListener('click',()=>{
      addLog('Envío bloqueado en esta versión hasta conectar un broker autenticado y un backend privado.');
    });
  }

  activateTabs();
  wireTicket();
  $('#refreshBtn').addEventListener('click',loadAll);
  $('#cycleBtn').addEventListener('click',startAgentCycle);
  $('#cycleBtnMirror').addEventListener('click',startAgentCycle);
  $('#scanBtn').addEventListener('click',()=>{renderOpportunities();addLog('Oportunidades reordenadas usando reglas de prioridad y riesgo del snapshot actual.');});
  loadAll();
  setInterval(loadAll,300000);
  window.addEventListener('pagehide',()=>{if(state.cycleTimer) clearInterval(state.cycleTimer);});
})();
