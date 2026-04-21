const STORAGE_KEY = "tremor_sessions_v1";
const MAX_POINTS_CHART = 250;
const ANALYSIS_WINDOW_SECONDS = 4;
const HIGH_PASS_CUTOFF_HZ = 2.5;
const LOW_PASS_CUTOFF_HZ = 14;

const state = {
  sensorEnabled: false,
  running: false,
  startedAt: 0,
  endedAt: 0,
  latestOrientation: { alpha: 0, beta: 0, gamma: 0 },
  latestMotion: {
    accX: 0,
    accY: 0,
    accZ: 0,
    rotA: 0,
    rotB: 0,
    rotG: 0,
  },
  samples: [],
  analysis: null,
  sessions: [],
  sampleThrottleMs: 16,
  lastSampleTs: 0,
};

const ui = {
  btnEnable: document.getElementById("btnEnable"),
  btnStart: document.getElementById("btnStart"),
  btnStop: document.getElementById("btnStop"),
  btnExportCsv: document.getElementById("btnExportCsv"),
  btnExportJson: document.getElementById("btnExportJson"),
  btnExportPdf: document.getElementById("btnExportPdf"),
  status: document.getElementById("status"),
  metricFreq: document.getElementById("metricFreq"),
  metricRms: document.getElementById("metricRms"),
  metricAxis: document.getElementById("metricAxis"),
  metricEnergy: document.getElementById("metricEnergy"),
  metricVar: document.getElementById("metricVar"),
  metricDuration: document.getElementById("metricDuration"),
  history: document.getElementById("history"),
};

const charts = {
  raw: null,
  filtered: null,
  fft: null,
  compare: null,
};

function init() {
  loadSessions();
  setupCharts();
  bindEvents();
  renderHistory();
  updateStatus("Estado: pendiente de permisos.");
}

function bindEvents() {
  ui.btnEnable.addEventListener("click", enableSensors);
  ui.btnStart.addEventListener("click", startSession);
  ui.btnStop.addEventListener("click", stopSession);
  ui.btnExportCsv.addEventListener("click", exportCsv);
  ui.btnExportJson.addEventListener("click", exportJson);
  ui.btnExportPdf.addEventListener("click", exportPdf);
}

function isIOSPermissionRequired() {
  return (
    typeof DeviceMotionEvent !== "undefined" &&
    typeof DeviceMotionEvent.requestPermission === "function"
  );
}

async function enableSensors() {
  try {
    if (isIOSPermissionRequired()) {
      const motion = await DeviceMotionEvent.requestPermission();
      const orientation = await DeviceOrientationEvent.requestPermission();
      if (motion !== "granted" || orientation !== "granted") {
        updateStatus("Permisos rechazados. No se puede capturar.");
        return;
      }
    }

    window.addEventListener("deviceorientation", onOrientation, { passive: true });
    window.addEventListener("devicemotion", onMotion, { passive: true });

    state.sensorEnabled = true;
    ui.btnStart.disabled = false;
    ui.btnEnable.disabled = true;
    updateStatus("Sensores activos. Listo para iniciar sesion.");
  } catch (error) {
    console.error(error);
    updateStatus("Error al activar sensores. Usa HTTPS y revisa permisos.");
  }
}

function onOrientation(event) {
  state.latestOrientation.alpha = safeNumber(event.alpha);
  state.latestOrientation.beta = safeNumber(event.beta);
  state.latestOrientation.gamma = safeNumber(event.gamma);
  pushSampleIfRunning();
}

function onMotion(event) {
  const acc = event.accelerationIncludingGravity || event.acceleration || {};
  const rot = event.rotationRate || {};

  state.latestMotion.accX = safeNumber(acc.x);
  state.latestMotion.accY = safeNumber(acc.y);
  state.latestMotion.accZ = safeNumber(acc.z);
  state.latestMotion.rotA = safeNumber(rot.alpha);
  state.latestMotion.rotB = safeNumber(rot.beta);
  state.latestMotion.rotG = safeNumber(rot.gamma);

  pushSampleIfRunning();
}

