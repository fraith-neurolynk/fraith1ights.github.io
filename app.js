(() => {
  const $ = (q, root=document) => root.querySelector(q);
  const $$ = (q, root=document) => [...root.querySelectorAll(q)];
  const state = {dashboard:null, agents:null, logs:[], backendConnected:false, cycleRunning:false};

  const fallback = {
    product:"Capital Command",version:"2.0.0",trading_mode:"preview",execution_enabled:false,
    market:[
      {symbol:"DGS3MO",name:"T-Bill EE.UU. 3 meses",kind:"yield",value:null,unit:"%",date:null,change_pct:null,volatility:null,source:"Backend requerido"},
      {symbol:"SPY",name:"S&P 500",kind:"price",value:null,unit:"USD",date:null,change_pct:null,volatility:null,source:"Backend requerido"},
      {symbol:"VNQ",name:"REITs EE.UU.",kind:"price",value:null,unit:"USD",date:null,change_pct:null,volatility:null,source:"Backend requerido"},
      {symbol:"XLE",name:"Energía",kind:"price",value:null,unit:"USD",date:null,change_pct:null,volatility:null,source:"Backend requerido"},
      {symbol:"SOXX",name:"Semiconductores / IA",kind:"price",value:null,unit:"USD",date:null,change_pct:null,volatility:null,source:"Backend requerido"}
    ],
    opportunities:[],
    broker:{provider:"none",status:"DISCONNECTED",equity_usd:null,cash_usd:null,day_pnl_usd:null,positions:[],orders:[]},
    risk_policy:{max_single_idea_pct:20,leverage:false,auto_copy_trading:false,human_approval_required:true}
  };

  const fmtUSD = v => v==null ? "—" : new Intl.NumberFormat("es-AR",{style:"currency",currency:"USD",maximumFractionDigits:2}).format(v);
  const fmtValue = m => m.value==null ? "—" : m.kind==="yield" ? Number(m.value).toFixed(2)+"%" : fmtUSD(m.value);
  const esc = s => String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
  const addLog = text => {
    const time = new Date().toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"});
    state.logs.unshift({time,text}); state.logs=state.logs.slice(0,8); renderLogs();
  };
  const renderLogs = () => {
    $("#activityLog").innerHTML = state.logs.length ? state.logs.map(x =>
      '<div class="item"><div class="itemtop"><span>'+esc(x.time)+'</span></div>'+esc(x.text)+'</div>'
    ).join("") : '<div class="empty">Sin actividad en esta sesión.</div>';
  };
  const riskClass = r => {
    const x=(r||"").toLowerCase(); if(x.includes("bajo")) return "good"; if(x.includes("alto")) return "bad"; return "warn";
  };

  function renderDashboard(){
    const d=state.dashboard; if(!d) return;
    $("#tradingMode").textContent=(d.trading_mode||"—").toUpperCase();
    $("#brokerState").textContent=d.broker?.status||"—";
    $("#brokerState").className=d.broker?.status==="CONNECTED"?"good":"bad";
    $("#brokerProvider").textContent=d.broker?.provider||"none";
    $("#equity").textContent=fmtUSD(d.broker?.equity_usd);
    $("#cash").textContent=fmtUSD(d.broker?.cash_usd);
    $("#dayPnl").textContent=fmtUSD(d.broker?.day_pnl_usd);
    $("#studyCount").textContent=(d.opportunities||[]).filter(x=>x.decision==="ESTUDIAR").length;
    $("#executionState").textContent=d.execution_enabled?"ON":"OFF";
    $("#executionState").className=d.execution_enabled?"good":"bad";

    $("#marketCards").innerHTML=(d.market||[]).map(m =>
      '<article class="market"><div class="symbol">'+esc(m.symbol)+'</div><h3>'+esc(m.name)+'</h3>'+
      '<div class="price">'+fmtValue(m)+'</div>'+
      '<div class="row"><span class="muted">Cambio</span><span>'+ (m.change_pct==null?"—":Number(m.change_pct).toFixed(2)+"%") +'</span></div>'+
      '<div class="row"><span class="muted">Volatilidad</span><span>'+ (m.volatility==null?"—":Number(m.volatility).toFixed(2)+"%") +'</span></div>'+
      '<div class="row"><span class="muted">Fecha</span><span>'+esc(m.date||"—")+'</span></div></article>'
    ).join("");

    $("#priorityList").innerHTML=(d.opportunities||[]).length ? d.opportunities.slice(0,6).map(o =>
      '<div class="item"><div class="itemtop"><strong>'+esc(o.symbol)+' · '+esc(o.decision)+'</strong><strong>'+o.priority_score+'/100</strong></div>'+
      '<div class="'+riskClass(o.risk)+'">'+esc(o.risk)+'</div><div class="muted">'+esc(o.thesis)+'</div></div>'
    ).join("") : '<div class="empty">El backend todavía no entregó oportunidades.</div>';

    $("#opportunityRows").innerHTML=(d.opportunities||[]).map(o =>
      '<tr><td><strong>'+esc(o.symbol)+'</strong><br><span class="muted">'+esc(o.name)+'</span></td><td>'+o.priority_score+'/100</td><td class="'+riskClass(o.risk)+'">'+esc(o.risk)+'</td><td>'+esc(o.decision)+'</td><td>'+esc(o.thesis)+'</td><td>'+esc(o.date||"—")+'</td></tr>'
    ).join("");

    const p=d.risk_policy||{};
    $("#riskPolicy").innerHTML=[
      ["Máximo inicial por idea",(p.max_single_idea_pct??"—")+"%"],
      ["Apalancamiento",p.leverage?"ON":"OFF"],
      ["Copy trading automático",p.auto_copy_trading?"ON":"OFF"],
      ["Aprobación humana",p.human_approval_required?"OBLIGATORIA":"NO"]
    ].map(x=>'<div class="item"><div class="itemtop"><span>'+esc(x[0])+'</span><strong>'+esc(x[1])+'</strong></div></div>').join("");

    $("#volBars").innerHTML=(d.market||[]).filter(m=>m.volatility!=null).map(m=>{
      const w=Math.max(4,Math.min(100,(Number(m.volatility)/50)*100));
      return '<div class="barrow"><strong>'+esc(m.symbol)+'</strong><div class="bar"><span style="width:'+w+'%"></span></div><span>'+Number(m.volatility).toFixed(1)+'%</span></div>';
    }).join("") || '<div class="empty">Sin volatilidad disponible.</div>';

    if(d.broker?.positions?.length){
      $("#portfolioEmpty").innerHTML=d.broker.positions.map(p=>'<div class="item">'+esc(JSON.stringify(p))+'</div>').join("");
    }
  }

  function renderEcosystem(){
    const d=state.dashboard||fallback;
    const a=state.agents;
    const backendBadge=$("#backendBadge");
    const modelBadge=$("#modelBadge");
    const brokerBadge=$("#brokerBadge");
    if(!backendBadge) return;

    backendBadge.className="status-pill "+(state.backendConnected?"ok":"waiting");
    backendBadge.textContent="BACKEND · "+(state.backendConnected?"CONECTADO":"PENDIENTE");

    const modelReady=!!a && a.status!=="DISABLED";
    modelBadge.className="status-pill "+(modelReady?"ok":"waiting");
    modelBadge.textContent="OPENAI · "+(modelReady?"ACTIVO":"PENDIENTE");

    const brokerReady=d.broker?.status==="CONNECTED";
    brokerBadge.className="status-pill "+(brokerReady?"ok":"waiting");
    brokerBadge.textContent="BROKER · "+(brokerReady?"CONECTADO":"DESCONECTADO");

    const marketNode=document.querySelector('[data-node="Market Data"]');
    if(marketNode){
      marketNode.className="eco-node source "+(state.backendConnected?"ok":"");
      $("#ecoMarketState").textContent=state.backendConnected ? ((d.market||[]).length+" FUENTES / ACTIVOS") : "ESPERANDO BACKEND";
    }

    const outputs=a?.outputs||{};
    $(".ecosystem-agent").forEach(node=>{
      const name=node.dataset.agent;
      const value=outputs[name];
      node.classList.remove("running","ok","error");
      const small=$("small",node);
      if(state.cycleRunning){
        node.classList.add("running");
        small.textContent="EJECUTANDO";
      }else if(value){
        const failed=String(value).startsWith("ERROR:");
        node.classList.add(failed?"error":"ok");
        small.textContent=failed?"ERROR":"COMPLETADO";
      }else{
        small.textContent="EN ESPERA";
      }
    });

    const central=document.querySelector('[data-node="Central"]');
    if(central){
      central.classList.remove("running","ok","error");
      if(state.cycleRunning){
        central.classList.add("running"); $("#ecoCentralState").textContent="ESPERANDO ESPECIALISTAS";
      }else if(a?.central){
        const failed=String(a.central).startsWith("ERROR:");
        central.classList.add(failed?"error":"ok"); $("#ecoCentralState").textContent=failed?"ERROR":"DICTAMEN LISTO";
      }else{
        $("#ecoCentralState").textContent="EN ESPERA";
      }
    }

    $("#ecoBrokerState").textContent=brokerReady?"CONECTADO":"DESCONECTADO";
    $("#cycleState").textContent=state.cycleRunning?"EJECUTANDO":(a?.status||"SIN EJECUTAR");

    if(state.cycleRunning){
      $("#cycleTrace").textContent="01  Mercado y tasa cargados\n02  Especialistas analizando en paralelo\n03  Riesgo y verificación aplicando controles\n04  Administrador Central esperando resultados";
    }else if(a){
      const okCount=Object.values(outputs).filter(v=>!String(v).startsWith("ERROR:")).length;
      $("#cycleTrace").textContent=
        "Ciclo finalizado: "+a.status+"\n"+
        "Especialistas completados: "+okCount+"/8\n"+
        "Administrador Central: "+(a.central?"dictamen generado":"sin dictamen")+"\n"+
        "Ejecución broker: "+(brokerReady?"disponible con aprobación":"bloqueada; broker no conectado");
    }else{
      $("#cycleTrace").textContent=state.backendConnected
        ?"Backend conectado. Pulsá «Ejecutar ciclo completo» para observar a los agentes."
        :"Frontend publicado. Falta desplegar el backend para que los agentes puedan operar de verdad.";
    }
  }

  function renderAgents(){
    const a=state.agents;
    const outputs=a?.outputs||{};
    const roles=["Seguridad","Mercado","Inmobiliario","Energía","IA / Semiconductores","Costos","Riesgo","Verificador"];
    $("#agentGrid").innerHTML=roles.map(r =>
      '<article class="agent"><strong>'+esc(r)+'</strong><p>'+esc(outputs[r]||"En espera de ejecución.")+'</p></article>'
    ).join("");
    if(a?.central) $("#centralDecision").textContent=a.central;
    renderEcosystem();
  }

  async function load(){
    $("#refreshBtn").disabled=true;
    try{
      const r=await fetch("/api/dashboard",{cache:"no-store"});
      if(!r.ok) throw new Error("HTTP "+r.status);
      state.dashboard=await r.json();
      state.backendConnected=true;
      $("#liveDot").className="dot";
      $("#systemLabel").textContent="Backend conectado";
      addLog("Datos actualizados desde el backend.");
    }catch(err){
      state.dashboard=fallback;
      state.backendConnected=false;
      $("#liveDot").className="dot amber";
      $("#systemLabel").textContent="Vista previa · backend pendiente";
      addLog("Vista previa cargada. El backend todavía no está desplegado en este dominio.");
    }finally{
      renderDashboard();renderAgents();renderEcosystem();$("#refreshBtn").disabled=false;
    }
  }

  async function runAgents(){
    const buttons=[$("#runAgentsBtn"),$("#runAgentsBtn2"),$("#runEcosystemBtn")].filter(Boolean); buttons.forEach(b=>b.disabled=true);
    state.cycleRunning=true; renderEcosystem();
    $("#centralDecision").textContent="Ejecutando especialistas…";
    try{
      const r=await fetch("/api/agents/run",{method:"POST"});
      if(!r.ok) throw new Error("HTTP "+r.status);
      state.agents=await r.json();
      state.cycleRunning=false; renderAgents(); renderEcosystem();
      addLog("Ciclo multiagente completado: "+state.agents.status+".");
    }catch(err){
      state.cycleRunning=false;
      $("#centralDecision").textContent="Los agentes requieren un backend desplegado con OPENAI_API_KEY.";
      addLog("No se pudo ejecutar agentes: "+err.message);
      renderEcosystem();
    }finally{buttons.forEach(b=>b.disabled=false);}
  }

  async function draft(){
    const payload={
      symbol:$("#orderSymbol").value.trim().toUpperCase(),
      side:$("#orderSide").value,
      quantity:Number($("#orderQty").value),
      order_type:$("#orderType").value,
      limit_price:$("#orderType").value==="LIMIT"?Number($("#orderPrice").value):null,
      reference_equity_usd:state.dashboard?.broker?.equity_usd||null
    };
    try{
      const r=await fetch("/api/orders/draft",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
      if(!r.ok) throw new Error("HTTP "+r.status);
      const out=await r.json(); $("#draftOutput").textContent=JSON.stringify(out,null,2);
      addLog("Borrador de orden validado para "+payload.symbol+".");
    }catch(err){
      $("#draftOutput").textContent="El ticket requiere el backend operacional.\n"+err.message;
      addLog("No se pudo preparar borrador.");
    }
  }

  $$(".tab").forEach(btn=>btn.addEventListener("click",()=>{
    $$(".tab").forEach(x=>x.classList.remove("active")); $$(".view").forEach(x=>x.classList.remove("active"));
    btn.classList.add("active"); $("#view-"+btn.dataset.view).classList.add("active");
  }));
  $("#refreshBtn").addEventListener("click",load);
  $("#runAgentsBtn").addEventListener("click",runAgents);
  $("#runAgentsBtn2").addEventListener("click",runAgents);
  $("#runEcosystemBtn").addEventListener("click",runAgents);
  $("#draftBtn").addEventListener("click",draft);
  renderLogs(); load();
})();
