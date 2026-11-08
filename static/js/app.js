/**
 * Controlador Principal de la Aplicación y Simulación en Vivo (SimPy + 3D + UI)
 */

// Función global para botones de incremento/decremento numérico directo
window.adjustNumberInput = function(id, delta) {
  const input = document.getElementById(id);
  if (!input) return;
  let val = parseFloat(input.value) || 0;
  val += delta;
  const min = input.min !== "" ? parseFloat(input.min) : -Infinity;
  const max = input.max !== "" ? parseFloat(input.max) : Infinity;
  val = Math.max(min, Math.min(max, val));
  val = Math.round(val * 10) / 10;
  input.value = val;
  input.dispatchEvent(new Event("input", { bubbles: true }));
};

class IPSSimulatorApp {
  constructor() {
    this.scene = new IPSScene("canvas-container");
    this.simData = null;
    this.events = [];
    this.currentEventIndex = 0;
    this.isPlaying = false;
    this.playbackSpeed = 1.0;
    this.audioEnabled = true;
    this.timerId = null;
    this.clockTimerId = null;
    this.configurationLocked = false;

    // Estado en tiempo de reproducción
    this.patientChairsMap = new Map(); // patient_id -> chairIndex
    this.entranceQueue = [];
    this.entranceSequence = 0;
    this.patientEntering = new Set();
    this.deferredPatientMoves = new Map();
    this.tokenArrivalQueue = [];
    this.tokenLineEntering = false;
    this.tokenLinePendingIds = new Set();
    this.patientEnteredAt = new Map();
    this.pendingPatientCalls = new Map();
    this.pendingServiceEnds = new Map();
    this.patientsAtDesk = new Set();
    this.receptionCallQueue = [];
    this.activeReceptionCall = null;
    this.receptionReady = false;
    this.receptionEntryPending = new Set();
    this.receptionEnteredIds = new Set();
    this.receptionSeatedIds = new Set();

    this.initAudio();
    this.bindDOM();
    this.initCharts();

    // Ejecutar simulación inicial por defecto
    this.fetchAndRunSimulation();
  }