function pushSampleIfRunning() {
  if (!state.running) {
    return;
  }

  const now = performance.now();
  if (now - state.lastSampleTs < state.sampleThrottleMs) {
    return;
  }

  state.lastSampleTs = now;
  const t = (now - state.startedAt) / 1000;

  state.samples.push({
    t,
    alpha: state.latestOrientation.alpha,
    beta: state.latestOrientation.beta,
    gamma: state.latestOrientation.gamma,
    accX: state.latestMotion.accX,
    accY: state.latestMotion.accY,
    accZ: state.latestMotion.accZ,
    rotA: state.latestMotion.rotA,
    rotB: state.latestMotion.rotB,
    rotG: state.latestMotion.rotG,
  });

  ui.metricDuration.textContent = `${t.toFixed(1)} s`;
  renderRealtimeCharts();
}

function startSession() {
  if (!state.sensorEnabled) {
    updateStatus("Activa sensores antes de iniciar.");
    return;
  }

  state.samples = [];
  state.analysis = null;
  state.startedAt = performance.now();
  state.endedAt = 0;
  state.lastSampleTs = 0;
  state.running = true;

  ui.btnStart.disabled = true;
  ui.btnStop.disabled = false;
  ui.btnExportCsv.disabled = true;
  ui.btnExportJson.disabled = true;
  ui.btnExportPdf.disabled = true;

  clearMetricFields();
  updateStatus("Sesion en curso: soste el movil en la mano para medir temblor.");
}

function stopSession() {
  if (!state.running) {
    return;
  }

  state.running = false;
  state.endedAt = performance.now();

  const analysis = analyzeSession(state.samples);
  state.analysis = analysis;
  updateMetricFields(analysis);
  renderAnalysisCharts(analysis);

  const session = {
    id: crypto.randomUUID(),
    timestampInicio: new Date(Date.now() - (state.endedAt - state.startedAt)).toISOString(),
    timestampFin: new Date().toISOString(),
    durationSec: (state.endedAt - state.startedAt) / 1000,
    muestras: state.samples,
    analisis: analysis,
    filterConfig: {
      highPassCutoffHz: HIGH_PASS_CUTOFF_HZ,
      lowPassCutoffHz: LOW_PASS_CUTOFF_HZ,
      windowSeconds: ANALYSIS_WINDOW_SECONDS,
    },
  };

  state.sessions.push(session);
  saveSessions();
  renderHistory();

  ui.btnStart.disabled = false;
  ui.btnStop.disabled = true;
  ui.btnExportCsv.disabled = false;
  ui.btnExportJson.disabled = false;
  ui.btnExportPdf.disabled = false;

  updateStatus(`Sesion finalizada con ${state.samples.length} muestras.`);
}

