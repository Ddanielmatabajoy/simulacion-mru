// Simulador MRU/MRUA - vista solo izquierda, MRU habilitado y botón Reiniciar destacado
document.addEventListener('DOMContentLoaded', () => {
  // Helper: aceptar comas decimales
  const num = (v, fallback = 0) => {
    const n = Number(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : fallback;
  };

  // Referencias
  const tipoSel    = document.getElementById('tipoSel');
  const durEl      = document.getElementById('dur');
  const aEl        = document.getElementById('a');
  const v0El       = document.getElementById('v0');
  const estadoChip = document.getElementById('estadoChip');

  const tMas   = document.getElementById('tMas');
  const tMenos = document.getElementById('tMenos');
  const aMas   = document.getElementById('aMas');
  const aMenos = document.getElementById('aMenos');
  const vMas   = document.getElementById('vMas');
  const vMenos = document.getElementById('vMenos');

  const playPause = document.getElementById('playPause');
  const resetBtn  = document.getElementById('resetBtn');
  const resultBtn = document.getElementById('resultBtn');

  const track     = document.getElementById('track');
  const carEl     = document.getElementById('car');
  const miniTrack = document.getElementById('miniTrack');
  const miniDot   = document.getElementById('miniDot');

  const accCtx  = document.getElementById('chartAcc').getContext('2d');
  const velCtx  = document.getElementById('chartVel').getContext('2d');
  const distCtx = document.getElementById('chartDist').getContext('2d');

  const accBox  = document.getElementById('accBox');
  const accHint = document.getElementById('accHint');

  // Estado
  let timer = null;
  let running = false;
  let chartsReady = false;

  const state = {
    tipo: 2, v0: 0, a: 3, T: 6.6,
    dt: 0.05, t: 0, pxPerMeter: 10, x0_m: 0,
    series: { t:[], a:[], v:[], x:[] }
  };

  // Lectura y escala
  function readInputs() {
    state.tipo = num(tipoSel.value, 2);
    state.v0   = num(v0El.value, 0);
    state.a    = num(aEl.value, 0);
    state.T    = Math.max(0.2, num(durEl.value, 6.6));
  }
  function computeScale(){
    const w = track.clientWidth - 60;
    const { v0, a, T, tipo } = state;
    const xT = (tipo === 1) ? (v0*T) : (v0*T + 0.5*a*T*T);
    const span = Math.max(5, Math.abs(xT) + 2);
    state.pxPerMeter = Math.max(2, w / span);
  }
  function setCar(px){
    carEl.style.transform = `translateX(${px}px)`;
    const maxMini = miniTrack.clientWidth - 26;
    const frac = Math.max(0, Math.min(1, px / (track.clientWidth - 80)));
    miniDot.style.transform = `translateX(${frac * maxMini}px)`;
  }

  // UI aceleración (deshabilitar en MRU)
  function reflectTipo(){
    const isMRU = String(tipoSel.value) === '1';
    aEl.disabled = isMRU;
    accBox.classList.toggle('disabled', isMRU);
    accHint.style.display = isMRU ? 'block' : 'none';
    if (isMRU) aEl.value = '0';
  }

  // Gráficas (perezosas)
  let chartAcc = null, chartVel = null, chartDist = null;

  function makeChart(ctx, yLabel, color){
    const grid = { color: getComputedStyle(document.documentElement).getPropertyValue('--grid') || '#3b4253' };
    const axisTitle = (t)=> ({ display:true, text:t, color:'#e5e7eb', font:{weight:'700'} });
    return new Chart(ctx, {
      type: 'line',
      data: { labels:[], datasets:[{ data:[], borderColor:color, borderWidth:2, fill:false, pointRadius:0 }]},
      options: {
        animation:false, responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{ display:false } },
        scales:{
          x:{ grid, ticks:{ color:'#cbd5e1' }, title:axisTitle('tiempo [s]') },
          y:{ grid, ticks:{ color:'#cbd5e1' }, title:axisTitle(yLabel), beginAtZero:true }
        }
      }
    });
  }

  function initCharts(){
    if (chartsReady) return true;
    if (!window.Chart) { alert('No se pudo cargar Chart.js. Revisa tu conexión.'); return false; }
    chartAcc  = makeChart(accCtx,  'aceleración [m/s²]', '#f59e0b');
    chartVel  = makeChart(velCtx,  'velocidad [m/s]',   '#38bdf8');
    chartDist = makeChart(distCtx, 'distancia [m]',     '#34d399');
    chartsReady = true;
    return true;
  }
  function resetCharts(){
    if (!chartsReady) return;
    [chartAcc, chartVel, chartDist].forEach(c => { c.data.labels=[]; c.data.datasets[0].data=[]; c.update(); });
    state.series = { t:[], a:[], v:[], x:[] };
  }

  // Simulación
  function step(){
    const { tipo, v0, a, x0_m } = state;
    let { t } = state;

    const acc = (tipo === 1) ? 0 : a;
    const v   = (tipo === 1) ? v0 : (v0 + a * t);
    const x   = (tipo === 1) ? (x0_m + v0*t) : (x0_m + v0*t + 0.5*a*t*t);

    // Series y gráficas
    if (chartsReady){
      const lbl = t.toFixed(2);
      chartAcc.data.labels.push(lbl);  chartAcc.data.datasets[0].data.push(acc);
      chartVel.data.labels.push(lbl);  chartVel.data.datasets[0].data.push(v);
      chartDist.data.labels.push(lbl); chartDist.data.datasets[0].data.push(x - x0_m);
      chartAcc.update('none'); chartVel.update('none'); chartDist.update('none');
    }

    // Movimiento
    const px = 20 + (x - x0_m) * state.pxPerMeter;
    setCar(px);

    // Tiempo y fin
    state.t = +(t + state.dt).toFixed(6);
    if (state.t > state.T + 1e-9) pause(true);
  }

  function play(){
    if (!chartsReady && !initCharts()) return;
    if (running) return;
    readInputs(); reflectTipo();
    computeScale();
    running = true;
    estadoChip.textContent = 'Reproduciendo'; estadoChip.style.background = '#0b5';
    playPause.textContent = 'Pausa';
    if (state.t <= 0) { resetCharts(); setCar(20); }
    timer = setInterval(step, state.dt * 1000);
  }

  function pause(finished=false){
    if (timer) { clearInterval(timer); timer=null; }
    running = false;
    estadoChip.textContent = finished ? 'Finalizado' : 'Pausado';
    estadoChip.style.background = finished ? '#2563eb' : '#334155';
    playPause.textContent = finished ? 'Reiniciar ▶' : 'Continuar';
    resultBtn.disabled = !finished;
  }

  function togglePlay(){ running ? pause() : play(); }

  function hardReset(){
    pause();
    state.t = 0;
    readInputs(); reflectTipo(); computeScale(); resetCharts(); setCar(20);
    estadoChip.textContent = 'Detenido'; estadoChip.style.background = '#374151';
    playPause.textContent = 'Iniciar';
    resultBtn.disabled = true;
  }

  // Resultados
  const modal = document.getElementById('modal');
  const closeModal = document.getElementById('closeModal');
  const tblRes = document.getElementById('tblRes');
  const copyRes = document.getElementById('copyRes');
  const saveRes = document.getElementById('saveRes');

  function openResults(){
    const t = state.T;
    const v_final = (state.tipo === 1) ? state.v0 : (state.v0 + state.a * t);
    const x_final = (state.tipo === 1) ? (state.v0 * t) : (state.v0 * t + 0.5 * state.a * t * t);
    const rows = [
      ['Tipo', state.tipo === 1 ? 'MRU (a=0)' : 'MRUA (a constante)'],
      ['Tiempo total (s)', t.toFixed(2)],
      ['Velocidad inicial (m/s)', state.v0.toFixed(2)],
      ['Aceleración (m/s²)', (state.tipo===1?0:state.a).toFixed(2)],
      ['Velocidad final (m/s)', v_final.toFixed(2)],
      ['Distancia recorrida (m)', x_final.toFixed(2)],
    ];
    tblRes.innerHTML = rows.map(r=>`<tr><th>${r[0]}</th><td>${r[1]}</td></tr>`).join('');
    modal.style.display = 'grid';
  }
  function closeResults(){ modal.style.display = 'none'; }

  // Eventos
  playPause.addEventListener('click', togglePlay);
  resetBtn.addEventListener('click', hardReset);
  resultBtn.addEventListener('click', openResults);
  closeModal.addEventListener('click', closeResults);
  modal.addEventListener('click', (e)=> { if(e.target===modal) closeResults(); });

  tipoSel.addEventListener('change', () => { hardReset(); });
  window.addEventListener('resize', computeScale);

  tMas.onclick   = ()=> { durEl.stepUp(); hardReset(); };
  tMenos.onclick = ()=> { durEl.stepDown(); hardReset(); };
  aMas.onclick   = ()=> { aEl.stepUp();   hardReset(); };
  aMenos.onclick = ()=> { aEl.stepDown(); hardReset(); };
  vMas.onclick   = ()=> { v0El.stepUp();  hardReset(); };
  vMenos.onclick = ()=> { v0El.stepDown();hardReset(); };

  // Inicio
  reflectTipo();
  hardReset();
});