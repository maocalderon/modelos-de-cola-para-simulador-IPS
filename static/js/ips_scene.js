/**
 * Escena 3D de la IPS - Three.js
 * Modela la clínica, sala de espera, ventanillas de recepción (M/M/s),
 * módulo exterior de fichos (6:00 AM) y avatares 3D con diferenciación visual:
 * - Paciente Regular
 * - Adulto Mayor (con bastón)
 * - Persona con Discapacidad (en silla de ruedas 3D)
 * - Mujer Embarazada
 * - Vulnerable
 */

class IPSScene {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.patients3D = new Map(); // patient_id -> Patient3D object
    this.desks3D = [];          // Array of desk meshes & status indicators
    this.waitingChairs = [];    // Coordinate slots for waiting room
    this.tokenQueueSlots = [];  // Coordinate slots for outdoor token queue
    
    this.initThree();
    this.buildClinicEnvironment();
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  initThree() {
    // 1. Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0c1322);
    this.scene.fog = new THREE.FogExp2(0x0c1322, 0.015);

    // 2. Camera
    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.5, 1000);
    this.camera.position.set(0, 32, 42);

    // 3. Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // 4. OrbitControls configurado para navegación completa (rotar + desplazar)
    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = true;
    this.controls.screenSpacePanning = true; // Permite desplazarse arriba, abajo, izquierda y derecha libremente
    this.controls.panSpeed = 1.2;
    this.controls.rotateSpeed = 0.8;
    this.controls.zoomSpeed = 1.2;
    this.controls.maxPolarAngle = Math.PI / 2.02;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 140;
    this.controls.target.set(0, 2, 0);