function analyzeSession(samples) {
  if (!samples.length) {
    return emptyAnalysis();
  }

  const windowSamples = getLastWindow(samples, ANALYSIS_WINDOW_SECONDS);
  const time = windowSamples.map((s) => s.t);

  const rotA = windowSamples.map((s) => s.rotA);
  const rotB = windowSamples.map((s) => s.rotB);
  const rotG = windowSamples.map((s) => s.rotG);

  const fs = estimateSamplingRate(time);

  const filtA = bandPassApprox(rotA, fs, HIGH_PASS_CUTOFF_HZ, LOW_PASS_CUTOFF_HZ);
  const filtB = bandPassApprox(rotB, fs, HIGH_PASS_CUTOFF_HZ, LOW_PASS_CUTOFF_HZ);
  const filtG = bandPassApprox(rotG, fs, HIGH_PASS_CUTOFF_HZ, LOW_PASS_CUTOFF_HZ);

  const rms = {
    A: rms(filtA),
    B: rms(filtB),
    G: rms(filtG),
  };

  const energy = {
    A: energy(filtA),
    B: energy(filtB),
    G: energy(filtG),
  };

  const totalEnergy = energy.A + energy.B + energy.G;
  const axisDominant = dominantAxis(energy);

  const fftA = computeSpectrum(filtA, fs);
  const fftB = computeSpectrum(filtB, fs);
  const fftG = computeSpectrum(filtG, fs);

  const combined = combineSpectra([fftA, fftB, fftG]);
  const dom = findDominantFrequency(combined.freqs, combined.amps, 2, 20);

  const magnitude = filtA.map((_, i) => Math.sqrt(filtA[i] ** 2 + filtB[i] ** 2 + filtG[i] ** 2));
  const variability = stdDev(magnitude);

  return {
    sampleRateHz: fs,
    rms,
    energy,
    energiaTotal: totalEnergy,
    ejeDominante: axisDominant,
    frecuenciaDominante: dom.frequency,
    amplitudDominante: dom.amplitude,
    variabilidadTemporal: variability,
    filtered: {
      t: time,
      A: filtA,
      B: filtB,
      G: filtG,
    },
    fft: {
      freqs: combined.freqs,
      amps: combined.amps,
      byAxis: {
        A: fftA,
        B: fftB,
        G: fftG,
      },
    },
  };
}

function getLastWindow(samples, seconds) {
  if (!samples.length) {
    return [];
  }

  const end = samples[samples.length - 1].t;
  const start = Math.max(0, end - seconds);
  return samples.filter((s) => s.t >= start);
}

function estimateSamplingRate(timeArray) {
  if (timeArray.length < 2) {
    return 60;
  }

  const diffs = [];
  for (let i = 1; i < timeArray.length; i += 1) {
    diffs.push(timeArray[i] - timeArray[i - 1]);
  }

  const avg = diffs.reduce((acc, d) => acc + d, 0) / diffs.length;
  return avg > 0 ? 1 / avg : 60;
}

function bandPassApprox(signal, fs, hpCutoff, lpCutoff) {
  const hp = highPass(signal, fs, hpCutoff);
  return lowPass(hp, fs, lpCutoff);
}

function highPass(signal, fs, cutoff) {
  if (!signal.length) {
    return [];
  }

  const dt = 1 / Math.max(fs, 1);
  const rc = 1 / (2 * Math.PI * cutoff);
  const alpha = rc / (rc + dt);

  const out = [0];
  for (let i = 1; i < signal.length; i += 1) {
    out[i] = alpha * (out[i - 1] + signal[i] - signal[i - 1]);
  }
  return out;
}

function lowPass(signal, fs, cutoff) {
  if (!signal.length) {
    return [];
  }

  const dt = 1 / Math.max(fs, 1);
  const rc = 1 / (2 * Math.PI * cutoff);
  const alpha = dt / (rc + dt);

  const out = [signal[0]];
  for (let i = 1; i < signal.length; i += 1) {
    out[i] = out[i - 1] + alpha * (signal[i] - out[i - 1]);
  }
  return out;
}

function rms(values) {
  if (!values.length) {
    return 0;
  }

  const power = values.reduce((acc, v) => acc + v * v, 0) / values.length;
  return Math.sqrt(power);
}

function energy(values) {
  return values.reduce((acc, v) => acc + v * v, 0);
}

function dominantAxis(energyByAxis) {
  const entries = Object.entries(energyByAxis);
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0] ? entries[0][0] : "-";
}

