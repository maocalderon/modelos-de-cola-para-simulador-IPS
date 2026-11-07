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

    // Estado en tiempo de reproducción
    this.patientChairsMap = new Map(); // patient_id -> chairIndex

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
          document.getElementById("param_total_arrivals").value = 45;
          document.getElementById("param_mu").value = 30;
          document.getElementById("param_lambda").value = 7.0;
        } else if (sc === "optimized") {
          document.getElementById("param_s").value = 5;
          document.getElementById("param_k").value = 45;
          document.getElementById("param_total_arrivals").value = 60;
          document.getElementById("param_mu").value = 40;
          document.getElementById("param_lambda").value = 5.0;
        } else if (sc === "contingency") {
          document.getElementById("param_s").value = 2;
          document.getElementById("param_k").value = 20;
          document.getElementById("param_total_arrivals").value = 35;
          document.getElementById("param_mu").value = 20;
          document.getElementById("param_lambda").value = 8.5;
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
    this.pause();
    this.updateClock("05:00 AM", "FASE 1: LLEGADA Y FICHOS");

    // ── Leer parámetros con los nuevos IDs ──────────────────────────────────
    const mu      = parseFloat(document.getElementById("param_mu").value)             || 30;
    const lambda  = parseFloat(document.getElementById("param_lambda").value)         || 7.0;
    const s       = parseInt(document.getElementById("param_s").value)                || 3;
    const k       = parseInt(document.getElementById("param_k").value)                || 30;
    const total   = parseInt(document.getElementById("param_total_arrivals").value)   || 45;
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
      mu_arrival_rate:          mu,
      lambda_service_time:      lambda,
      num_servers:              s,
      base_tokens:              k,
      total_arrivals:           total,
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

        // Reconstruir ventanillas 3D y sillas según parámetros reales devueltos
        const cfgK = this.simData.config.base_tokens;
        const cfgS = this.simData.config.num_servers;

        this.scene.buildDesks(cfgS);
        const totalTickets = this.simData.summary.total_tokens_granted;
        const extraTickets = this.simData.summary.tokens_extra_distributed;
        this.scene.buildWaitingAreaChairs(totalTickets, extraTickets); // una silla por ticket; extras prioritarios en ámbar
        this.scene.resetScene();
        this.patientChairsMap.clear();

        // Actualizar UI, KPIs y Gráficas
        this.updateKPIs(this.simData);
        this.renderCharts(this.simData);
        this.renderTheoryTab(this.simData.theory_mms);
        this.renderPatientsTable(this.simData.patients);

        // Actualizar HUD dinámico de fichos según K
        const hudTokens = document.getElementById("hud-tokens-given");
        if (hudTokens) hudTokens.textContent = `0 / ${cfgK}`;

        // Limpiar registro de eventos en vivo
        const logList = document.getElementById("live-event-stream");
        if (logList) logList.innerHTML = "";

        // Iniciar reproducción
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
    const btn = document.getElementById("btn-play-pause");
    if (btn) btn.innerHTML = "▶ Continuar";
  }

  resetSimulation() {
    this.pause();
    this.currentEventIndex = 0;
    this.scene.resetScene();
    this.patientChairsMap.clear();
    this.updateClock("05:00 AM", "FASE 1: LLEGADA Y FICHOS");

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
    this.updateClock("12:00 PM", "SIMULACIÓN FINALIZADA");
  }

  scheduleNextEvent() {
    if (!this.isPlaying || this.currentEventIndex >= this.events.length) {
      this.pause();
      return;
    }

    const currentEvt = this.events[this.currentEventIndex];
    this.processEvent(currentEvt);
    this.currentEventIndex++;

    if (this.currentEventIndex >= this.events.length) {
      this.pause();
      return;
    }

    // Calcular demora proporcional al delta de tiempo de simulación
    const nextEvt = this.events[this.currentEventIndex];
    const timeDeltaSim = Math.max(0.1, nextEvt.sim_time - currentEvt.sim_time);

    // Factor base: 1 minuto simulado = 350ms a 1x velocidad
    const realDelay = Math.max(40, (timeDeltaSim * 350) / this.playbackSpeed);

    this.timerId = setTimeout(() => {
      this.scheduleNextEvent();
    }, realDelay);
  }

  processEvent(evt, isFastForward = false) {
    // 1. Actualizar Reloj e Indicador de Fase
    const phaseLabel = evt.sim_time < 180 ? "FASE 1: LLEGADA Y FICHOS (6:00 AM)" : "FASE 2: ATENCIÓN RECEPCIÓN (8:00 AM)";
    this.updateClock(evt.clock, phaseLabel);

    // 2. Actualizar HUD de estado en tiempo real
    if (evt.state) {
      this.updateLiveCounters(evt.state);
    }

    // 3. Agregar línea al Registro de Eventos
    this.appendEventLog(evt);

    // 4. Lógica de animación 3D
    const patientData = evt.patient;

    switch (evt.type) {
      case "PATIENT_ARRIVAL": {
        // Paciente regular llega a la cola exterior
        const p3d = this.scene.getOrCreatePatient3D(patientData);
        const queuePos = (evt.extra_data && evt.extra_data.queue_position) || 1;
        const slot = this.scene.tokenQueueSlots[queuePos - 1] || new THREE.Vector3(0, 0, 15);
        p3d.moveTo(slot.x, slot.y, slot.z);
        break;
      }

      case "PRIORITY_OVERTAKE": {
        // Paciente prioritario PASA AL FRENTE DE LA FILA (Regla clave del usuario)
        const p3d = this.scene.getOrCreatePatient3D(patientData);
        const prioQueuePos = (evt.extra_data && evt.extra_data.queue_position) || 1;
        const slot = this.scene.tokenQueueSlots[prioQueuePos - 1] || new THREE.Vector3(0, 0, 12);
        p3d.moveTo(slot.x, slot.y, slot.z);
        break;
      }

      case "TOKEN_ASSIGNED": {
        // Recibe su ficho en el módulo exterior
        const p3d = this.scene.getOrCreatePatient3D(patientData);
        p3d.updateTagWithToken(patientData.token_number, false);
        // Avanza un momento al mostrador de fichos
        p3d.moveTo(0, 0, 9.8);
        break;
      }

      case "TOKEN_EXTRA_EXCEPTION": {
        // ¡EXCEPCIÓN IPS! Paciente con discapacidad/prioridad recibe Ficho Extra
        if (!isFastForward) this.playChime(true);
        const p3d = this.scene.getOrCreatePatient3D(patientData);
        p3d.updateTagWithToken(patientData.token_number, true);
        p3d.moveTo(0, 0, 9.8);

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
        this.scene.updateTurneroScreen("RECEPCIÓN ABIERTA", "08:00 AM", "ATENCIÓN EN VENTANILLAS");
        break;
      }

      case "PATIENT_ENTER_RECEPTION": {
        // Ingresa a la sala de espera y toma asiento libre
        const p3d = this.scene.getOrCreatePatient3D(patientData);
        const freeChairIdx = this.scene.waitingChairs.findIndex(c => c.occupiedBy === null);
        if (freeChairIdx !== -1) {
          this.scene.waitingChairs[freeChairIdx].occupiedBy = patientData.id;
          this.patientChairsMap.set(patientData.id, freeChairIdx);
          const chairPos = this.scene.waitingChairs[freeChairIdx].position;
          p3d.moveTo(chairPos.x, 0, chairPos.z);
        } else {
          // Si no hay sillas libres, espera de pie en el pasillo
          p3d.moveTo(-8 + Math.random() * 16, 0, -2);
        }
        break;
      }

      case "PATIENT_CALLED": {
        // Turnero digital llama al paciente
        if (!isFastForward) this.playChime(patientData.is_priority);

        const deskId = evt.desk_id || 1;
        const deskObj = this.scene.desks3D[deskId - 1];

        // Liberar su silla de espera
        const chairIdx = this.patientChairsMap.get(patientData.id);
        if (chairIdx !== undefined && this.scene.waitingChairs[chairIdx]) {
          this.scene.waitingChairs[chairIdx].occupiedBy = null;
        }

        // Actualizar Turnero 3D y de interfaz
        const prioText = patientData.is_priority ? `[PRIORITARIO - ${patientData.category}]` : "GENERAL";
        this.scene.updateTurneroScreen(`TURNO #${patientData.token_number}`, `VENTANILLA ${deskId}`, `${patientData.name} ${prioText}`, patientData.is_priority);
        this.updateTurneroHUD(patientData, deskId);

        // Actualizar Ventanilla 3D (Luz roja / ocupada)
        if (deskObj) {
          deskObj.isBusy = true;
          deskObj.beacon.material.color.setHex(0xef4444);
          deskObj.beacon.material.emissive.setHex(0xef4444);
          this.scene.updateSpriteText(deskObj.patientTag, `#${patientData.token_number} ${patientData.name.split(" ")[0]}`, "#fbbf24", "#78350f");

          // Paciente camina hacia la ventanilla
          const p3d = this.scene.getOrCreatePatient3D(patientData);
          p3d.moveTo(deskObj.frontPosition.x, deskObj.frontPosition.y, deskObj.frontPosition.z);
        }
        break;
      }

      case "SERVICE_END": {
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
          this.patientChairsMap.delete(patientData.id);
        });
        break;
      }
    }
  }

  updateClock(clockText, phaseText) {
    const clockEl = document.getElementById("live-clock");
    const phaseEl = document.getElementById("live-phase");
    if (clockEl) clockEl.textContent = clockText;
    if (phaseEl) phaseEl.textContent = phaseText;
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
          labels: ["Espera Ficho (6 AM)", "Espera Recepción (8 AM)", "Tiempo Total en IPS"],
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
        Math.round((kpi.avg_wait_token_priority + kpi.avg_wait_reception_priority + kpi.avg_service_time) * 10) / 10
      ];
      this.chartWait.data.datasets[1].data = [
        kpi.avg_wait_token_regular,
        kpi.avg_wait_reception_regular,
        Math.round((kpi.avg_wait_token_regular + kpi.avg_wait_reception_regular + kpi.avg_service_time) * 10) / 10
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
          <span class="kpi-label">Prob. Esperar en Cola C(s, λ/μ)</span>
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