    // Botones del ratón configurables (izquierdo configurable, derecho siempre paneo)
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN
    };

    // Paneo con teclado (W, A, S, D o flechas)
    window.addEventListener("keydown", (e) => {
      const panStep = 2.0;
      if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") {
        this.panCamera(0, panStep);
      } else if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") {
        this.panCamera(0, -panStep);
      } else if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
        this.panCamera(-panStep, 0);
      } else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
        this.panCamera(panStep, 0);
      }
    });

    // 5. Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xfffaed, 0.9);
    dirLight.position.set(20, 45, 25);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 120;
    dirLight.shadow.camera.left = -35;
    dirLight.shadow.camera.right = 35;
    dirLight.shadow.camera.top = 35;
    dirLight.shadow.camera.bottom = -35;
    this.scene.add(dirLight);

    // Luz médica azulada suave para interior
    const indoorPoint = new THREE.PointLight(0x38bdf8, 0.6, 40);
    indoorPoint.position.set(0, 12, -8);
    this.scene.add(indoorPoint);

    // Window Resize
    window.addEventListener("resize", () => {
      if (!this.container) return;
      const w = this.container.clientWidth;
      const h = this.container.clientHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    });
  }

  buildClinicEnvironment() {
    // A. Suelo Principal (Dividido en Exterior Entrada y Recepción Interior)
    // Suelo interior pulido (Recepción)
    const floorInteriorGeo = new THREE.PlaneGeometry(42, 28);
    const floorInteriorMat = new THREE.MeshStandardMaterial({
      color: 0xe8eef0,
      roughness: 0.28,
      metalness: 0.04
    });
    const floorInterior = new THREE.Mesh(floorInteriorGeo, floorInteriorMat);
    floorInterior.rotation.x = -Math.PI / 2;
    floorInterior.position.set(0, 0, -10);
    floorInterior.receiveShadow = true;
    this.floorInteriorMesh = floorInterior;
    this.scene.add(floorInterior);

    // Suelo exterior pavimentado (Fila de Fichos 6:00 AM)
    const floorExteriorGeo = new THREE.PlaneGeometry(42, 22);
    const floorExteriorMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.8,
      metalness: 0.1
    });
    const floorExterior = new THREE.Mesh(floorExteriorGeo, floorExteriorMat);
    floorExterior.rotation.x = -Math.PI / 2;
    floorExterior.position.set(0, -0.02, 15);
    floorExterior.receiveShadow = true;
    this.scene.add(floorExterior);

    // Línea divisoria de entrada (Puerta principal de cristal)
    this.buildEntranceDoors();

    // Paredes de la clínica
    this.buildWalls();

    // B. Módulo de Entrega de Fichos (Exterior)
    this.buildTokenKiosk();

    // C. Puestos de la fila exterior de fichos (Guía visual en el suelo)
    this.buildTokenQueueGuides();

    // D. Sillas de la sala de espera interior
    this.buildWaitingAreaChairs();

    // E. Pantalla Turnero Digital en la pared interior
    this.buildDigitalTurneroScreen();

    // F. Letrero Superior de la IPS
    this.buildClinicSigns();
  }

  buildEntranceDoors() {
    // Marco de cristal corredizo en z = 4
    const frameGeo = new THREE.BoxGeometry(42, 0.4, 0.6);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8 });
    const topFrame = new THREE.Mesh(frameGeo, frameMat);
    topFrame.position.set(0, 5, 4);
    this.scene.add(topFrame);

    // Paneles de vidrio
    const glassGeo = new THREE.BoxGeometry(16, 5, 0.1);
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x93c5fd,
      transparent: true,
      opacity: 0.3,
      roughness: 0.1,
      transmission: 0.8
    });
    
    const leftDoor = new THREE.Mesh(glassGeo, glassMat);
    leftDoor.position.set(-10, 2.5, 4);
    this.scene.add(leftDoor);

    const rightDoor = new THREE.Mesh(glassGeo, glassMat);
    rightDoor.position.set(10, 2.5, 4);
    this.scene.add(rightDoor);

    // Alfombra de bienvenida en la entrada
    const rugGeo = new THREE.PlaneGeometry(8, 3);
    const rugMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.9 });
    const rug = new THREE.Mesh(rugGeo, rugMat);
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0, 0.02, 4);
    rug.receiveShadow = true;
    this.scene.add(rug);
  }

  buildWalls() {
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xf4f7f6, roughness: 0.78 });

    // Pared de fondo (detrás de las ventanillas)
    const backWallGeo = new THREE.BoxGeometry(42, 8, 1);
    const backWall = new THREE.Mesh(backWallGeo, wallMat);
    backWall.position.set(0, 4, -24);
    backWall.receiveShadow = true;
    this.scene.add(backWall);

    // Paredes laterales
    const sideWallGeo = new THREE.BoxGeometry(1, 8, 28);
    const leftWall = new THREE.Mesh(sideWallGeo, wallMat);
    leftWall.position.set(-21, 4, -10);
    this.scene.add(leftWall);

    const rightWall = new THREE.Mesh(sideWallGeo, wallMat);
    rightWall.position.set(21, 4, -10);
    this.rightWallMesh = rightWall;
    this.scene.add(rightWall);
  }

  buildTokenKiosk() {
    // Caseta o atril del vigilante/recepcionista para repartir fichos (a las 6:00 AM)
    const kioskGroup = new THREE.Group();

    // Mostrador del módulo de fichos
    const deskGeo = new THREE.BoxGeometry(3.5, 2.2, 1.8);
    const deskMat = new THREE.MeshStandardMaterial({ color: 0x0369a1, roughness: 0.4 });
    const desk = new THREE.Mesh(deskGeo, deskMat);
    desk.position.set(0, 1.1, 0);
    desk.castShadow = true;
    desk.receiveShadow = true;
    kioskGroup.add(desk);

    // Dispensador de fichos
    const dispGeo = new THREE.BoxGeometry(0.8, 1.2, 0.8);
    const dispMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.5 });
    const disp = new THREE.Mesh(dispGeo, dispMat);
    disp.position.set(0.8, 2.5, 0);
    kioskGroup.add(disp);

    // Letrero del Módulo de Fichos (Cuadro amarillo perfectamente ajustado al texto)
    const signSprite = this.createTextSprite("MÓDULO DE FICHOS (06:00 AM)", "#fbbf24", "#09101d", "#f59e0b", 26);
    signSprite.position.set(0, 3.8, 0);
    kioskGroup.add(signSprite);

    // Avatar del vigilante entregando fichos
    const guard = this.createGuardAvatar();
    guard.position.set(0, 0, -1.3);
    kioskGroup.add(guard);

    kioskGroup.position.set(0, 0, 8);
    this.scene.add(kioskGroup);
  }

  createGuardAvatar() {
    const group = new THREE.Group();
    // Cuerpo
    const bodyGeo = new THREE.CylinderGeometry(0.4, 0.45, 1.5, 16);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1e3a8a }); // Azul uniforme
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 1.35;
    group.add(body);

    // Cabeza
    const headGeo = new THREE.SphereGeometry(0.3, 16, 16);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xfcd34d });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 2.4;
    group.add(head);

    // Gorra de seguridad
    const capGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.15, 16);
    const capMat = new THREE.MeshStandardMaterial({ color: 0x172554 });
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.position.y = 2.65;
    group.add(cap);

    return group;
  }

  buildTokenQueueGuides() {
    // Genera 35 posiciones ordenadas en zigzag / fila india para la cola exterior
    // La fila inicia frente al mostrador de fichos en (0, 0, 11) y se extiende hacia atrás
    this.tokenQueueSlots = [];
    const startZ = 11.5;
    for (let i = 0; i < 60; i++) {
      // 2 filas paralelas o zigzag ordenado
      let x = 0;
      let z = startZ + i * 1.3;
      if (z > 24) {
        // Dobla en L hacia la derecha o izquierda
        const overflow = i - Math.floor((24 - startZ) / 1.3);
        x = (overflow % 2 === 0 ? 1 : -1) * (1.5 + Math.floor(overflow / 2) * 1.2);
        z = 24.5;
      }
      this.tokenQueueSlots.push(new THREE.Vector3(x, 0, z));
    }
  }

  buildWaitingAreaChairs(numChairs = 30, extraChairs = 0) {
    // Si ya existían sillas anteriores, se eliminan del escenario para regenerarlas exactamente igual al número de tickets
    if (this.chairGroupMesh) {
      this.scene.remove(this.chairGroupMesh);
    }
    this.waitingChairs = [];
    this.chairGroupMesh = new THREE.Group();

    const wingColumns = Math.ceil(Math.max(0, numChairs - 30) / 5);
    const rightEdge = Math.max(21, 14.4 + Math.max(0, wingColumns - 1) * 2.15);
    if (this.floorInteriorMesh) {
      this.floorInteriorMesh.scale.x = (rightEdge + 21) / 42;
      this.floorInteriorMesh.position.x = (rightEdge - 21) / 2;
    }
    if (this.rightWallMesh) this.rightWallMesh.position.x = rightEdge;

    const chairMat = new THREE.MeshStandardMaterial({ color: 0x087f8c, roughness: 0.5 });
    const extraChairMat = new THREE.MeshStandardMaterial({ color: 0xe0a126, roughness: 0.48 });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.8 });

    // Base: seis sillas por fila. Las sillas sobre la capacidad base abren un ala hacia la derecha.
    const chairsPerRow = 6;
    const spacingX = 2.4;
    const spacingZ = 2.5;

    const seatGeo = new THREE.BoxGeometry(0.95, 0.12, 0.95);
    const backGeo = new THREE.BoxGeometry(0.95, 0.85, 0.12);
    const legGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.7, 8);

    for (let i = 0; i < numChairs; i++) {
      let x;
      let z;
      if (i < 30) {
        const row = Math.floor(i / chairsPerRow);
        const col = i % chairsPerRow;
        x = col < 3 ? -1.6 - (2 - col) * spacingX : 1.6 + (col - 3) * spacingX;
        z = -4.0 - row * spacingZ;
      } else {
        const wingIndex = i - 30;
        const wingCol = Math.floor(wingIndex / 5);
        const wingRow = wingIndex % 5;
        x = 13.4 + wingCol * 2.15;
        z = -4.0 - wingRow * spacingZ;
      }

      const singleChair = new THREE.Group();

      const seatMat = i >= numChairs - extraChairs ? extraChairMat : chairMat;
      const seat = new THREE.Mesh(seatGeo, seatMat);
      seat.position.y = 0.7;
      singleChair.add(seat);

      const back = new THREE.Mesh(backGeo, seatMat);
      back.position.set(0, 1.15, -0.42);
      singleChair.add(back);

      const leg1 = new THREE.Mesh(legGeo, metalMat); leg1.position.set(-0.38, 0.35, -0.38);
      const leg2 = new THREE.Mesh(legGeo, metalMat); leg2.position.set(0.38, 0.35, -0.38);
      const leg3 = new THREE.Mesh(legGeo, metalMat); leg3.position.set(-0.38, 0.35, 0.38);
      const leg4 = new THREE.Mesh(legGeo, metalMat); leg4.position.set(0.38, 0.35, 0.38);
      singleChair.add(leg1, leg2, leg3, leg4);

      singleChair.position.set(x, 0, z);
      this.chairGroupMesh.add(singleChair);

      this.waitingChairs.push({
        index: i,
        position: new THREE.Vector3(x, 0, z),
        occupiedBy: null
      });
    }

    this.scene.add(this.chairGroupMesh);
  }

  buildDesks(numServers) {
    // Limpia ventanillas anteriores si se cambia el número dinámicamente
    this.desks3D.forEach(d => this.scene.remove(d.group));
    this.desks3D = [];

    const totalWidth = 32;
    const spacing = totalWidth / (numServers + 1);

    for (let i = 1; i <= numServers; i++) {
      const deskGroup = new THREE.Group();
      const x = -totalWidth / 2 + i * spacing;
      const z = -20;

      // 1. Mostrador de recepción con ventanilla de vidrio
      const counterGeo = new THREE.BoxGeometry(3.2, 2.2, 1.6);
      const counterMat = new THREE.MeshStandardMaterial({ color: 0xf8faf9, roughness: 0.3, metalness: 0.04 });
      const counter = new THREE.Mesh(counterGeo, counterMat);
      counter.position.set(0, 1.1, 0);
      counter.castShadow = true;
      counter.receiveShadow = true;
      deskGroup.add(counter);

      const accent = new THREE.Mesh(
        new THREE.BoxGeometry(3.22, 0.16, 1.62),
        new THREE.MeshStandardMaterial({ color: 0x087f8c, roughness: 0.32 })
      );
      accent.position.set(0, 0.25, 0);
      deskGroup.add(accent);

      // Vidrio protector con orificio
      const glassGeo = new THREE.BoxGeometry(3.0, 2.2, 0.08);
      const glassMat = new THREE.MeshPhysicalMaterial({
        color: 0xcfd8dc,
        transparent: true,
        opacity: 0.35,
        roughness: 0.1,
        transmission: 0.7
      });
      const glass = new THREE.Mesh(glassGeo, glassMat);
      glass.position.set(0, 3.0, 0.7);
      deskGroup.add(glass);

      // Computador monitor
      const monGeo = new THREE.BoxGeometry(0.8, 0.6, 0.1);
      const monMat = new THREE.MeshStandardMaterial({ color: 0x243746 });
      const mon = new THREE.Mesh(monGeo, monMat);
      mon.position.set(0, 2.5, 0);
      deskGroup.add(mon);

      // 2. Avatar de Recepcionista sentado
      const rec = this.createReceptionistAvatar();
      rec.position.set(0, 0.5, -0.9);
      deskGroup.add(rec);

      // 3. Luz y Letrero LED indicador de la Ventanilla (Verde = Libre, Rojo = Ocupado)
      const beaconGeo = new THREE.SphereGeometry(0.2, 16, 16);
      const beaconMat = new THREE.MeshStandardMaterial({
        color: 0x10b981,
        emissive: 0x10b981,
        emissiveIntensity: 0.8
      });
      const beacon = new THREE.Mesh(beaconGeo, beaconMat);
      beacon.position.set(0, 4.4, 0.7);
      deskGroup.add(beacon);

      // Letrero texto "Ventanilla X"
      const signSprite = this.createTextSprite(`VENTANILLA ${i}`, "#38bdf8", "#0f172a", "#0284c7", 26);
      signSprite.position.set(0, 5.0, 0.7);
      deskGroup.add(signSprite);

      // Sprite dinámico para mostrar el paciente actual atendido
      const patientTagSprite = this.createTextSprite("DISPONIBLE", "#10b981", "#0f172a", "#10b981", 24);
      patientTagSprite.position.set(0, 3.8, 0.7);
      deskGroup.add(patientTagSprite);

      deskGroup.position.set(x, 0, z);
      this.scene.add(deskGroup);

      this.desks3D.push({
        id: i,
        group: deskGroup,
        beacon: beacon,
        patientTag: patientTagSprite,
        position: new THREE.Vector3(x, 0, z),
        frontPosition: new THREE.Vector3(x, 0, z + 2.2), // Donde se para el paciente atendido
        isBusy: false
      });
    }
  }

  createReceptionistAvatar() {
    const group = new THREE.Group();
    // Cuerpo
    const bodyGeo = new THREE.CylinderGeometry(0.35, 0.4, 1.2, 16);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x0284c7 }); // Uniforme azul clínico
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.8;
    group.add(body);

    // Cabeza
    const headGeo = new THREE.SphereGeometry(0.26, 16, 16);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xfed7aa });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.6;
    group.add(head);

    return group;
  }

  buildDigitalTurneroScreen() {
    // Pantalla LED en la pared frontal interior de la sala
    const screenGeo = new THREE.BoxGeometry(8, 4.5, 0.2);
    const screenMat = new THREE.MeshStandardMaterial({
      color: 0x050811,
      metalness: 0.8,
      roughness: 0.2
    });
    this.turneroScreenMesh = new THREE.Mesh(screenGeo, screenMat);
    this.turneroScreenMesh.position.set(0, 6.2, -23.4);
    this.scene.add(this.turneroScreenMesh);

    // Canvas dinámico para dibujar el Turnero en 3D
    this.turneroCanvas = document.createElement("canvas");
    this.turneroCanvas.width = 512;
    this.turneroCanvas.height = 288;
    this.turneroTexture = new THREE.CanvasTexture(this.turneroCanvas);

    const displayMat = new THREE.MeshBasicMaterial({ map: this.turneroTexture });
    const displayFace = new THREE.Mesh(new THREE.PlaneGeometry(7.8, 4.3), displayMat);
    displayFace.position.set(0, 6.2, -23.25);
    this.scene.add(displayFace);

    this.updateTurneroScreen("SALA DE ESPERA", "08:00 AM", "ESPERANDO APERTURA");
  }

  updateTurneroScreen(line1, line2, line3, isPriority = false) {
    if (!this.turneroCanvas) return;
    const ctx = this.turneroCanvas.getContext("2d");
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, 512, 288);

    // Borde azul o dorado según prioridad
    ctx.strokeStyle = isPriority ? "#fbbf24" : "#0284c7";
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, 504, 280);

    // Cabecera del Turnero 3D con nuevo nombre de la IPS
    ctx.fillStyle = "#38bdf8";
    ctx.font = "bold 24px Courier New, monospace";
    ctx.textAlign = "center";
    ctx.fillText("IPS VIVA SALUD INTEGRAL", 256, 40);

    // Línea 1 (Turno)
    ctx.fillStyle = isPriority ? "#fbbf24" : "#f8fafc";
    ctx.font = "bold 44px Courier New, monospace";
    ctx.fillText(line1, 256, 110);

    // Línea 2 (Ventanilla)
    ctx.fillStyle = "#34d399";
    ctx.font = "bold 56px Courier New, monospace";
    ctx.fillText(line2, 256, 185);

    // Línea 3 (Subtítulo / Prioridad)
    ctx.fillStyle = isPriority ? "#f87171" : "#94a3b8";
    ctx.font = "bold 22px Arial, sans-serif";
    ctx.fillText(line3, 256, 245);

    this.turneroTexture.needsUpdate = true;
  }

  buildClinicSigns() {
    const sign = new THREE.Group();
    const plaque = new THREE.Mesh(
      new THREE.BoxGeometry(10, 2.2, 0.28),
      new THREE.MeshStandardMaterial({ color: 0x087f8c, roughness: 0.35 })
    );
    sign.add(plaque);
    const crossMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xb7f3e8, emissiveIntensity: 0.25 });
    const crossVertical = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.45, 0.08), crossMat);
    const crossHorizontal = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.42, 0.08), crossMat);
    crossVertical.position.set(-3.7, 0.35, 0.19);
    crossHorizontal.position.set(-3.7, 0.35, 0.19);
    sign.add(crossVertical, crossHorizontal);
    const name = this.createTextSprite("IPS VIVA SALUD INTEGRAL", "#ffffff", "#087f8c", null, 27);
    name.position.set(0.65, 0.35, 0.2);
    sign.add(name);
    sign.position.set(0, 6.8, 4);
    this.scene.add(sign);

    const wallCross = new THREE.Group();
    const tile = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.2, 0.12), new THREE.MeshStandardMaterial({ color: 0x087f8c }));
    const v = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.5, 0.08), crossMat);
    const h = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.42, 0.08), crossMat);
    v.position.z = 0.1;
    h.position.z = 0.1;
    wallCross.add(tile, v, h);
    wallCross.position.set(-15.5, 5.1, -23.35);
    this.scene.add(wallCross);
  }

  // --- Creación de Avatares 3D con Distinción Visual ---

  getOrCreatePatient3D(patientData) {
    if (this.patients3D.has(patientData.id)) {
      return this.patients3D.get(patientData.id);
    }

    const patientObj = new Patient3D(patientData, this);
    this.patients3D.set(patientData.id, patientObj);
    this.scene.add(patientObj.group);
    return patientObj;
  }

  removePatient3D(patientId) {
    if (this.patients3D.has(patientId)) {
      const p = this.patients3D.get(patientId);
      this.scene.remove(p.group);
      p.destroy();
      this.patients3D.delete(patientId);
    }
  }

  /**
   * Crea un sprite de texto 3D que calcula dinámicamente el ancho
   * para que el cuadro y el texto se ajusten PERFECTAMENTE sin cortes ni estiramientos.
   */
  createTextSprite(text, textColor = "#ffffff", bgColor = "#0f172a", borderColor = null, fontSize = 28) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    // Medición exacta del texto
    ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif`;
    const metrics = ctx.measureText(text);
    const textWidth = Math.ceil(metrics.width);

    const padX = 32;
    const padY = 18;
    const totalW = Math.max(160, textWidth + padX * 2);
    const totalH = Math.max(54, fontSize + padY * 2);

    canvas.width = totalW;
    canvas.height = totalH;

    // Restaurar fuente tras cambiar tamaño de canvas
    ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif`;

    // Fondo con esquinas redondeadas
    ctx.fillStyle = bgColor;
    if (ctx.roundRect) {
      ctx.roundRect(3, 3, totalW - 6, totalH - 6, 12);
    } else {
      ctx.fillRect(3, 3, totalW - 6, totalH - 6);
    }
    ctx.fill();

    // Borde delimitador
    ctx.strokeStyle = borderColor || textColor;
    ctx.lineWidth = 3;
    if (ctx.roundRect) {
      ctx.roundRect(3, 3, totalW - 6, totalH - 6, 12);
    } else {
      ctx.strokeRect(3, 3, totalW - 6, totalH - 6);
    }
    ctx.stroke();

    // Texto perfectamente centrado
    ctx.fillStyle = textColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, totalW / 2, totalH / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const spriteMat = new THREE.SpriteMaterial({ map: texture, depthTest: false });
    const sprite = new THREE.Sprite(spriteMat);

    // Escala proporcional exacta para evitar deformaciones
    const baseHeight = 1.35;
    const aspect = totalW / totalH;
    sprite.scale.set(baseHeight * aspect, baseHeight, 1);
    return sprite;
  }

  // Controles de cámara preestablecidos
  setCameraPreset(preset) {
    if (preset === "iso") {
      this.camera.position.set(0, 32, 42);
      this.controls.target.set(0, 2, 0);
    } else if (preset === "tokens") {
      this.camera.position.set(0, 14, 28);
      this.controls.target.set(0, 2, 12);
    } else if (preset === "waiting") {
      this.camera.position.set(0, 18, 10);
      this.controls.target.set(0, 2, -8);
    } else if (preset === "desks") {
      this.camera.position.set(0, 10, -8);
      this.controls.target.set(0, 3, -20);
    }
    this.controls.update();
  }

  // Cambia el modo de interacción del clic izquierdo: Rotar u Órbita vs Desplazamiento (Pan)
  setMouseInteractionMode(mode) {
    if (mode === "pan") {
      this.controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
    } else {
      this.controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
    }
  }

  // Panea la cámara en el plano de la pantalla (arriba/abajo/lados)
  panCamera(deltaX, deltaY) {
    this.camera.updateMatrixWorld();
    const vX = new THREE.Vector3();
    const vY = new THREE.Vector3();
    this.camera.matrix.extractBasis(vX, vY, new THREE.Vector3());
    vX.multiplyScalar(deltaX);
    vY.multiplyScalar(deltaY);
    
    this.camera.position.add(vX).add(vY);
    this.controls.target.add(vX).add(vY);
    this.controls.update();
  }

  animate() {
    requestAnimationFrame(this.animate);
    this.controls.update();

    // Actualizar animación suave de cada paciente 3D
    this.patients3D.forEach(patient => patient.update());

    this.renderer.render(this.scene, this.camera);
  }

  resetScene() {
    this.patients3D.forEach(p => {
      this.scene.remove(p.group);
      p.destroy();
    });
    this.patients3D.clear();

    this.waitingChairs.forEach(c => c.occupiedBy = null);
    this.desks3D.forEach(d => {
      d.isBusy = false;
      d.beacon.material.color.setHex(0x10b981);
      d.beacon.material.emissive.setHex(0x10b981);
      this.updateSpriteText(d.patientTag, "DISPONIBLE", "#10b981", "#0f172a", "#10b981");
    });

    this.updateTurneroScreen("SALA DE ESPERA", "08:00 AM", "ESPERANDO APERTURA");
  }

  updateSpriteText(sprite, text, textColor = "#ffffff", bgColor = "#0f172a", borderColor = null, fontSize = 26) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif`;
    const metrics = ctx.measureText(text);
    const textWidth = Math.ceil(metrics.width);

    const padX = 24;
    const padY = 14;
    const totalW = Math.max(160, textWidth + padX * 2);
    const totalH = Math.max(50, fontSize + padY * 2);

    canvas.width = totalW;
    canvas.height = totalH;

    ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif`;

    ctx.fillStyle = bgColor;
    if (ctx.roundRect) {
      ctx.roundRect(3, 3, totalW - 6, totalH - 6, 10);
    } else {
      ctx.fillRect(3, 3, totalW - 6, totalH - 6);
    }
    ctx.fill();

    ctx.strokeStyle = borderColor || textColor;
    ctx.lineWidth = 3;
    if (ctx.roundRect) {
      ctx.roundRect(3, 3, totalW - 6, totalH - 6, 10);
    } else {
      ctx.strokeRect(3, 3, totalW - 6, totalH - 6);
    }
    ctx.stroke();

    ctx.fillStyle = textColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, totalW / 2, totalH / 2);

    if (sprite.material.map) {
      sprite.material.map.dispose();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    sprite.material.map = texture;
    sprite.material.needsUpdate = true;

    // Ajustar escala proporcional
    const baseHeight = 1.25;
    const aspect = totalW / totalH;
    sprite.scale.set(baseHeight * aspect, baseHeight, 1);
  }
}