function stdDev(values) {
  if (!values.length) {
    return 0;
  }

  const mean = values.reduce((acc, v) => acc + v, 0) / values.length;
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function computeSpectrum(signal, fs) {
  if (signal.length < 4) {
    return { freqs: [], amps: [] };
  }

  const n = nearestPowerOfTwo(signal.length);
  const padded = signal.slice(signal.length - n);
  const re = padded.slice();
  const im = new Array(n).fill(0);

  fftCooleyTukey(re, im);

  const half = Math.floor(n / 2);
  const freqs = [];
  const amps = [];

  for (let i = 1; i < half; i += 1) {
    const mag = Math.sqrt(re[i] * re[i] + im[i] * im[i]) / n;
    freqs.push((i * fs) / n);
    amps.push(mag);
  }

  return { freqs, amps };
}

function combineSpectra(spectra) {
  if (!spectra.length || !spectra[0].freqs.length) {
    return { freqs: [], amps: [] };
  }

  const len = spectra[0].amps.length;
  const amps = new Array(len).fill(0);

  for (const spec of spectra) {
    for (let i = 0; i < len; i += 1) {
      amps[i] += spec.amps[i] || 0;
    }
  }

  return {
    freqs: spectra[0].freqs,
    amps,
  };
}

function findDominantFrequency(freqs, amps, minHz, maxHz) {
  let bestFreq = 0;
  let bestAmp = 0;

  for (let i = 0; i < freqs.length; i += 1) {
    const f = freqs[i];
    const a = amps[i];
    if (f >= minHz && f <= maxHz && a > bestAmp) {
      bestAmp = a;
      bestFreq = f;
    }
  }

  return {
    frequency: bestFreq,
    amplitude: bestAmp,
  };
}

function fftCooleyTukey(re, im) {
  const n = re.length;
  const bits = Math.log2(n);

  for (let i = 0; i < n; i += 1) {
    const j = reverseBits(i, bits);
    if (j > i) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }

  for (let size = 2; size <= n; size *= 2) {
    const half = size / 2;
    const step = (2 * Math.PI) / size;

    for (let i = 0; i < n; i += size) {
      for (let j = 0; j < half; j += 1) {
        const k = i + j;
        const l = k + half;

        const angle = -j * step;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        const tre = re[l] * cos - im[l] * sin;
        const tim = re[l] * sin + im[l] * cos;

        re[l] = re[k] - tre;
        im[l] = im[k] - tim;
        re[k] += tre;
        im[k] += tim;
      }
    }
  }
}

function reverseBits(value, bits) {
  let reversed = 0;
  for (let i = 0; i < bits; i += 1) {
    reversed = (reversed << 1) | (value & 1);
    value >>= 1;
  }
  return reversed;
}

function nearestPowerOfTwo(n) {
  return 2 ** Math.floor(Math.log2(Math.max(4, n)));
}

function setupCharts() {
  charts.raw = new Chart(document.getElementById("rawChart"), {
    type: "line",
    data: {
      labels: [],
      datasets: [
        { label: "beta", data: [], borderColor: "#ff7a00", pointRadius: 0, borderWidth: 1.4 },
        { label: "rotB", data: [], borderColor: "#0090ff", pointRadius: 0, borderWidth: 1.2 },
        { label: "accY", data: [], borderColor: "#19a974", pointRadius: 0, borderWidth: 1.2 },
      ],
    },
    options: chartOptions("Tiempo (s)", "Valor"),
  });

  charts.filtered = new Chart(document.getElementById("filteredChart"), {
    type: "line",
    data: {
      labels: [],
      datasets: [
        { label: "A filtrada", data: [], borderColor: "#fd5e53", pointRadius: 0 },
        { label: "B filtrada", data: [], borderColor: "#0057b8", pointRadius: 0 },
        { label: "G filtrada", data: [], borderColor: "#2ca58d", pointRadius: 0 },
      ],
    },
    options: chartOptions("Tiempo (s)", "deg/s"),
  });

  charts.fft = new Chart(document.getElementById("fftChart"), {
    type: "line",
    data: {
      labels: [],
      datasets: [
        { label: "FFT total", data: [], borderColor: "#3023ae", pointRadius: 0, borderWidth: 1.5 },
        { label: "Frecuencia dominante", data: [], borderColor: "#c72c41", pointRadius: 0, borderWidth: 1.5, stepped: true },
      ],
    },
    options: chartOptions("Frecuencia (Hz)", "Amplitud"),
  });

  charts.compare = new Chart(document.getElementById("compareChart"), {
    type: "line",
    data: {
      labels: [],
      datasets: [
        { label: "Sesion actual", data: [], borderColor: "#111111", pointRadius: 0, borderWidth: 1.4 },
        { label: "Sesion previa", data: [], borderColor: "#9e2a2b", pointRadius: 0, borderWidth: 1.3 },
      ],
    },
    options: chartOptions("Frecuencia (Hz)", "Amplitud"),
  });
}

function chartOptions(xLabel, yLabel) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    scales: {
      x: { title: { display: true, text: xLabel } },
      y: { title: { display: true, text: yLabel } },
    },
    plugins: {
      legend: { display: true, position: "bottom" },
    },
  };
}