  initAudio() {
    // Sintetizador Web Audio API para timbre de hospital "Ding-Dong" sin archivos externos
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioContext();
    } catch (e) {
      console.warn("AudioContext no soportado en este navegador.", e);
      this.audioCtx = null;
    }
  }

  playChime(isPriority = false) {
    if (!this.audioEnabled || !this.audioCtx) return;
    if (this.audioCtx.state === "suspended") {
      this.audioCtx.resume();
    }

    const now = this.audioCtx.currentTime;
    const osc1 = this.audioCtx.createOscillator();
    const osc2 = this.audioCtx.createOscillator();
    const gainNode = this.audioCtx.createGain();

    gainNode.connect(this.audioCtx.destination);
    gainNode.gain.setValueAtTime(0.15, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

    osc1.type = "sine";
    osc2.type = "sine";

    // Nota 1 (campana alta)
    osc1.frequency.setValueAtTime(isPriority ? 784 : 659.25, now); // G5 o E5
    // Nota 2 (campana resolución)
    osc2.frequency.setValueAtTime(isPriority ? 1046.5 : 523.25, now + 0.35); // C6 o C5

    osc1.connect(gainNode);
    osc2.connect(gainNode);

    osc1.start(now);
    osc1.stop(now + 0.35);

    osc2.start(now + 0.35);
    osc2.stop(now + 1.2);
  }

  // ─── Leer suma de los campos de prioridad manual ───────────────────────────
  _getPrioSum() {
    const ids = ["prio_pct_regular", "prio_pct_elderly", "prio_pct_disability", "prio_pct_pregnant", "prio_pct_vulnerable"];
    return ids.reduce((acc, id) => {
      const el = document.getElementById(id);
      return acc + (el ? (parseFloat(el.value) || 0) : 0);
    }, 0);
  }

  _updatePrioBadge() {
    const badge = document.getElementById("priority-sum-badge");
    if (!badge) return;
    const total = Math.round(this._getPrioSum());
    badge.textContent = `Total: ${total}%`;
    badge.className = (total === 100) ? "badge-sum-ok" : "badge-sum-err";
  }

  _balanceTo100() {
    const ids = ["prio_pct_regular", "prio_pct_elderly", "prio_pct_disability", "prio_pct_pregnant", "prio_pct_vulnerable"];
    const values = ids.map(id => Math.max(0, parseFloat(document.getElementById(id).value) || 0));
    const sum = values.reduce((a, b) => a + b, 0);

    if (sum === 0) {
      // Distribución por defecto si todos son 0
      const defaults = [70, 12, 8, 6, 4];
      ids.forEach((id, i) => { document.getElementById(id).value = defaults[i]; });
    } else {
      // Normalizar al 100%
      const scale = 100 / sum;
      let normalized = values.map(v => Math.round(v * scale * 10) / 10);
      // Ajustar redondeo en el primero para garantizar exactamente 100
      const diff = 100 - normalized.reduce((a, b) => a + b, 0);
      normalized[0] = Math.round((normalized[0] + diff) * 10) / 10;
      ids.forEach((id, i) => { document.getElementById(id).value = normalized[i]; });
    }
    this._updatePrioBadge();
  }

  bindDOM() {
    // Formulario de parámetros y control de ejecución
    document.getElementById("btn-run-sim").addEventListener("click", () => this.fetchAndRunSimulation());
    document.getElementById("btn-random-seed").addEventListener("click", () => {
      const seed = new Uint32Array(1);
      if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(seed);
      else seed[0] = Math.floor(Math.random() * 0x7fffffff);
      document.getElementById("random_seed").value = String(seed[0] & 0x7fffffff);
    });
    document.getElementById("btn-play-pause").addEventListener("click", () => this.togglePlayPause());
    document.getElementById("btn-reset").addEventListener("click", () => this.resetSimulation());
    document.getElementById("btn-step").addEventListener("click", () => this.stepForward());
    document.getElementById("btn-skip-end").addEventListener("click", () => this.skipToEnd());

    // Panel laterales: Abrir / Cerrar con botones de borde y de cabecera
    const configPanel = document.getElementById("config-panel");
    const statsPanel = document.getElementById("stats-panel");
    const toggleConfigBtn = document.getElementById("btn-toggle-config-panel");
    const toggleStatsBtn = document.getElementById("btn-toggle-stats-panel");

    // Cerrar panel izquierdo
    document.getElementById("btn-close-config").addEventListener("click", () => {
      configPanel.classList.add("collapsed");
      if (toggleConfigBtn) toggleConfigBtn.style.display = "flex";
    });
    // Reabrir panel izquierdo
    if (toggleConfigBtn) {
      toggleConfigBtn.addEventListener("click", () => {
        configPanel.classList.remove("collapsed");
        toggleConfigBtn.style.display = "none";
      });
    }

    // Cerrar panel derecho
    document.getElementById("btn-close-stats").addEventListener("click", () => {
      statsPanel.classList.add("collapsed");
      if (toggleStatsBtn) toggleStatsBtn.style.display = "flex";
    });
    // Reabrir panel derecho
    if (toggleStatsBtn) {
      toggleStatsBtn.addEventListener("click", () => {
        statsPanel.classList.remove("collapsed");
        toggleStatsBtn.style.display = "none";
      });
    }

    // Modos de interacción del Mouse: Rotar vs Desplazar (Pan)
    const btnRotate = document.getElementById("btn-mode-rotate");
    const btnPan = document.getElementById("btn-mode-pan");
    if (btnRotate && btnPan) {
      btnRotate.addEventListener("click", () => {
        btnRotate.classList.add("active");
        btnPan.classList.remove("active");
        this.scene.setMouseInteractionMode("rotate");
      });
      btnPan.addEventListener("click", () => {
        btnPan.classList.add("active");
        btnRotate.classList.remove("active");
        this.scene.setMouseInteractionMode("pan");
      });
    }

    // Botones directos para mover la cámara (arriba, abajo, izquierda, derecha)
    document.getElementById("btn-pan-left").addEventListener("click", () => this.scene.panCamera(-3.5, 0));
    document.getElementById("btn-pan-right").addEventListener("click", () => this.scene.panCamera(3.5, 0));
    document.getElementById("btn-pan-up").addEventListener("click", () => this.scene.panCamera(0, 3.5));
    document.getElementById("btn-pan-down").addEventListener("click", () => this.scene.panCamera(0, -3.5));

    // ─── Checkbox de Prioridad Manual ─────────────────────────────────────────
    const chkManual = document.getElementById("chk-manual-priority");
    const autoBox = document.getElementById("priority-auto-box");
    const manualContainer = document.getElementById("priority-manual-container");

    if (chkManual) {
      chkManual.addEventListener("change", () => {
        const isManual = chkManual.checked;
        if (autoBox) autoBox.style.display = isManual ? "none" : "block";
        if (manualContainer) manualContainer.style.display = isManual ? "block" : "none";
        this._updatePrioBadge();
      });
    }

    // Validación de suma de porcentajes en tiempo real
    const prioIds = ["prio_pct_regular", "prio_pct_elderly", "prio_pct_disability", "prio_pct_pregnant", "prio_pct_vulnerable"];
    prioIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("input", () => this._updatePrioBadge());
    });

    // Botón equilibrar al 100%
    const btnBalance = document.getElementById("btn-balance-100");
    if (btnBalance) {
      btnBalance.addEventListener("click", () => this._balanceTo100());
    }

    // ─── Escenarios predefinidos (usan los nuevos IDs de campo) ───────────────
    document.querySelectorAll(".btn-scenario").forEach(btn => {
      btn.addEventListener("click", () => {
        const sc = btn.dataset.scenario;
        if (sc === "base") {
          document.getElementById("param_s").value = 3;
          document.getElementById("param_k").value = 30;
          document.getElementById("param_lambda").value = 30;
          document.getElementById("param_mu").value = 7.0;
        } else if (sc === "optimized") {
          document.getElementById("param_s").value = 5;
          document.getElementById("param_k").value = 45;
          document.getElementById("param_lambda").value = 40;
          document.getElementById("param_mu").value = 5.0;
        } else if (sc === "contingency") {
          document.getElementById("param_s").value = 2;
          document.getElementById("param_k").value = 20;
          document.getElementById("param_lambda").value = 20;
          document.getElementById("param_mu").value = 8.5;
        }
        this.fetchAndRunSimulation();
      });
    });

    // Velocidades de reproducción
    document.querySelectorAll(".btn-speed").forEach(btn => {
      btn.addEventListener("click", (e) => {
        document.querySelectorAll(".btn-speed").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        this.playbackSpeed = parseFloat(btn.dataset.speed);
      });
    });

    // Audio Mute toggle
    const audioBtn = document.getElementById("btn-toggle-audio");
    if (audioBtn) {
      audioBtn.addEventListener("click", () => {
        this.audioEnabled = !this.audioEnabled;
        audioBtn.textContent = this.audioEnabled ? "🔔 Sonido: ON" : "🔕 Sonido: OFF";
      });
    }

    // Cámaras preestablecidas
    document.querySelectorAll(".cam-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".cam-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        this.scene.setCameraPreset(btn.dataset.cam);
      });
    });

    // Pestañas del Modal
    document.querySelectorAll(".dock-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        this.openModalTab(btn.dataset.tab);
      });
    });

    document.getElementById("modal-close-btn").addEventListener("click", () => {
      document.getElementById("analytics-modal").classList.remove("open");
    });

    document.querySelectorAll(".tab-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
        document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
        btn.classList.add("active");
        const tabEl = document.getElementById(`tab-${btn.dataset.tab}`);
        if (tabEl) tabEl.classList.add("active");
      });
    });

    // Búsqueda en tabla de pacientes
    const searchInput = document.getElementById("patient-search");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => this.filterPatientsTable(e.target.value));
    }

    document.getElementById("btn-download-report").addEventListener("click", () => this.exportSimulationReport(false));
    document.getElementById("btn-print-report").addEventListener("click", () => this.exportSimulationReport(true));

    // Inicializar badge
    this._updatePrioBadge();
  }

  openModalTab(tabName) {
    const modal = document.getElementById("analytics-modal");
    modal.classList.add("open");

    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));

    const targetBtn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
    const targetContent = document.getElementById(`tab-${tabName}`);

    if (targetBtn) targetBtn.classList.add("active");
    if (targetContent) targetContent.classList.add("active");
  }

  async fetchAndRunSimulation() {
    if (this.configurationLocked) return;
    this.pause();
    this.updateClock("05:00 AM", "FASE 1: FILA PARA FICHOS");

    // ── Leer parámetros con los nuevos IDs ──────────────────────────────────
    const lambda  = parseFloat(document.getElementById("param_lambda").value)         || 30;
    const mu      = parseFloat(document.getElementById("param_mu").value)              || 7.0;
    const s       = parseInt(document.getElementById("param_s").value)                || 3;
    const k       = parseInt(document.getElementById("param_k").value)                || 30;
    const seedRaw = document.getElementById("random_seed").value.trim();

    // ── Configuración de distribución de prioridades ─────────────────────────
    const isManual = document.getElementById("chk-manual-priority").checked;
    let customDist = null;
    if (isManual) {
      customDist = {
        REGULAR:      parseFloat(document.getElementById("prio_pct_regular").value)    || 0,
        ADULTO_MAYOR: parseFloat(document.getElementById("prio_pct_elderly").value)    || 0,
        DISCAPACIDAD: parseFloat(document.getElementById("prio_pct_disability").value) || 0,
        EMBARAZADA:   parseFloat(document.getElementById("prio_pct_pregnant").value)   || 0,
        VULNERABLE:   parseFloat(document.getElementById("prio_pct_vulnerable").value) || 0
      };
      const sum = Object.values(customDist).reduce((total, value) => total + value, 0);
      if (Object.values(customDist).some(value => value < 0 || value > 100) || Math.abs(sum - 100) > 0.01) {
        this._updatePrioBadge();
        alert("La distribución manual debe sumar 100% y cada categoría debe estar entre 0% y 100%.");
        return;
      }
    }

    const payload = {
      lambda_arrival_rate:      lambda,
      mu_service_time:          mu,
      num_servers:              s,
      base_tokens:              k,
      custom_priority_enabled:  isManual,
      custom_distribution:      customDist,
      random_seed:              (seedRaw !== "" ? parseInt(seedRaw) : null)
    };

    try {
      const response = await fetch("/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await response.json();

      if (result.status === "success") {
        this.simData = result.data;
        this.events = this.simData.events || [];
        this.currentEventIndex = 0;
        this.receptionEntryPending = new Set(this.events
          .filter(event => event.type === "PATIENT_ENTER_RECEPTION" && event.patient)
          .map(event => event.patient.id));
        this.receptionEnteredIds = new Set();
        this.receptionSeatedIds = new Set();
        this.receptionEntriesTotal = this.receptionEntryPending.size;
        this.receptionEntriesSeated = 0;
        this.receptionReady = this.receptionEntriesTotal === 0;
        this.receptionCallQueue = [];
        this.activeReceptionCall = null;
        this.entranceQueue = [];
        this.entranceSequence = 0;
        this.entranceInProgress = false;
        this.patientEntering.clear();
        this.patientEnteredAt.clear();
        this.tokenArrivalQueue = [];
        this.tokenLineEntering = false;
        this.tokenLinePendingIds.clear();
        this.deferredPatientMoves.clear();
        this.pendingPatientCalls.clear();
        this.pendingServiceEnds.clear();
        this.patientsAtDesk.clear();

        // Reconstruir ventanillas 3D y sillas según parámetros reales devueltos
        const cfgK = this.simData.config.base_tokens;
        const cfgS = this.simData.config.num_servers;

        this.scene.resetClinicLayout();
        this.scene.buildDesks(cfgS);
        const extraTickets = this.simData.summary.tokens_extra_distributed;
        this.scene.buildWaitingAreaChairs(Math.max(cfgK + extraTickets, this.receptionEntriesTotal), extraTickets);
        this.scene.resetScene();
        this.patientChairsMap.clear();

        // Actualizar UI, KPIs y Gráficas
        this.updateKPIs(this.simData);
        this.renderCharts(this.simData);
        this.renderTheoryTab(this.simData.theory_mms);
        this.renderAnalysis(this.simData);
        this.renderPatientsTable(this.simData.patients);

        // Actualizar HUD dinámico de fichos según K
        const hudTokens = document.getElementById("hud-tokens-given");
        if (hudTokens) hudTokens.textContent = `0 / ${cfgK}`;

        // Limpiar registro de eventos en vivo
        const logList = document.getElementById("live-event-stream");
        if (logList) logList.innerHTML = "";

        // Iniciar reproducción
        this.setConfigurationLocked(true);
        this.play();
      } else {
        alert("Error en la simulación: " + result.message);
      }
    } catch (err) {
      console.error("Error al conectar con la API de simulación:", err);
    }
  }

  togglePlayPause() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  play() {
    if (this.currentEventIndex >= this.events.length) {
      this.resetSimulation();
    }
    this.isPlaying = true;
    const btn = document.getElementById("btn-play-pause");
    if (btn) btn.innerHTML = "⏸ Pausar";
    this.scheduleNextEvent();
  }

  pause() {
    this.isPlaying = false;
    clearTimeout(this.timerId);
    clearInterval(this.clockTimerId);
    this.clockTimerId = null;
    const btn = document.getElementById("btn-play-pause");
    if (btn) btn.innerHTML = "▶ Continuar";
  }

  resetSimulation() {
    this.pause();
    this.setConfigurationLocked(false);
    this.currentEventIndex = 0;
    this.scene.resetScene();
    this.patientChairsMap.clear();
    this.receptionEntryPending = new Set(this.events
      .filter(event => event.type === "PATIENT_ENTER_RECEPTION" && event.patient)
      .map(event => event.patient.id));
    this.receptionEnteredIds.clear();
    this.receptionSeatedIds.clear();
    this.receptionEntriesTotal = this.receptionEntryPending.size;
    this.receptionEntriesSeated = 0;
    this.receptionReady = this.receptionEntriesTotal === 0;
    this.receptionCallQueue = [];
    this.activeReceptionCall = null;
    this.patientEnteredAt.clear();
    this.pendingPatientCalls.clear();
    this.pendingServiceEnds.clear();
    this.patientsAtDesk.clear();
    this.deferredPatientMoves.clear();
    this.entranceQueue = [];
    this.entranceSequence = 0;
    this.entranceInProgress = false;
    this.patientEntering.clear();
    this.deferredPatientMoves.clear();
    this.tokenArrivalQueue = [];
    this.tokenLinePendingIds.clear();
    this.tokenLineEntering = false;
    this.updateClock("05:00 AM", "FASE 1: FILA PARA FICHOS");

    const logList = document.getElementById("live-event-stream");
    if (logList) logList.innerHTML = "";

    const btn = document.getElementById("btn-play-pause");
    if (btn) btn.innerHTML = "▶ Iniciar";
  }

  stepForward() {
    this.pause();
    if (this.currentEventIndex < this.events.length) {
      this.processEvent(this.events[this.currentEventIndex]);
      this.currentEventIndex++;
    }
  }

  skipToEnd() {
    this.pause();
    while (this.currentEventIndex < this.events.length) {
      this.processEvent(this.events[this.currentEventIndex], true);
      this.currentEventIndex++;
    }
    const finalClock = this.events[this.events.length - 1]?.clock || document.getElementById("live-clock")?.textContent || "05:00 AM";
    this.updateClock(finalClock, "SIMULACIÓN FINALIZADA");
    this.setConfigurationLocked(false);
  }

  scheduleNextEvent() {
    if (!this.isPlaying || this.currentEventIndex >= this.events.length) {
      this.pause();
      if (this.currentEventIndex >= this.events.length) this.setConfigurationLocked(false);
      return;
    }

    const currentEvt = this.events[this.currentEventIndex];
    if (currentEvt.type === "RECEPTION_SERVICE_START" && !this.receptionReady) this.finishReceptionAdmissions();
    this.processEvent(currentEvt);
    this.currentEventIndex++;

    if (this.currentEventIndex >= this.events.length) {
      this.pause();
      this.setConfigurationLocked(false);
      return;
    }

    // Calcular demora proporcional al delta de tiempo de simulación
    const nextEvt = this.events[this.currentEventIndex];
    const timeDeltaSim = Math.max(0.1, nextEvt.sim_time - currentEvt.sim_time);

    const playbackStart = performance.now();
    const playbackStartSim = currentEvt.sim_time;
    const playbackScale = 350 / this.playbackSpeed;
    const realDelay = Math.max(40, timeDeltaSim * playbackScale);
    clearInterval(this.clockTimerId);
    this.clockTimerId = setInterval(() => {
      if (!this.isPlaying) return;
      const elapsedSim = Math.min(timeDeltaSim, (performance.now() - playbackStart) / playbackScale);
      const displayedSim = playbackStartSim + elapsedSim;
      this.updateClock(this.formatSimulationClock(displayedSim), this.phaseForSimTime(displayedSim));
    }, 100);

    this.timerId = setTimeout(() => {
      clearInterval(this.clockTimerId);
      this.clockTimerId = null;
      this.scheduleNextEvent();
    }, realDelay);
  }

  setConfigurationLocked(locked) {
    this.configurationLocked = locked;
    const ids = [
      "param_mu", "param_lambda", "param_s", "param_k", "random_seed", "btn-random-seed",
      "chk-manual-priority", "prio_pct_regular", "prio_pct_elderly", "prio_pct_disability",
      "prio_pct_pregnant", "prio_pct_vulnerable", "btn-run-sim", "btn-balance-100"
    ];
    ids.forEach(id => {
      const control = document.getElementById(id);
      if (control) control.disabled = locked;
    });
    document.querySelectorAll(".btn-step-num, .btn-scenario").forEach(button => {
      button.disabled = locked;
    });
  }

  processEvent(evt, isFastForward = false) {
    if (evt._deferredReplay) delete evt._deferredReplay;
    else {
    // 1. Actualizar Reloj e Indicador de Fase
    const phaseLabel = evt.type === "SIM_COMPLETE" ? "SIMULACIÓN FINALIZADA" : this.phaseForSimTime(evt.sim_time);
    this.updateClock(evt.clock, phaseLabel);

    // 2. Actualizar HUD de estado en tiempo real
    if (evt.state) {
      this.updateLiveCounters(evt.state);
    }

    // Las llamadas se registran cuando la animación realmente despacha al paciente.
    if (evt.type !== "PATIENT_CALLED") this.appendEventLog(evt);
    }

    // 4. Lógica de animación 3D
    const patientData = evt.patient;

    switch (evt.type) {
      case "PATIENT_ARRIVAL": {
        const p3d = this.scene.getOrCreatePatient3D(patientData);
        const queuePos = (evt.extra_data && evt.extra_data.queue_position) || 1;
        const slot = this.scene.tokenQueueSlots[queuePos - 1] || new THREE.Vector3(0, 0, 15);
        this.enqueueTokenLineArrival(p3d, slot, patientData.id);
        break;
      }

      case "PRIORITY_OVERTAKE": {
        // Paciente prioritario PASA AL FRENTE DE LA FILA (Regla clave del usuario)
        const p3d = this.scene.getOrCreatePatient3D(patientData);
        const prioQueuePos = (evt.extra_data && evt.extra_data.queue_position) || 1;
        const slot = this.scene.tokenQueueSlots[prioQueuePos - 1] || new THREE.Vector3(0, 0, 12);
        this.enqueueTokenLineArrival(p3d, slot, patientData.id);
        break;
      }

      case "TOKEN_ASSIGNED": {
        // Recibe su ficho en el módulo exterior
        const p3d = this.scene.getOrCreatePatient3D(patientData);
        p3d.updateTagWithToken(patientData.token_number, false);
        break;
      }

      case "TOKEN_EXTRA_EXCEPTION": {
        // ¡EXCEPCIÓN IPS! Paciente con discapacidad/prioridad recibe Ficho Extra
        if (!isFastForward) this.playChime(true);
        const p3d = this.scene.getOrCreatePatient3D(patientData);
        p3d.updateTagWithToken(patientData.token_number, true);

        // Notificación en el turnero
        this.scene.updateTurneroScreen("¡FICHO EXTRA!", `#${patientData.token_number}`, `${patientData.name} (${patientData.category})`, true);
        break;
      }

      case "TOKEN_REJECTED": {
        // Fichos agotados → paciente rechazado camina fuera de la IPS
        const p3d = this.scene.getOrCreatePatient3D(patientData);
        this.scene.updateSpriteText(p3d.tagSprite, "❌ RECHAZADO", "#f87171", "#450a0a");

        // Animación de salida: se aleja por el carril de entrada hacia afuera
        const sideOffset = (patientData.id % 2 === 0) ? 6 : -6;
        p3d.walkPath([
          { x: sideOffset, y: 0, z: 20 },   // Intermedio: gira hacia afuera
          { x: sideOffset, y: 0, z: 55 }    // Sale completamente fuera de la escena
        ], () => {
          this.scene.removePatient3D(patientData.id);
          const chairIdx = this.patientChairsMap.get(patientData.id);
          if (chairIdx !== undefined && this.scene.waitingChairs[chairIdx]) {
            this.scene.waitingChairs[chairIdx].occupiedBy = null;
          }
          this.patientChairsMap.delete(patientData.id);
        });
        break;
      }

      case "RECEPTION_OPEN": {
        this.scene.updateTurneroScreen("INGRESO A SALA", "07:00 AM", "VENTANILLAS DESDE 08:00 AM");
        break;
      }

      case "RECEPTION_SERVICE_START": {
        this.scene.updateTurneroScreen("ATENCIÓN ABIERTA", "08:00 AM", "LLAMANDO POR ORDEN DE TURNO");
        break;
      }

      case "PATIENT_ENTER_RECEPTION": {
        if (this.receptionEnteredIds.has(patientData.id) || !this.receptionEntryPending.has(patientData.id)) break;
        this.receptionEnteredIds.add(patientData.id);
        const p3d = this.scene.getOrCreatePatient3D(patientData);
        const freeChairIdx = this.scene.waitingChairs.findIndex(c => c.occupiedBy === null);
        if (freeChairIdx !== -1) {
          this.scene.waitingChairs[freeChairIdx].occupiedBy = patientData.id;
          this.patientChairsMap.set(patientData.id, freeChairIdx);
          const chairPos = this.scene.waitingChairs[freeChairIdx].position;
          this.enqueuePatientEntrance(patientData.id, p3d, chairPos, freeChairIdx);
        }
        break;
      }

      case "PATIENT_CALLED": {
        // Turnero digital llama al paciente
        if (!isFastForward) this.playChime(patientData.is_priority);

        const deskId = evt.desk_id || 1;
        const deskObj = this.scene.desks3D[deskId - 1];
        if (deskObj) {
          const p3d = this.scene.getOrCreatePatient3D(patientData);
          this.pendingPatientCalls.set(patientData.id, { patient: p3d, desk: deskObj, event: evt });
          this.receptionCallQueue.push(patientData.id);
          this.startNextReceptionCall();
        }
        break;
      }

      case "SERVICE_END": {
        if (!this.patientsAtDesk.has(patientData.id)) {
          this.pendingServiceEnds.set(patientData.id, evt);
          break;
        }
        // Fin de atención en ventanilla → paciente sale por la puerta de salida
        const deskId = evt.desk_id || 1;
        const deskObj = this.scene.desks3D[deskId - 1];

        if (deskObj) {
          deskObj.isBusy = false;
          deskObj.beacon.material.color.setHex(0x10b981);
          deskObj.beacon.material.emissive.setHex(0x10b981);
          this.scene.updateSpriteText(deskObj.patientTag, "DISPONIBLE", "#10b981", "#0f172a");
        }

        // Paciente sale con animación de caminar hacia la salida
        const p3d = this.scene.getOrCreatePatient3D(patientData);
        this.scene.updateSpriteText(p3d.tagSprite, "✓ ATENDIDO", "#34d399", "#064e3b");

        // Liberar silla si aún estaba asignada
        const cIdx = this.patientChairsMap.get(patientData.id);
        if (cIdx !== undefined && this.scene.waitingChairs[cIdx]) {
          this.scene.waitingChairs[cIdx].occupiedBy = null;
        }

        // Animación de salida: camina hacia la puerta de salida lateral izquierda
        p3d.walkPath([
          { x: -8, y: 0, z: 2 },    // Punto intermedio hacia la salida
          { x: -28, y: 0, z: 2 }    // Sale completamente fuera de la escena
        ], () => {
          this.scene.removePatient3D(patientData.id);
          this.patientsAtDesk.delete(patientData.id);
          this.patientChairsMap.delete(patientData.id);
        });
        break;
      }
    }
  }

  enqueuePatientEntrance(patientId, patient, chairPosition, chairIndex) {
    const index = this.entranceSequence++;
    this.entranceQueue.push({ patientId, patient, chairPosition, chairIndex });
    this.patientEntering.add(patientId);
    if (index > 0) {
      const column = index % 5;
      const row = Math.floor(index / 5);
      patient.moveTo(-2.2 + column * 1.1, 0, 5.8 + row * 1.15);
    }
    this.startNextEntrance();
  }

  startNextEntrance() {
    if (!this.entranceQueue.length || this.entranceInProgress) return;
    this.entranceInProgress = true;
    const next = this.entranceQueue[0];
    next.patient.movementFactor = 0.88;
    const extraWing = next.chairIndex >= 30;
    const aisleX = extraWing ? 10.8 : 0;
    const approachZ = next.chairPosition.z - 1.05;
    const route = [
      { x: -0.7, y: 0, z: 4.8 },
      ...(extraWing ? [{ x: aisleX, y: 0, z: 4.8 }] : []),
      { x: aisleX, y: 0, z: approachZ },
      { x: next.chairPosition.x, y: 0, z: approachZ },
      { x: next.chairPosition.x, y: 0, z: next.chairPosition.z }
    ];
    next.patient.walkPath(route, () => {
      this.entranceQueue.shift();
      this.patientEntering.delete(next.patientId);
      this.entranceInProgress = false;
      this.seatPatient(next);
      this.startNextEntrance();
    });
  }

  seatPatient(entry) {
    if (this.receptionEntryPending.has(entry.patientId)) {
      entry.patient.group.position.copy(entry.chairPosition);
      entry.patient.targetPos.copy(entry.chairPosition);
      entry.patient.waypoints = [];
      entry.patient.onPathComplete = null;
      entry.patient.group.rotation.y = Math.PI;
      entry.patient.setSeated(true);
      entry.patient.movementFactor = 0.08;
      this.patientEntering.delete(entry.patientId);
      this.patientEnteredAt.set(entry.patientId, Date.now());
      this.receptionEntryPending.delete(entry.patientId);
      this.receptionSeatedIds.add(entry.patientId);
      this.receptionEntriesSeated = this.receptionSeatedIds.size;
    }
    if (this.receptionEntryPending.size === 0) {
      this.receptionReady = true;
      this.startNextReceptionCall();
    }
  }

  finishReceptionAdmissions() {
    const pending = this.entranceQueue.splice(0);
    this.entranceInProgress = false;
    pending.forEach(entry => this.seatPatient(entry));
    this.receptionReady = true;
    this.startNextReceptionCall();
  }

  startPatientCall(patientId) {
    if (!this.receptionCallQueue.includes(patientId)) this.receptionCallQueue.push(patientId);
    this.startNextReceptionCall();
  }

  startNextReceptionCall() {
    if (!this.receptionReady || this.activeReceptionCall !== null || !this.receptionCallQueue.length) return;
    const patientId = this.receptionCallQueue.shift();
    const call = this.pendingPatientCalls.get(patientId);
    if (!call) return this.startNextReceptionCall();
    this.activeReceptionCall = patientId;
    const patient = call.event.patient;
    const deskId = call.event.desk_id || 1;
    const prioText = patient.is_priority ? `[PRIORITARIO - ${patient.category}]` : "GENERAL";
    this.scene.updateTurneroScreen(`TURNO #${patient.token_number}`, `VENTANILLA ${deskId}`, `${patient.name} ${prioText}`, patient.is_priority);
    this.updateTurneroHUD(patient, deskId);
    call.desk.isBusy = true;
    call.desk.beacon.material.color.setHex(0xef4444);
    call.desk.beacon.material.emissive.setHex(0xef4444);
    this.scene.updateSpriteText(call.desk.patientTag, `#${patient.token_number} ${patient.name.split(" ")[0]}`, "#fbbf24", "#78350f");
    this.appendEventLog(call.event);
    const dwell = 0;
    setTimeout(() => {
      const chairIdx = this.patientChairsMap.get(patientId);
      if (chairIdx !== undefined && this.scene.waitingChairs[chairIdx]) this.scene.waitingChairs[chairIdx].occupiedBy = null;
      call.patient.setSeated(false);
      call.patient.walkPath([{ x: call.desk.frontPosition.x, y: call.desk.frontPosition.y, z: call.desk.frontPosition.z }], () => {
        this.patientsAtDesk.add(patientId);
        this.pendingPatientCalls.delete(patientId);
        this.appendEventLog({
          type: "PATIENT_REGISTERED",
          clock: call.event.clock,
          message: `${patient.name} se registra en Ventanilla ${deskId}`
        });
        const serviceEnd = this.pendingServiceEnds.get(patientId);
        if (serviceEnd) {
          this.pendingServiceEnds.delete(patientId);
          serviceEnd._deferredReplay = true;
          this.processEvent(serviceEnd, true);
        }
        this.activeReceptionCall = null;
        setTimeout(() => this.startNextReceptionCall(), 300);
      });
    }, dwell);
  }

  enqueueTokenLineArrival(patient, target, patientId) {
    this.tokenArrivalQueue.push({ patient, target, patientId });
    this.tokenLinePendingIds.add(patientId);
    if (!this.tokenLineEntering) this.startNextTokenLineArrival();
  }

  startNextTokenLineArrival() {
    if (!this.tokenArrivalQueue.length || this.tokenLineEntering) return;
    this.tokenLineEntering = true;
    const next = this.tokenArrivalQueue.shift();
    next.patient.movementFactor = 0.24;
    next.patient.walkPath([
      { x: 0, y: 0, z: 26 },
      { x: next.target.x, y: 0, z: 20 },
      { x: next.target.x, y: 0, z: next.target.z }
    ], () => {
      next.patient.movementFactor = 0.08;
      this.tokenLinePendingIds.delete(next.patientId);
      this.tokenLineEntering = false;
      this.startNextTokenLineArrival();
    });
  }

  enqueueTokenPickup(patient, patientData, isExtra) {
    this.tokenPickupQueue = this.tokenPickupQueue || [];
    this.tokenPickupQueue.push({ patient, patientData, isExtra });
    this.startNextTokenPickup();
  }

  startNextTokenPickup() {
    if (this.tokenPickupInProgress || !this.tokenPickupQueue || !this.tokenPickupQueue.length) return;
    this.tokenPickupInProgress = true;
    const next = this.tokenPickupQueue.shift();
    next.patient.walkPath([
      { x: next.patient.group.position.x, y: 0, z: 14 },
      { x: 0, y: 0, z: 9.8 }
    ], () => {
      next.patient.updateTagWithToken(next.patientData.token_number, next.isExtra);
      next.patient.walkPath([
        { x: -13, y: 0, z: 11 + (next.patientData.id % 4) * 1.2 }
      ], () => {
        this.tokenPickupInProgress = false;
        this.startNextTokenPickup();
      });
    });
  }

  updateClock(clockText, phaseText) {
    const clockEl = document.getElementById("live-clock");
    const phaseEl = document.getElementById("live-phase");
    if (clockEl) clockEl.textContent = clockText;
    if (phaseEl) phaseEl.textContent = phaseText;
  }

  formatSimulationClock(simMinutes) {
    const totalMinutes = 5 * 60 + Math.round(simMinutes);
    const hours24 = Math.floor(totalMinutes / 60) % 24;
    const minutes = totalMinutes % 60;
    const period = hours24 < 12 ? "AM" : "PM";
    const hours12 = hours24 % 12 || 12;
    return `${String(hours12).padStart(2, "0")}:${String(minutes).padStart(2, "0")} ${period}`;
  }

  phaseForSimTime(simMinutes) {
    if (simMinutes < 60) return "FASE 1: FILA PARA FICHOS";
    if (simMinutes < 120) return "FASE 2: REPARTO DE FICHOS (06:00-07:00 AM)";
    if (simMinutes < 180) return "FASE 3: INGRESO A SALA (07:00-08:00 AM)";
    return "FASE 4: ATENCIÓN EN VENTANILLA (DESDE 08:00 AM)";
  }

  updateTurneroHUD(patient, deskId) {
    const tTicket = document.getElementById("turnero-ticket");
    const tDesk = document.getElementById("turnero-desk");
    const tName = document.getElementById("turnero-name");
    const tTag = document.getElementById("turnero-tag");

    if (tTicket) tTicket.textContent = `#${patient.token_number}`;
    if (tDesk) tDesk.textContent = `Ventanilla ${deskId}`;
    if (tName) tName.textContent = patient.name;
    if (tTag) {
      if (patient.is_priority) {
        tTag.style.display = "inline-block";
        tTag.textContent = `${patient.icon || "⭐"} ${patient.category_label || patient.category}`;
      } else {
        tTag.style.display = "none";
      }
    }
  }

  updateLiveCounters(state) {
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    // Usar K dinámico de la config si ya tenemos simData
    const cfgK = (this.simData && this.simData.config) ? this.simData.config.base_tokens : 30;
    setVal("hud-tokens-given", `${state.tokens_given} / ${cfgK}`);
    setVal("hud-extra-tokens", `+${state.extra_tokens}`);
    setVal("hud-waiting-reception", state.reception_waiting);
    setVal("hud-active-desks", `${state.active_desks} / ${this.simData ? this.simData.config.num_servers : 3}`);
    setVal("hud-total-served", state.served_count);
  }

  appendEventLog(evt) {
    const logList = document.getElementById("live-event-stream");
    if (!logList) return;

    const li = document.createElement("li");
    li.className = "log-item";
    if (evt.type.includes("PRIORITY")) li.classList.add("prio");
    if (evt.type.includes("EXTRA")) li.classList.add("extra");

    li.innerHTML = `
      <span class="log-time">${evt.clock}</span>
      <span class="log-msg">${evt.message}</span>
    `;

    logList.insertBefore(li, logList.firstChild);

    // Mantener máximo 50 eventos en pantalla para fluidez
    if (logList.children.length > 50) {
      logList.removeChild(logList.lastChild);
    }
  }

  updateKPIs(data) {
    const kpi = data.kpi_simulated;
    const summary = data.summary;

    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setVal("kpi-total-arrived", summary.total_patients_arrived);
    setVal("kpi-base-tokens", summary.tokens_base_distributed);
    setVal("kpi-extra-tokens", `+${summary.tokens_extra_distributed}`);
    setVal("kpi-rejected", summary.total_rejected);
    setVal("kpi-attended", summary.total_attended);

    setVal("kpi-wait-token-prio", `${kpi.avg_wait_token_priority} min`);
    setVal("kpi-wait-token-reg", `${kpi.avg_wait_token_regular} min`);
    setVal("kpi-wait-recep-prio", `${kpi.avg_wait_reception_priority} min`);
    setVal("kpi-wait-recep-reg", `${kpi.avg_wait_reception_regular} min`);
    setVal("kpi-service-mean", `${kpi.avg_service_time} min`);
    setVal("kpi-benefit-percent", `-${kpi.priority_benefit_percent}%`);
  }

  initCharts() {
    const ctxWait = document.getElementById("chart-wait-times");
    if (ctxWait) {
      this.chartWait = new Chart(ctxWait, {
        type: "bar",
        data: {
          labels: ["Espera Ficho", "Espera Turno (desde 8 AM)", "Tiempo Total en IPS"],
          datasets: [
            { label: "Pacientes Prioritarios", data: [0, 0, 0], backgroundColor: "#fbbf24" },
            { label: "Pacientes Regulares", data: [0, 0, 0], backgroundColor: "#38bdf8" }
          ]
        },
        options: {
          responsive: true,
          plugins: { legend: { labels: { color: "#cbd5e1" } } },
          scales: {
            x: { ticks: { color: "#94a3b8" } },
            y: { ticks: { color: "#94a3b8" }, title: { display: true, text: "Minutos", color: "#94a3b8" } }
          }
        }
      });
    }

    const ctxCat = document.getElementById("chart-categories");
    if (ctxCat) {
      this.chartCat = new Chart(ctxCat, {
        type: "doughnut",
        data: {
          labels: ["Adulto Mayor", "Discapacidad", "Embarazada", "Vulnerable", "Regular"],
          datasets: [{
            data: [0, 0, 0, 0, 0],
            backgroundColor: ["#f59e0b", "#ef4444", "#ec4899", "#8b5cf6", "#3b82f6"]
          }]
        },
        options: {
          responsive: true,
          plugins: { legend: { position: "right", labels: { color: "#cbd5e1" } } }
        }
      });
    }
  }

  renderCharts(data) {
    const kpi = data.kpi_simulated;
    if (this.chartWait) {
      this.chartWait.data.datasets[0].data = [
        kpi.avg_wait_token_priority,
        kpi.avg_wait_reception_priority,
        kpi.avg_total_system_priority
      ];
      this.chartWait.data.datasets[1].data = [
        kpi.avg_wait_token_regular,
        kpi.avg_wait_reception_regular,
        kpi.avg_total_system_regular
      ];
      this.chartWait.update();
    }

    if (this.chartCat) {
      const counts = data.summary.category_counts || {};
      this.chartCat.data.datasets[0].data = [
        counts["ADULTO_MAYOR"] || 0,
        counts["DISCAPACIDAD"] || 0,
        counts["EMBARAZADA"] || 0,
        counts["VULNERABLE"] || 0,
        counts["REGULAR"] || 0
      ];
      this.chartCat.update();
    }
  }

  renderTheoryTab(theory) {
    const container = document.getElementById("theory-metrics-content");
    if (!container) return;

    if (!theory || theory.error) {
      container.innerHTML = `<p class="text-muted">No fue posible calcular métricas analíticas.</p>`;
      return;
    }

    container.innerHTML = `
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 20px;">
        <div class="kpi-card">
          <span class="kpi-label">Intensidad de Tráfico (ρ)</span>
          <span class="kpi-val ${theory.rho > 0.9 ? 'highlight-red' : 'highlight-green'}">${theory.rho_percent}%</span>
          <small style="color: #94a3b8; font-size: 10px;">${theory.is_stable ? 'Sistema Estable' : 'Saturado (ρ ≥ 1)'}</small>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">Prob. Sistema Vacío (P₀)</span>
          <span class="kpi-val highlight-blue">${theory.p0_percent}%</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">Prob. Esperar en Cola C(s, λ/μ<sub>tasa</sub>)</span>
          <span class="kpi-val highlight-gold">${theory.prob_wait_percent}%</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">Promedio en Cola (L_q)</span>
          <span class="kpi-val">${theory.lq} pacientes</span>
        </div>
      </div>

      <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 14px; margin-bottom: 16px;">
        <h4 style="color: #38bdf8; font-size: 14px; margin-bottom: 8px;">Comparativa Teórica de Prioridades (Modelo de Cobham M/M/s)</h4>
        <p style="font-size: 12px; color: #94a3b8; margin-bottom: 12px;">
          Fórmula analítica de colas no apropiativas con clases de prioridad:
        </p>
        <div style="display: flex; gap: 20px;">
          <div>
            <div style="font-size: 11px; color: #fbbf24; font-weight: bold;">Espera Teórica Prioritarios (W_q1):</div>
            <div style="font-size: 20px; font-weight: bold; color: #fbbf24;">${theory.priority_theory.wq_priority_minutes} min</div>
          </div>
          <div>
            <div style="font-size: 11px; color: #38bdf8; font-weight: bold;">Espera Teórica Regulares (W_q2):</div>
            <div style="font-size: 20px; font-weight: bold; color: #38bdf8;">${theory.priority_theory.wq_regular_minutes} min</div>
          </div>
          <div>
            <div style="font-size: 11px; color: #34d399; font-weight: bold;">Reducción Teórica de Espera:</div>
            <div style="font-size: 20px; font-weight: bold; color: #34d399;">-${theory.priority_theory.priority_wait_reduction_pct}%</div>
          </div>
        </div>
      </div>
    `;
  }

  renderAnalysis(data) {
    const container = document.getElementById("simulation-analysis-content");
    if (!container) return;
    const k = data.kpi_simulated;
    const summary = data.summary;
    const analysis = data.analysis;
    const escape = value => String(value).replace(/[&<>"']/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);
    container.innerHTML = `
      <h3>Lectura de resultados</h3>
      <p>${escape(analysis.model)}</p>
      <div class="kpi-grid" style="margin:14px 0;">
        <div class="kpi-card"><span class="kpi-label">Utilización observada</span><span class="kpi-val">${k.observed_utilization_percent}%</span></div>
        <div class="kpi-card"><span class="kpi-label">Cola tras apertura (P50)</span><span class="kpi-val">${k.wait_reception_p50} min</span></div>
        <div class="kpi-card"><span class="kpi-label">Cola tras apertura (P90 / P95)</span><span class="kpi-val">${k.wait_reception_p90} / ${k.wait_reception_p95} min</span></div>
        <div class="kpi-card"><span class="kpi-label">Máxima cola tras apertura</span><span class="kpi-val">${k.wait_reception_max} min</span></div>
        <div class="kpi-card"><span class="kpi-label">Dispersión de espera</span><span class="kpi-val">${k.wait_reception_stddev} min</span></div>
        <div class="kpi-card"><span class="kpi-label">Rechazo / productividad</span><span class="kpi-val">${k.rejection_rate_percent}% / ${k.throughput_per_hour} pac/h</span></div>
      </div>
      <h4>Interpretación y acciones sugeridas</h4>
      <ul>${analysis.interpretation.map(item => `<li>${escape(item)}</li>`).join("")}</ul>
      <p style="margin-top:14px;color:#94a3b8">${escape(analysis.theory_comparison_note)}</p>
      <p>Atendidos: ${summary.total_attended}; rechazados: ${summary.total_rejected}; tickets base: ${summary.tokens_base_distributed}; extras prioritarios: ${summary.tokens_extra_distributed}.</p>`;
  }

  exportSimulationReport(printReport) {
    if (!this.simData) return;
    const data = this.simData;
    const k = data.kpi_simulated;
    const rows = [
      ["Semilla", data.config.random_seed],
      ["Lambda - tasa media de llegada (pacientes/h)", data.config.lambda_arrival_rate],
      ["MU - tiempo medio de atención (min)", data.config.mu_service_time],
      ["S - ventanillas", data.config.num_servers],
      ["K - tickets base", data.config.base_tokens],
      ["Llegadas generadas", data.summary.total_patients_arrived],
      ["Ventana de llegadas", `${data.config.arrival_window_start} - ${data.config.arrival_window_end}`],
      ["Atendidos", data.summary.total_attended],
      ["Rechazados", data.summary.total_rejected],
      ["Espera media en cola tras apertura (min)", k.avg_wait_reception_all],
      ["Espera media preapertura (min)", k.avg_wait_opening_all],
      ["Cola tras apertura P50 / P90 / P95 (min)", `${k.wait_reception_p50} / ${k.wait_reception_p90} / ${k.wait_reception_p95}`],
      ["Máxima cola tras apertura (min)", k.wait_reception_max],
      ["Desviación estándar espera (min)", k.wait_reception_stddev],
      ["Utilización observada (%)", k.observed_utilization_percent],
      ["Tasa de rechazo (%)", k.rejection_rate_percent],
      ["Productividad (pacientes/h)", k.throughput_per_hour]
    ];
    const escape = value => String(value ?? "-").replace(/[&<>"']/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);
    const report = `<!doctype html><html lang="es"><meta charset="utf-8"><title>Informe de simulación IPS</title>
      <style>body{font:15px Arial,sans-serif;max-width:900px;margin:40px auto;color:#17212b}h1,h2{color:#087f8c}table{border-collapse:collapse;width:100%;margin:20px 0}td,th{border:1px solid #cbd5d1;padding:9px;text-align:left}th{background:#e8f2ef}li{margin:8px 0}.note{color:#52616b}@media print{button{display:none}}</style>
      <h1>Informe de simulación de IPS</h1><p>${escape(data.analysis.model)}</p><h2>Configuración y medidas</h2>
      <table><tbody>${rows.map(([label, value]) => `<tr><th>${escape(label)}</th><td>${escape(value)}</td></tr>`).join("")}</tbody></table>
      <h2>Interpretación y recomendaciones</h2><ul>${data.analysis.interpretation.map(item => `<li>${escape(item)}</li>`).join("")}</ul>
      <p class="note">${escape(data.analysis.theory_comparison_note)}</p><p class="note">La semilla y los parámetros permiten reproducir la corrida con la misma versión del simulador.</p></html>`;
    if (printReport) {
      const reportWindow = window.open("", "_blank");
      if (!reportWindow) return;
      reportWindow.document.write(report);
      reportWindow.document.close();
      reportWindow.addEventListener("load", () => reportWindow.print());
      return;
    }
    const url = URL.createObjectURL(new Blob([report], { type: "text/html;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `informe_ips_semilla_${data.config.random_seed}.html`;
    link.click();
    URL.revokeObjectURL(url);
  }

  renderPatientsTable(patients) {
    const tbody = document.getElementById("patients-table-body");
    if (!tbody) return;

    tbody.innerHTML = "";
    patients.forEach(p => {
      const tr = document.createElement("tr");

      let badgeClass = "badge-regular";
      if (p.category === "ADULTO_MAYOR") badgeClass = "badge-senior";
      else if (p.category === "DISCAPACIDAD") badgeClass = "badge-disabled";
      else if (p.category === "EMBARAZADA") badgeClass = "badge-pregnant";
      else if (p.category === "VULNERABLE") badgeClass = "badge-vulnerable";

      let tokenDisplay = p.token_number ? `#${p.token_number}` : '<span style="color: #f87171;">Sin Ficho</span>';
      if (p.is_extra_token) {
        tokenDisplay += ' <span class="badge-extra">EXTRA</span>';
      }

      tr.innerHTML = `
        <td><strong>#${p.id}</strong></td>
        <td>${p.name}</td>
        <td><span class="badge-prio ${badgeClass}">${p.icon} ${p.category_label}</span></td>
        <td>${tokenDisplay}</td>
        <td>${p.wait_time_token} min</td>
        <td>${p.wait_time_opening} min</td>
        <td>${p.wait_time_reception} min</td>
        <td>${p.server_id ? `Ventanilla ${p.server_id}` : '-'}</td>
        <td>${p.service_duration} min</td>
        <td><strong>${p.total_time_in_system} min</strong></td>
      `;
      tbody.appendChild(tr);
    });
  }

  filterPatientsTable(query) {
    const q = query.toLowerCase();
    const rows = document.querySelectorAll("#patients-table-body tr");
    rows.forEach(row => {
      const text = row.innerText.toLowerCase();
      row.style.display = text.includes(q) ? "" : "none";
    });
  }
}

// Inicializar al cargar la página
window.addEventListener("DOMContentLoaded", () => {
  window.ipsApp = new IPSSimulatorApp();
});