/**
 * Representación de un paciente 3D en la escena.
 * Soporta traslación interpolada (lerp), halos de prioridad,
 * modelos geométricos especiales (silla de ruedas, bastón, embarazada).
 */
class Patient3D {
  constructor(data, ipsScene) {
    this.data = data;
    this.ipsScene = ipsScene;
    this.group = new THREE.Group();

    // Posición inicial: Fuera de la pantalla al sur (entrada lejana)
    this.group.position.set(0, 0, 32);
    this.targetPos = new THREE.Vector3(0, 0, 32);
    this.waypoints = [];
    this.onPathComplete = null;

    this.buildMesh();
    this.buildTag();
  }

  buildMesh() {
    const cat = this.data.category;

    if (cat === "DISCAPACIDAD") {
      this.buildWheelchairPatient();
    } else if (cat === "ADULTO_MAYOR") {
      this.buildElderlyPatient();
    } else if (cat === "EMBARAZADA") {
      this.buildPregnantPatient();
    } else {
      this.buildStandardPatient(cat === "VULNERABLE");
    }

    // Halo dorado para pacientes prioritarios en el suelo
    if (this.data.is_priority) {
      const ringGeo = new THREE.RingGeometry(0.65, 0.85, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xfbbf24,
        side: THREE.DoubleSide
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.04;
      this.group.add(ring);
    }
  }

  buildStandardPatient(isVulnerable = false) {
    const color = isVulnerable ? 0x8b5cf6 : 0x3b82f6; // Púrpura o Azul
    const mat = new THREE.MeshStandardMaterial({ color: color });

    // Torso
    const torsoGeo = new THREE.CylinderGeometry(0.32, 0.35, 1.3, 16);
    const torso = new THREE.Mesh(torsoGeo, mat);
    torso.position.y = 1.3;
    torso.castShadow = true;
    this.group.add(torso);

    // Cabeza
    const headGeo = new THREE.SphereGeometry(0.25, 16, 16);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xfed7aa });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 2.25;
    head.castShadow = true;
    this.group.add(head);