function renderRealtimeCharts() {
  const recent = state.samples.slice(-MAX_POINTS_CHART);
  const labels = recent.map((s) => s.t.toFixed(2));

  charts.raw.data.labels = labels;
  charts.raw.data.datasets[0].data = recent.map((s) => s.beta);
  charts.raw.data.datasets[1].data = recent.map((s) => s.rotB);
  charts.raw.data.datasets[2].data = recent.map((s) => s.accY);
  charts.raw.update("none");
}

function renderAnalysisCharts(analysis) {
  const t = analysis.filtered.t.map((v) => v.toFixed(2));
  charts.filtered.data.labels = t;
  charts.filtered.data.datasets[0].data = analysis.filtered.A;
  charts.filtered.data.datasets[1].data = analysis.filtered.B;
  charts.filtered.data.datasets[2].data = analysis.filtered.G;
  charts.filtered.update();

  const fftLabels = analysis.fft.freqs.map((f) => f.toFixed(2));
  charts.fft.data.labels = fftLabels;
  charts.fft.data.datasets[0].data = analysis.fft.amps;
  charts.fft.data.datasets[1].data = analysis.fft.amps.map((a, i) => {
    const f = analysis.fft.freqs[i];
    return Math.abs(f - analysis.frecuenciaDominante) < 0.12 ? a : null;
  });
  charts.fft.update();

  renderComparisonChart(analysis);
}

function renderComparisonChart(currentAnalysis) {
  const previous = getPreviousSession();

  charts.compare.data.labels = currentAnalysis.fft.freqs.map((f) => f.toFixed(2));
  charts.compare.data.datasets[0].data = currentAnalysis.fft.amps;

  if (previous && previous.analisis?.fft?.amps?.length) {
    charts.compare.data.datasets[1].data = previous.analisis.fft.amps;
    charts.compare.data.datasets[1].label = "Sesion previa";
  } else {
    charts.compare.data.datasets[1].data = [];
    charts.compare.data.datasets[1].label = "Sesion previa (sin datos)";
  }

  charts.compare.update();
}

function updateMetricFields(analysis) {
  ui.metricFreq.textContent = `${analysis.frecuenciaDominante.toFixed(2)} Hz`;
  ui.metricRms.textContent = `A: ${analysis.rms.A.toFixed(3)} | B: ${analysis.rms.B.toFixed(3)} | G: ${analysis.rms.G.toFixed(3)}`;
  ui.metricAxis.textContent = analysis.ejeDominante;
  ui.metricEnergy.textContent = analysis.energiaTotal.toFixed(2);
  ui.metricVar.textContent = analysis.variabilidadTemporal.toFixed(3);
}

function clearMetricFields() {
  ui.metricFreq.textContent = "- Hz";
  ui.metricRms.textContent = "A: - | B: - | G: -";
  ui.metricAxis.textContent = "-";
  ui.metricEnergy.textContent = "-";
  ui.metricVar.textContent = "-";
  ui.metricDuration.textContent = "0.0 s";
}

