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

  // Estilo gráfico tipo UNAM: fondo oscuro, ejes/título naranja itálico, línea cian, grilla fina
  const CHART_CYAN   = '#5fc3e4';
  const CHART_ORANGE = '#ff7a1a';
  const CHART_GRID   = 'rgba(255,255,255,.18)';
  const CHART_TICK   = '#e6e6e6';

  function makeChart(ctx, yLabel, color){
    const axisTitle = (t)=> ({
      display:true, text:t,
      color: CHART_ORANGE,
      font:{ style:'italic', weight:'600', size:12, family:'Lora, Georgia, serif' }
    });
    return new Chart(ctx, {
      type: 'line',
      data: { labels:[], datasets:[{ data:[], borderColor:color, borderWidth:2.2, fill:false, pointRadius:0, tension:0 }]},
      options: {
        animation:false, responsive:true, maintainAspectRatio:false,
        layout:{ padding: 4 },
        plugins:{ legend:{ display:false }, tooltip:{ enabled:false } },
        scales:{
          x:{
            type:'linear',
            min: 0, max: 10,
            grid:{ color: CHART_GRID, drawBorder:true, borderColor: CHART_ORANGE },
            border:{ color: CHART_ORANGE, width: 1.5 },
            ticks:{ color: CHART_TICK, stepSize: 2, font:{ size:11 } },
            title: axisTitle('tiempo [s]')
          },
          y:{
            grid:{ color: CHART_GRID, drawBorder:true, borderColor: CHART_ORANGE },
            border:{ color: CHART_ORANGE, width: 1.5 },
            ticks:{ color: CHART_TICK, font:{ size:11 } },
            title: axisTitle(yLabel),
            beginAtZero: true
          }
        }
      }
    });
  }

  function initCharts(){
    if (chartsReady) return true;
    if (!window.Chart) { alert('No se pudo cargar Chart.js. Revisa tu conexión.'); return false; }
    chartAcc  = makeChart(accCtx,  'aceleración [m/s²]', CHART_CYAN);
    chartVel  = makeChart(velCtx,  'velocidad [m/s]',   CHART_CYAN);
    chartDist = makeChart(distCtx, 'distancia [m]',     CHART_CYAN);
    chartsReady = true;
    return true;
  }

  // Calcula escalas fijas en función de T, v0, a y tipo (para que no se "muevan" durante la simulación)
  function applyFixedScales(){
    if (!chartsReady) return;
    const { tipo, v0, a, T } = state;
    const aMag = (tipo === 1) ? 0 : Math.abs(a);
    const vFin = (tipo === 1) ? v0 : (v0 + a * T);
    const xFin = (tipo === 1) ? (v0 * T) : (v0 * T + 0.5 * a * T * T);

    const aMax = Math.max(2, Math.ceil((aMag || 1) * 1.25));
    const aMin = (tipo === 1 || a >= 0) ? 0 : -aMax;

    // velocidad: ampliar 25% por encima del máximo entre v0 y vFin
    const vAbs = Math.max(Math.abs(v0), Math.abs(vFin), 1);
    const vMax = Math.ceil(vAbs * 1.25);
    const vMin = (v0 < 0 || vFin < 0) ? -vMax : 0;

    const xAbs = Math.max(Math.abs(xFin), 1);
    const xMax = Math.ceil(xAbs * 1.15);
    const xMin = xFin < 0 ? -xMax : 0;

    const tMax = Math.ceil(T);

    [chartAcc, chartVel, chartDist].forEach(c => { c.options.scales.x.max = tMax; });

    chartAcc.options.scales.y.min = aMin;
    chartAcc.options.scales.y.max = aMax;
    chartVel.options.scales.y.min = vMin;
    chartVel.options.scales.y.max = vMax;
    chartDist.options.scales.y.min = xMin;
    chartDist.options.scales.y.max = xMax;

    chartAcc.update('none'); chartVel.update('none'); chartDist.update('none');
  }

  function resetCharts(){
    if (!chartsReady) return;
    [chartAcc, chartVel, chartDist].forEach(c => { c.data.labels=[]; c.data.datasets[0].data=[]; c.update(); });
    state.series = { t:[], a:[], v:[], x:[] };
    applyFixedScales();
  }

  // Simulación
  function step(){
    const { tipo, v0, a, x0_m } = state;
    let { t } = state;

    const acc = (tipo === 1) ? 0 : a;
    const v   = (tipo === 1) ? v0 : (v0 + a * t);
    const x   = (tipo === 1) ? (x0_m + v0*t) : (x0_m + v0*t + 0.5*a*t*t);

    // Series y gráficas (eje X numérico)
    if (chartsReady){
      chartAcc.data.datasets[0].data.push({ x: t, y: acc });
      chartVel.data.datasets[0].data.push({ x: t, y: v });
      chartDist.data.datasets[0].data.push({ x: t, y: x - x0_m });
      state.series.t.push(t);
      state.series.a.push(acc);
      state.series.v.push(v);
      state.series.x.push(x - x0_m);
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
    applyFixedScales();
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
    buildExercises(v_final, x_final);
    modal.style.display = 'grid';
  }
  function closeResults(){ modal.style.display = 'none'; }

  // ===================== EJERCICIOS =====================
  const exList     = document.getElementById('exList');
  const checkExBtn = document.getElementById('checkExBtn');
  const resetExBtn = document.getElementById('resetExBtn');
  const exScore    = document.getElementById('exScore');

  function nearestQuarter(val){
    // Genera "distractores" plausibles cerca del valor correcto
    return Math.round(val * 4) / 4;
  }

  // Construye y mezcla opciones. correctIdx se calcula DESPUÉS de barajar.
  function shuffleOptions(options){
    const arr = options.slice();
    for (let i = arr.length - 1; i > 0; i--){
      const j = Math.floor(Math.random()*(i+1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function buildExercises(vFin, xFin){
    const isMRU = state.tipo === 1;
    const a = isMRU ? 0 : state.a;
    const v0 = state.v0;
    const T = state.T;

    // Distractores numéricos
    const vRound = +vFin.toFixed(1);
    const xRound = +xFin.toFixed(1);

    const questions = [
      {
        q: "Observa la gráfica de <strong>velocidad vs. tiempo</strong>. ¿Cómo se comporta la velocidad durante el recorrido?",
        options: shuffleOptions([
          { t: "Permanece constante (línea horizontal).",        ok: isMRU },
          { t: "Aumenta linealmente (recta inclinada hacia arriba).", ok: !isMRU && a > 0 },
          { t: "Disminuye linealmente (recta inclinada hacia abajo).", ok: !isMRU && a < 0 },
          { t: "Forma una parábola.",                            ok: false }
        ]),
        why: isMRU
          ? "En MRU la velocidad no cambia: su gráfica es una línea horizontal."
          : (a > 0
              ? "En MRUA con a > 0 la velocidad aumenta a razón constante: la gráfica es una recta inclinada hacia arriba."
              : "En MRUA con a < 0 la velocidad disminuye a razón constante: la gráfica es una recta inclinada hacia abajo.")
      },
      {
        q: "Observa la gráfica de <strong>distancia vs. tiempo</strong>. ¿Qué forma tiene?",
        options: shuffleOptions([
          { t: "Línea recta inclinada (distancia ∝ tiempo).", ok: isMRU },
          { t: "Una parábola (distancia ∝ tiempo²).",          ok: !isMRU },
          { t: "Línea horizontal (distancia constante).",       ok: false },
          { t: "Una curva exponencial.",                        ok: false }
        ]),
        why: isMRU
          ? "En MRU, x = v₀·t es una recta. La pendiente es la velocidad."
          : "En MRUA, x = v₀·t + ½·a·t² es una parábola. Su concavidad depende del signo de a."
      },
      {
        q: "Observa la gráfica de <strong>aceleración vs. tiempo</strong>. ¿Qué valor representa?",
        options: shuffleOptions([
          { t: "Cero durante todo el recorrido.",                     ok: isMRU },
          { t: "Una constante distinta de cero.",                     ok: !isMRU },
          { t: "Una recta inclinada que crece con el tiempo.",        ok: false },
          { t: "Variable, depende de la velocidad inicial.",           ok: false }
        ]),
        why: isMRU
          ? "En MRU la aceleración es cero: por eso la velocidad no cambia."
          : "En MRUA la aceleración es constante: por eso la velocidad cambia a razón constante."
      },
      {
        q: `Mirando la gráfica, ¿cuál fue aproximadamente la <strong>velocidad final</strong> al cabo de ${T.toFixed(1)} s?`,
        options: shuffleOptions([
          { t: `${vRound.toFixed(1)} m/s`,                                       ok: true  },
          { t: `${(vRound + Math.max(2, Math.abs(vRound)*0.35 + 1)).toFixed(1)} m/s`, ok: false },
          { t: `${(vRound - Math.max(2, Math.abs(vRound)*0.35 + 1)).toFixed(1)} m/s`, ok: false },
          { t: `${(vRound / 2 + 0.5).toFixed(1)} m/s`,                            ok: false }
        ]),
        why: isMRU
          ? `En MRU v = v₀ = ${v0.toFixed(1)} m/s en todo momento.`
          : `En MRUA v = v₀ + a·t = ${v0.toFixed(1)} + (${a.toFixed(1)})·(${T.toFixed(1)}) = ${vRound.toFixed(1)} m/s.`
      }
    ];

    // Render
    exList.innerHTML = questions.map((qq, i) => `
      <div class="ex-item" data-qi="${i}">
        <div class="ex-q"><span class="ex-num">${i+1}.</span> ${qq.q}</div>
        <div class="ex-opts">
          ${qq.options.map((op, j) => `
            <label class="ex-opt" data-correct="${op.ok ? '1' : '0'}">
              <input type="radio" name="ex_${i}" value="${j}">
              <span class="ex-cone" aria-hidden="true"></span>
              <span class="ex-opt-text">${op.t}</span>
            </label>
          `).join('')}
        </div>
        <div class="ex-feedback" id="exFb_${i}" hidden></div>
      </div>
    `).join('');

    // Guardamos las explicaciones para mostrarlas al revisar
    exList._whys = questions.map(q => q.why);
    exScore.textContent = '';
    checkExBtn.disabled = false;
  }

  function checkExercises(){
    const items = exList.querySelectorAll('.ex-item');
    let correct = 0;
    items.forEach((item, i) => {
      const opts = item.querySelectorAll('.ex-opt');
      const selected = item.querySelector('input[type=radio]:checked');
      let isOk = false;
      opts.forEach(op => {
        op.classList.remove('ok','bad','sel');
        const okFlag = op.dataset.correct === '1';
        const radio = op.querySelector('input');
        if (radio === selected || radio.checked) op.classList.add('sel');
        if (okFlag) op.classList.add('ok');
        if (radio.checked && !okFlag) op.classList.add('bad');
        if (radio.checked && okFlag) isOk = true;
      });
      const fb = document.getElementById('exFb_' + i);
      if (fb){
        fb.hidden = false;
        const why = (exList._whys && exList._whys[i]) || '';
        fb.innerHTML = selected
          ? (isOk
              ? `<span class="fb-ok">✓ Correcto.</span> ${why}`
              : `<span class="fb-bad">✗ Incorrecto.</span> ${why}`)
          : `<span class="fb-warn">⚠ Sin respuesta.</span> ${why}`;
      }
      if (isOk) correct++;
    });
    exScore.textContent = `Calificación: ${correct} / ${items.length}`;
    exScore.className = 'ex-score ' + (correct === items.length ? 'ok' : (correct >= items.length/2 ? 'partial' : 'bad'));
  }

  function resetExercises(){
    const items = exList.querySelectorAll('.ex-item');
    items.forEach((item, i) => {
      item.querySelectorAll('.ex-opt').forEach(op => op.classList.remove('ok','bad','sel'));
      item.querySelectorAll('input[type=radio]').forEach(r => r.checked = false);
      const fb = document.getElementById('exFb_' + i);
      if (fb){ fb.hidden = true; fb.innerHTML = ''; }
    });
    exScore.textContent = '';
    exScore.className = 'ex-score';
  }

  if (checkExBtn) checkExBtn.addEventListener('click', checkExercises);
  if (resetExBtn) resetExBtn.addEventListener('click', resetExercises);

  // ===================== RETOS (panel lateral) =====================
  // Cada reto define: titulo, nivel, historia (text), parámetros sugeridos y pregunta con opciones.
  const RETOS = {
    0: {
      titulo: 'Modo libre',
      nivel:  'Sin reto',
      text:   'Estás en modo libre: elige un nivel arriba para recibir un reto con una historia, parámetros sugeridos y una pregunta que se contesta observando las gráficas.',
      params: null,
      pregunta: null
    },
    1: {
      titulo: 'Novato — Sigue una velocidad',
      nivel:  'Nivel 1 · MRU',
      text:   'Un Mini Cooper viaja por una carretera recta con velocidad constante de 20 m/s durante 8 segundos. No frena ni acelera.\n\nCarga los parámetros, pulsa Iniciar y observa las gráficas.',
      params: { tipo: 1, v0: 20, a: 0, T: 8 },
      pregunta: {
        q: 'Mirando la gráfica de <strong>distancia vs. tiempo</strong>, ¿cuántos metros recorrió el Mini Cooper al final del trayecto?',
        opts: [
          { t: '160 m',  ok: true  },
          { t: '80 m',   ok: false },
          { t: '320 m',  ok: false },
          { t: '20 m',   ok: false }
        ],
        why: 'En MRU, x = v·t = 20 · 8 = 160 m. La gráfica de distancia es una recta cuya pendiente es la velocidad.'
      }
    },
    2: {
      titulo: 'Aprendiz — Arranque del Lamborghini',
      nivel:  'Nivel 2 · MRUA',
      text:   'Un Lamborghini parte del reposo y mantiene una aceleración constante de 5 m/s² durante 4 segundos.\n\nCarga los parámetros, pulsa Iniciar y mira con atención las gráficas de velocidad y distancia.',
      params: { tipo: 2, v0: 0, a: 5, T: 4 },
      pregunta: {
        q: 'Observando la gráfica de <strong>velocidad vs. tiempo</strong>, ¿qué velocidad alcanza el Lamborghini al cabo de los 4 segundos?',
        opts: [
          { t: '20 m/s',  ok: true  },
          { t: '10 m/s',  ok: false },
          { t: '40 m/s',  ok: false },
          { t: '5 m/s',   ok: false }
        ],
        why: 'En MRUA con v₀ = 0: v = a·t = 5 · 4 = 20 m/s. La gráfica de velocidad es una recta que sube desde 0.'
      }
    },
    3: {
      titulo: 'Experimentado — Carrera con ventaja',
      nivel:  'Nivel 3 · MRUA',
      text:   'Un Camaro entra a una recta con velocidad inicial de 10 m/s y acelera a 3 m/s² durante 6 segundos.\n\nUsa los parámetros y luego compara las gráficas para responder.',
      params: { tipo: 2, v0: 10, a: 3, T: 6 },
      pregunta: {
        q: '¿Qué <strong>distancia total</strong> recorrió el Camaro durante los 6 segundos? (Usa la gráfica de distancia y, si quieres, verifica con x = v₀·t + ½·a·t².)',
        opts: [
          { t: '114 m',  ok: true  },
          { t: '60 m',   ok: false },
          { t: '180 m',  ok: false },
          { t: '54 m',   ok: false }
        ],
        why: 'x = v₀·t + ½·a·t² = 10·6 + ½·3·36 = 60 + 54 = 114 m. Por eso la gráfica de distancia es una parábola creciente.'
      }
    },
    4: {
      titulo: 'Reto final — Frenado de emergencia',
      nivel:  'Nivel 4 · MRUA con a < 0',
      text:   'Un auto viaja a 25 m/s y aplica los frenos con una desaceleración constante de −5 m/s² hasta detenerse por completo.\n\nCarga los parámetros y observa especialmente la gráfica de velocidad.',
      params: { tipo: 2, v0: 25, a: -5, T: 5 },
      pregunta: {
        q: 'Según la gráfica de <strong>velocidad vs. tiempo</strong>, ¿en qué instante el auto queda completamente detenido?',
        opts: [
          { t: 'A los 5 s', ok: true  },
          { t: 'A los 2 s', ok: false },
          { t: 'A los 25 s', ok: false },
          { t: 'Nunca se detiene', ok: false }
        ],
        why: 'El auto se detiene cuando v = 0 → 0 = v₀ + a·t → t = −v₀/a = −25/(−5) = 5 s. En la gráfica, la recta cruza el eje horizontal en t = 5 s.'
      }
    }
  };

  // Referencias del panel lateral
  const levelTabs   = document.querySelectorAll('.level-tab');
  const chTitle     = document.getElementById('chTitle');
  const chLevel     = document.getElementById('chLevel');
  const chText      = document.getElementById('chText');
  const chParams    = document.getElementById('chParams');
  const cpTipo      = document.getElementById('cpTipo');
  const cpV0        = document.getElementById('cpV0');
  const cpA         = document.getElementById('cpA');
  const cpT         = document.getElementById('cpT');
  const loadParamsBtn = document.getElementById('loadParamsBtn');
  const chQuestion  = document.getElementById('chQuestion');
  const cqText      = document.getElementById('cqText');
  const cqOpts      = document.getElementById('cqOpts');
  const checkChBtn  = document.getElementById('checkChBtn');
  const resetChBtn  = document.getElementById('resetChBtn');
  const cqFeedback  = document.getElementById('cqFeedback');

  let currentLevel = 0;

  function renderReto(levelKey){
    const r = RETOS[levelKey] || RETOS[0];
    chTitle.textContent = r.titulo;
    chLevel.textContent = r.nivel;
    chText.textContent  = r.text;

    if (r.params){
      cpTipo.textContent = r.params.tipo === 1 ? 'MRU' : 'MRUA';
      cpV0.textContent   = r.params.v0 + ' m/s';
      cpA.textContent    = r.params.a  + ' m/s²';
      cpT.textContent    = r.params.T  + ' s';
      chParams.hidden = false;
      loadParamsBtn.hidden = false;
    } else {
      chParams.hidden = true;
      loadParamsBtn.hidden = true;
    }

    if (r.pregunta){
      cqText.innerHTML = r.pregunta.q;
      // Mezclamos las opciones para que la correcta no quede siempre primero
      const opts = r.pregunta.opts.map((op, i) => ({ ...op, _i: i }));
      for (let i = opts.length - 1; i > 0; i--){
        const j = Math.floor(Math.random()*(i+1));
        [opts[i], opts[j]] = [opts[j], opts[i]];
      }
      cqOpts.innerHTML = opts.map((op, j) => `
        <label class="ex-opt" data-correct="${op.ok ? '1' : '0'}">
          <input type="radio" name="ch_opt" value="${j}">
          <span class="ex-cone" aria-hidden="true"></span>
          <span class="ex-opt-text">${op.t}</span>
        </label>
      `).join('');
      cqOpts._why = r.pregunta.why;
      chQuestion.hidden = false;
      cqFeedback.hidden = true;
      cqFeedback.innerHTML = '';
    } else {
      chQuestion.hidden = true;
    }
  }

  function selectLevel(levelKey){
    currentLevel = levelKey;
    levelTabs.forEach(t => t.classList.toggle('active', String(t.dataset.level) === String(levelKey)));
    renderReto(levelKey);
  }

  function loadRetoParams(){
    const r = RETOS[currentLevel];
    if (!r || !r.params) return;
    tipoSel.value = String(r.params.tipo);
    durEl.value   = String(r.params.T);
    aEl.value     = String(r.params.a);
    v0El.value    = String(r.params.v0);
    hardReset();              // refleja tipo, reescala y resetea
    // efecto visual
    loadParamsBtn.textContent = '✓ Parámetros cargados';
    setTimeout(()=> loadParamsBtn.textContent = 'Cargar parámetros en la simulación', 1500);
  }

  function checkReto(){
    const opts = cqOpts.querySelectorAll('.ex-opt');
    const selected = cqOpts.querySelector('input[type=radio]:checked');
    let isOk = false;
    opts.forEach(op => {
      op.classList.remove('ok','bad','sel');
      const okFlag = op.dataset.correct === '1';
      const radio  = op.querySelector('input');
      if (radio === selected) op.classList.add('sel');
      if (okFlag) op.classList.add('ok');
      if (radio.checked && !okFlag) op.classList.add('bad');
      if (radio.checked && okFlag)  isOk = true;
    });
    cqFeedback.hidden = false;
    const why = cqOpts._why || '';
    cqFeedback.innerHTML = selected
      ? (isOk
          ? `<span class="fb-ok">✓ ¡Bien hecho!</span> ${why}`
          : `<span class="fb-bad">✗ No del todo.</span> ${why}`)
      : `<span class="fb-warn">⚠ Selecciona una opción antes de revisar.</span>`;
  }

  function resetReto(){
    cqOpts.querySelectorAll('.ex-opt').forEach(op => op.classList.remove('ok','bad','sel'));
    cqOpts.querySelectorAll('input[type=radio]').forEach(r => r.checked = false);
    cqFeedback.hidden = true;
    cqFeedback.innerHTML = '';
  }

  levelTabs.forEach(tab => {
    tab.addEventListener('click', () => selectLevel(Number(tab.dataset.level)));
  });
  if (loadParamsBtn) loadParamsBtn.addEventListener('click', loadRetoParams);
  if (checkChBtn)    checkChBtn.addEventListener('click', checkReto);
  if (resetChBtn)    resetChBtn.addEventListener('click', resetReto);

  // Inicializa en modo libre
  selectLevel(0);

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