    // Piernas
    const legGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.7, 8);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x1e293b });
    const legL = new THREE.Mesh(legGeo, legMat); legL.position.set(-0.16, 0.35, 0);
    const legR = new THREE.Mesh(legGeo, legMat); legR.position.set(0.16, 0.35, 0);
    this.group.add(legL, legR);
  }

  buildElderlyPatient() {
    const mat = new THREE.MeshStandardMaterial({ color: 0xf59e0b }); // Ámbar

    // Torso ligeramente inclinado
    const torsoGeo = new THREE.CylinderGeometry(0.32, 0.35, 1.25, 16);
    const torso = new THREE.Mesh(torsoGeo, mat);
    torso.position.set(0, 1.2, 0.05);
    torso.rotation.x = 0.1;
    this.group.add(torso);

    // Cabeza canosa
    const headGeo = new THREE.SphereGeometry(0.24, 16, 16);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9 }); // Canas
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.set(0, 2.05, 0.12);
    this.group.add(head);

    // Bastón (Cane)
    const caneGeo = new THREE.CylinderGeometry(0.03, 0.03, 1.2, 8);
    const caneMat = new THREE.MeshStandardMaterial({ color: 0x78350f }); // Madera
    const cane = new THREE.Mesh(caneGeo, caneMat);
    cane.position.set(0.42, 0.6, 0.2);
    cane.rotation.z = -0.1;
    this.group.add(cane);

    // Piernas
    const legGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.65, 8);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x334155 });
    const legL = new THREE.Mesh(legGeo, legMat); legL.position.set(-0.15, 0.32, 0);
    const legR = new THREE.Mesh(legGeo, legMat); legR.position.set(0.15, 0.32, 0);
    this.group.add(legL, legR);
  }

  buildWheelchairPatient() {
    // Modelo 3D de Silla de Ruedas
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8 });
    const seatMat = new THREE.MeshStandardMaterial({ color: 0xef4444 }); // Rojo

    // Ruedas grandes laterales
    const wheelGeo = new THREE.TorusGeometry(0.45, 0.05, 12, 24);
    const wheelL = new THREE.Mesh(wheelGeo, metalMat);
    wheelL.position.set(-0.45, 0.45, 0);
    wheelL.rotation.y = Math.PI / 2;

    const wheelR = new THREE.Mesh(wheelGeo, metalMat);
    wheelR.position.set(0.45, 0.45, 0);
    wheelR.rotation.y = Math.PI / 2;
    this.group.add(wheelL, wheelR);

    // Asiento
    const seatGeo = new THREE.BoxGeometry(0.7, 0.08, 0.7);
    const seat = new THREE.Mesh(seatGeo, seatMat);
    seat.position.set(0, 0.5, 0);
    this.group.add(seat);

    // Respaldo
    const backGeo = new THREE.BoxGeometry(0.7, 0.7, 0.08);
    const back = new THREE.Mesh(backGeo, seatMat);
    back.position.set(0, 0.85, -0.32);
    this.group.add(back);

    // Reposapiés
    const footGeo = new THREE.BoxGeometry(0.6, 0.06, 0.3);
    const foot = new THREE.Mesh(footGeo, metalMat);
    foot.position.set(0, 0.2, 0.4);
    this.group.add(foot);

    // Paciente sentado
    const patientTorsoGeo = new THREE.CylinderGeometry(0.28, 0.3, 0.9, 16);
    const patientMat = new THREE.MeshStandardMaterial({ color: 0xef4444 });
    const patientTorso = new THREE.Mesh(patientTorsoGeo, patientMat);
    patientTorso.position.set(0, 1.05, -0.05);
    this.group.add(patientTorso);

    const headGeo = new THREE.SphereGeometry(0.22, 16, 16);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xfed7aa });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.set(0, 1.7, -0.05);
    this.group.add(head);
  }

  buildPregnantPatient() {
    const mat = new THREE.MeshStandardMaterial({ color: 0xec4899 }); // Rosa maternal

    // Torso
    const torsoGeo = new THREE.CylinderGeometry(0.3, 0.35, 1.3, 16);
    const torso = new THREE.Mesh(torsoGeo, mat);
    torso.position.y = 1.3;
    this.group.add(torso);

    // Curvatura de embarazo (vientre)
    const bumpGeo = new THREE.SphereGeometry(0.28, 16, 16);
    const bump = new THREE.Mesh(bumpGeo, mat);
    bump.position.set(0, 1.2, 0.25);
    this.group.add(bump);

    // Cabeza
    const headGeo = new THREE.SphereGeometry(0.24, 16, 16);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xfed7aa });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 2.2;
    this.group.add(head);

    // Piernas
    const legGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.7, 8);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x1e293b });
    const legL = new THREE.Mesh(legGeo, legMat); legL.position.set(-0.15, 0.35, 0);
    const legR = new THREE.Mesh(legGeo, legMat); legR.position.set(0.15, 0.35, 0);
    this.group.add(legL, legR);
  }

  buildTag() {
    let tagText = this.data.name;
    let bgColor = "#0f172a";
    let textColor = "#38bdf8";

    if (this.data.is_priority) {
      tagText = `${this.data.icon} ${this.data.name.split(" ")[0]}`;
      bgColor = "#78350f";
      textColor = "#fbbf24";
    } else {
      tagText = `👤 ${this.data.name.split(" ")[0]}`;
    }

    this.tagSprite = this.ipsScene.createTextSprite(tagText, textColor, bgColor, textColor, 24);
    this.tagSprite.position.set(0, 2.9, 0);
    this.group.add(this.tagSprite);
  }

  updateTagWithToken(tokenNum, isExtra = false) {
    let tagText = `[#${tokenNum}] ${this.data.name.split(" ")[0]}`;
    let bgColor = isExtra ? "#7f1d1d" : (this.data.is_priority ? "#78350f" : "#0f172a");
    let textColor = isExtra ? "#fecaca" : (this.data.is_priority ? "#fbbf24" : "#38bdf8");

    if (isExtra) {
      tagText = `[#${tokenNum} EXTRA] ${this.data.name.split(" ")[0]}`;
    }

    this.ipsScene.updateSpriteText(this.tagSprite, tagText, textColor, bgColor);
  }

  moveTo(x, y, z) {
    this.waypoints = [];
    this.onPathComplete = null;
    this.targetPos.set(x, y, z);
  }

  walkPath(pointsArray, onComplete = null) {
    this.waypoints = pointsArray.map(p => new THREE.Vector3(p.x, p.y !== undefined ? p.y : 0, p.z));
    this.onPathComplete = onComplete;
    if (this.waypoints.length > 0) {
      const first = this.waypoints.shift();
      this.targetPos.copy(first);
    }
  }

  update() {
    // Interpolación suave hacia targetPos (Lerp)
    this.group.position.lerp(this.targetPos, 0.08);

    const dist = this.group.position.distanceTo(this.targetPos);

    // Si está cerca del punto objetivo y hay más puntos en la ruta, avanzar
    if (dist < 0.4 && this.waypoints.length > 0) {
      const next = this.waypoints.shift();
      this.targetPos.copy(next);
    } else if (dist < 0.4 && this.waypoints.length === 0 && this.onPathComplete) {
      const cb = this.onPathComplete;
      this.onPathComplete = null;
      cb();
    }

    // Animación sutil de respiración o balanceo al caminar
    if (dist > 0.1) {
      this.group.position.y = Math.sin(Date.now() * 0.015) * 0.08;
      // Rotar suavemente hacia la dirección de movimiento
      const diff = new THREE.Vector3().subVectors(this.targetPos, this.group.position);
      if (diff.length() > 0.05) {
        this.group.rotation.y = Math.atan2(diff.x, diff.z);
      }
    } else {
      this.group.position.y = 0;
    }
  }

  destroy() {
    if (this.tagSprite && this.tagSprite.material.map) {
      this.tagSprite.material.map.dispose();
    }
  }
}