function emptyAnalysis() {
  return {
    sampleRateHz: 0,
    rms: { A: 0, B: 0, G: 0 },
    energy: { A: 0, B: 0, G: 0 },
    energiaTotal: 0,
    ejeDominante: "-",
    frecuenciaDominante: 0,
    amplitudDominante: 0,
    variabilidadTemporal: 0,
    filtered: { t: [], A: [], B: [], G: [] },
    fft: { freqs: [], amps: [], byAxis: { A: { freqs: [], amps: [] }, B: { freqs: [], amps: [] }, G: { freqs: [], amps: [] } } },
  };
}

function exportCsv() {
  const session = getCurrentSession();
  if (!session) {
    updateStatus("No hay sesion para exportar.");
    return;
  }

  const header = ["t", "alpha", "beta", "gamma", "accX", "accY", "accZ", "rotA", "rotB", "rotG"];
  const lines = [header.join(",")];

  for (const s of session.muestras) {
    lines.push([s.t, s.alpha, s.beta, s.gamma, s.accX, s.accY, s.accZ, s.rotA, s.rotB, s.rotG].join(","));
  }

  downloadText(`sesion_${session.id}.csv`, lines.join("\n"), "text/csv;charset=utf-8;");
}

function exportJson() {
  const session = getCurrentSession();
  if (!session) {
    updateStatus("No hay sesion para exportar.");
    return;
  }

  downloadText(
    `sesion_${session.id}.json`,
    JSON.stringify(session, null, 2),
    "application/json;charset=utf-8;"
  );
}

async function exportPdf() {
  const session = getCurrentSession();
  if (!session) {
    updateStatus("No hay sesion para exportar.");
    return;
  }

  if (!window.jspdf || !window.jspdf.jsPDF) {
    updateStatus("No se pudo cargar jsPDF para generar PDF.");
    return;
  }

  const doc = new window.jspdf.jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 46;

  doc.setFontSize(17);
  doc.text("Informe de sesion de temblor", 36, y);
  y += 26;

  doc.setFontSize(10);
  doc.text(`Fecha inicio: ${new Date(session.timestampInicio).toLocaleString()}`, 36, y);
  y += 14;
  doc.text(`Fecha fin: ${new Date(session.timestampFin).toLocaleString()}`, 36, y);
  y += 14;
  doc.text(`Duracion: ${session.durationSec.toFixed(1)} s`, 36, y);
  y += 24;

  doc.setFontSize(12);
  doc.text("Resumen ejecutivo", 36, y);
  y += 16;
  doc.setFontSize(10);
  doc.text(`Frecuencia dominante: ${session.analisis.frecuenciaDominante.toFixed(2)} Hz`, 36, y);
  y += 13;
  doc.text(
    `RMS (A/B/G): ${session.analisis.rms.A.toFixed(3)} / ${session.analisis.rms.B.toFixed(3)} / ${session.analisis.rms.G.toFixed(3)}`,
    36,
    y
  );
  y += 13;
  doc.text(`Eje dominante: ${session.analisis.ejeDominante}`, 36, y);
  y += 13;
  doc.text(`Energia total: ${session.analisis.energiaTotal.toFixed(2)}`, 36, y);
  y += 22;

  doc.setFontSize(12);
  doc.text("Interpretacion automatica", 36, y);
  y += 15;
  doc.setFontSize(10);
  for (const line of buildInterpretation(session)) {
    doc.text(line, 36, y);
    y += 13;
  }

  y += 10;
  const chartWidth = pageWidth - 72;
  const chartHeight = 140;

  const rawCanvas = document.getElementById("rawChart");
  const filteredCanvas = document.getElementById("filteredChart");
  const fftCanvas = document.getElementById("fftChart");

  const chartsToPrint = [
    { title: "Senal cruda", canvas: rawCanvas },
    { title: "Senal filtrada", canvas: filteredCanvas },
    { title: "Espectro FFT", canvas: fftCanvas },
  ];

  for (const item of chartsToPrint) {
    if (y + chartHeight + 24 > 790) {
      doc.addPage();
      y = 36;
    }
    doc.setFontSize(11);
    doc.text(item.title, 36, y);
    y += 10;
    const dataUrl = item.canvas.toDataURL("image/png", 1.0);
    doc.addImage(dataUrl, "PNG", 36, y, chartWidth, chartHeight);
    y += chartHeight + 18;
  }

  doc.save(`informe_sesion_${session.id}.pdf`);
}

function buildInterpretation(session) {
  const lines = [];
  const prev = getPreviousSession();

  if (session.analisis.frecuenciaDominante >= 4 && session.analisis.frecuenciaDominante <= 12) {
    lines.push("La frecuencia dominante cae en el rango fisiologico de 4 a 12 Hz.");
  } else {
    lines.push("La frecuencia dominante queda fuera del rango fisiologico 4 a 12 Hz.");
  }

  lines.push(`El eje con mayor energia es ${session.analisis.ejeDominante}.`);

  if (prev && prev.analisis) {
    const deltaFreq = session.analisis.frecuenciaDominante - prev.analisis.frecuenciaDominante;
    const deltaEnergy = session.analisis.energiaTotal - prev.analisis.energiaTotal;

    lines.push(
      `Comparado con la sesion anterior: frecuencia ${trend(deltaFreq)} (${deltaFreq.toFixed(2)} Hz), energia ${trend(deltaEnergy)} (${deltaEnergy.toFixed(2)}).`
    );
  } else {
    lines.push("No hay sesion previa para comparacion longitudinal.");
  }

  return lines;
}

function trend(delta) {
  if (Math.abs(delta) < 0.05) {
    return "estable";
  }
  return delta > 0 ? "en aumento" : "en disminucion";
}

function downloadText(fileName, text, mimeType) {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function renderHistory() {
  if (!state.sessions.length) {
    ui.history.innerHTML = "<p class='empty-history'>Sin sesiones guardadas.</p>";
    return;
  }

  const latest = [...state.sessions].reverse().slice(0, 8);
  const rows = latest
    .map((s, index) => {
      const previous = latest[index + 1];
      const freqTrend = previous
        ? trendSymbol(s.analisis.frecuenciaDominante - previous.analisis.frecuenciaDominante)
        : "=";
      const energyTrend = previous ? trendSymbol(s.analisis.energiaTotal - previous.analisis.energiaTotal) : "=";

      return `
        <tr>
          <td>${new Date(s.timestampInicio).toLocaleDateString()}</td>
          <td>${s.durationSec.toFixed(1)} s</td>
          <td>${s.analisis.frecuenciaDominante.toFixed(2)} Hz ${freqTrend}</td>
          <td>${s.analisis.energiaTotal.toFixed(2)} ${energyTrend}</td>
          <td>${s.analisis.ejeDominante}</td>
        </tr>
      `;
    })
    .join("");

  ui.history.innerHTML = `
    <table class="history-table">
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Duracion</th>
          <th>Frecuencia</th>
          <th>Energia</th>
          <th>Eje dominante</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function trendSymbol(delta) {
  if (Math.abs(delta) < 0.05) {
    return "=";
  }
  return delta > 0 ? "↑" : "↓";
}

function getCurrentSession() {
  return state.sessions[state.sessions.length - 1] || null;
}

function getPreviousSession() {
  return state.sessions.length > 1 ? state.sessions[state.sessions.length - 2] : null;
}

function loadSessions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    state.sessions = raw ? JSON.parse(raw) : [];
  } catch (error) {
    console.error(error);
    state.sessions = [];
  }
}

function saveSessions() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.sessions));
}

function updateStatus(text) {
  ui.status.textContent = text;
}

function safeNumber(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return value;
}

init();
