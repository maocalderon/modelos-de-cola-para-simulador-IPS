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
    const tileCanvas = document.createElement("canvas");
    tileCanvas.width = 256;
    tileCanvas.height = 256;
    const tileCtx = tileCanvas.getContext("2d");
    tileCtx.fillStyle = "#edf2ef";
    tileCtx.fillRect(0, 0, 256, 256);
    tileCtx.strokeStyle = "#d1dedb";
    tileCtx.lineWidth = 3;
    for (let line = 0; line <= 256; line += 64) {
      tileCtx.beginPath(); tileCtx.moveTo(line, 0); tileCtx.lineTo(line, 256); tileCtx.stroke();
      tileCtx.beginPath(); tileCtx.moveTo(0, line); tileCtx.lineTo(256, line); tileCtx.stroke();
    }
    const floorTexture = new THREE.CanvasTexture(tileCanvas);
    floorTexture.wrapS = THREE.RepeatWrapping;
    floorTexture.wrapT = THREE.RepeatWrapping;
    floorTexture.repeat.set(5, 4);
    const floorInteriorMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: floorTexture,
      roughness: 0.42,
      metalness: 0.02
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
    this.buildExitDoor();

    // B. Módulo de Entrega de Fichos (Exterior)
    this.buildTokenKiosk();

    // C. Puestos de la fila exterior de fichos (Guía visual en el suelo)
    this.buildTokenQueueGuides();
    this.buildExteriorLandscaping();

    // D. Sillas de la sala de espera interior
    this.buildWaitingAreaChairs();

    // E. Pantalla Turnero Digital en la pared interior
    this.buildDigitalTurneroScreen();

    // F. Letrero Superior de la IPS
    this.buildClinicSigns();
    this.buildMedicalRoomDetails();
    this.buildNursingStations();
    this.buildCommunityDetails();
    this.buildClubTelevision();
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

    const slidingDoorMaterial = new THREE.MeshPhysicalMaterial({ color: 0xbde8e8, transparent: true, opacity: 0.52, roughness: 0.12 });
    [-1, 1].forEach(side => {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(2.3, 4.5, 0.12), slidingDoorMaterial);
      panel.position.set(side * 2.7, 2.25, 3.95);
      this.scene.add(panel);
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.8, 0.08), new THREE.MeshStandardMaterial({ color: 0x6e8588, metalness: 0.7 }));
      handle.position.set(side * 2.7 - side * 0.78, 2.2, 4.04);
      this.scene.add(handle);
    });

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
    this.backWallMesh = backWall;
    this.scene.add(backWall);

    // Paredes laterales
    const sideWallGeo = new THREE.BoxGeometry(1, 8, 28);
    const leftWallParts = [
      { geometry: new THREE.BoxGeometry(1, 8, 23.2), position: [-21, 4, -12.4] },
      { geometry: new THREE.BoxGeometry(1, 3.3, 4.8), position: [-21, 6.35, 1.6] }
    ];
    this.leftWallParts = leftWallParts.map(({ geometry, position }) => {
      const part = new THREE.Mesh(geometry, wallMat);
      part.position.set(...position);
      part.receiveShadow = true;
      this.scene.add(part);
      return part;
    });

    const rightWall = new THREE.Mesh(sideWallGeo, wallMat);
    rightWall.position.set(21, 4, -10);
    this.rightWallMesh = rightWall;
    this.scene.add(rightWall);
    this.clinicRightEdge = 21;
    this.deskRightEdge = 21;
    this.chairRightEdge = 21;
  }

  buildExitDoor() {
    const doorway = new THREE.Group();
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x53696b, metalness: 0.45, roughness: 0.38 });
    const frameParts = [
      { geometry: new THREE.BoxGeometry(0.2, 4.8, 0.3), position: [-2.35, 2.4, 0] },
      { geometry: new THREE.BoxGeometry(0.2, 4.8, 0.3), position: [2.35, 2.4, 0] },
      { geometry: new THREE.BoxGeometry(4.9, 0.2, 0.3), position: [0, 4.7, 0] }
    ];
    frameParts.forEach(({ geometry, position }) => {
      const piece = new THREE.Mesh(geometry, frameMat);
      piece.position.set(...position);
      doorway.add(piece);
    });

    const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x9ed7d7, transparent: true, opacity: 0.38, roughness: 0.12, transmission: 0.65 });
    [-1, 1].forEach(side => {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(1.25, 4.35, 0.1), glassMat);
      panel.position.set(side * 1.52, 2.28, 0.04);
      doorway.add(panel);
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.75, 0.08), new THREE.MeshStandardMaterial({ color: 0x637e80, metalness: 0.72 }));
      handle.position.set(side * 0.95, 2.25, 0.12);
      doorway.add(handle);
    });
    doorway.rotation.y = Math.PI / 2;
    doorway.position.set(-20.48, 0, 1.6);
    this.scene.add(doorway);
    this.exitDoor = doorway;

    const exitSign = this.createTextSprite("SALIDA", "#ffffff", "#14815c", "#b9e4d3", 26);
    exitSign.rotation.y = Math.PI / 2;
    exitSign.position.set(-20.15, 5.25, 1.6);
    this.scene.add(exitSign);
  }

  expandClinicToRight(edge) {
    this.clinicRightEdge = Math.max(21, edge);
    const width = this.clinicRightEdge + 21;
    if (this.floorInteriorMesh) {
      this.floorInteriorMesh.scale.x = width / 42;
      this.floorInteriorMesh.position.x = (this.clinicRightEdge - 21) / 2;
    }
    if (this.backWallMesh) {
      this.backWallMesh.scale.x = width / 42;
      this.backWallMesh.position.x = (this.clinicRightEdge - 21) / 2;
    }
    if (this.rightWallMesh) this.rightWallMesh.position.x = this.clinicRightEdge;
    if (this.rightWallExtinguisher) this.rightWallExtinguisher.position.x = this.clinicRightEdge - 0.65;
    (this.rightCornerPlants || []).forEach(plant => { plant.position.x = this.clinicRightEdge - 2.5; });
    if (this.rightWallStretcher) this.rightWallStretcher.position.x = this.clinicRightEdge - 0.45;
    if (this.clubTV) this.clubTV.position.x = this.clinicRightEdge - 0.7;
    if (this.rightNursingBay) this.rightNursingBay.position.x = this.clinicRightEdge - 4.0;
    if (this.rightWaterCooler) this.rightWaterCooler.position.x = this.clinicRightEdge - 1.35;
    if (this.rightWheelchairCare) this.rightWheelchairCare.position.x = this.clinicRightEdge - 7;
    if (this.publicHealthBoard) this.publicHealthBoard.position.x = this.clinicRightEdge - 0.4;
    if (this.publicHealthGroup) this.publicHealthGroup.position.x = this.clinicRightEdge;
    if (this.pinkyPortrait) this.pinkyPortrait.position.x = this.clinicRightEdge - 0.4;
  }

  resetClinicLayout() {
    this.deskRightEdge = 21;
    this.chairRightEdge = 21;
    this.expandClinicToRight(21);
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

  buildExteriorLandscaping() {
    const paverCanvas = document.createElement("canvas");
    paverCanvas.width = 256;
    paverCanvas.height = 256;
    const paverCtx = paverCanvas.getContext("2d");
    paverCtx.fillStyle = "#cbd5d3";
    paverCtx.fillRect(0, 0, 256, 256);
    paverCtx.strokeStyle = "#aab8b6";
    paverCtx.lineWidth = 5;
    for (let y = 0; y <= 256; y += 64) {
      paverCtx.beginPath();
      paverCtx.moveTo(0, y);
      paverCtx.lineTo(256, y);
      paverCtx.stroke();
    }
    for (let row = 0; row < 4; row++) {
      const offset = row % 2 ? 0 : 32;
      for (let x = offset; x <= 256; x += 64) {
        paverCtx.beginPath();
        paverCtx.moveTo(x, row * 64);
        paverCtx.lineTo(x, (row + 1) * 64);
        paverCtx.stroke();
      }
    }
    const paverTexture = new THREE.CanvasTexture(paverCanvas);
    paverTexture.wrapS = THREE.RepeatWrapping;
    paverTexture.wrapT = THREE.RepeatWrapping;
    paverTexture.repeat.set(6, 9);
    const walkway = new THREE.Mesh(
      new THREE.PlaneGeometry(25, 22),
      new THREE.MeshStandardMaterial({ map: paverTexture, roughness: 0.88 })
    );
    walkway.rotation.x = -Math.PI / 2;
    walkway.position.set(0, 0.025, 16.5);
    walkway.receiveShadow = true;
    this.scene.add(walkway);

    const parking = new THREE.Mesh(
      new THREE.PlaneGeometry(8.2, 24),
      new THREE.MeshStandardMaterial({ color: 0x879392, roughness: 0.92 })
    );
    parking.rotation.x = -Math.PI / 2;
    parking.position.set(17, 0.03, 15.5);
    parking.receiveShadow = true;
    this.scene.add(parking);
    const parkingLineMat = new THREE.MeshStandardMaterial({ color: 0xf5f6e9, roughness: 0.85 });
    [-4.0, 4.0].forEach(offset => {
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.025, 23.4), parkingLineMat);
      line.position.set(17 + offset, 0.055, 15.5);
      this.scene.add(line);
    });
    [4.0, 27.0].forEach(z => {
      const line = new THREE.Mesh(new THREE.BoxGeometry(8.05, 0.025, 0.09), parkingLineMat);
      line.position.set(17, 0.055, z);
      this.scene.add(line);
    });

    const grassCanvas = document.createElement("canvas");
    grassCanvas.width = 256;
    grassCanvas.height = 256;
    const grassCtx = grassCanvas.getContext("2d");
    grassCtx.fillStyle = "#4e9b60";
    grassCtx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 900; i++) {
      const hue = i % 3 === 0 ? "#6aad63" : i % 3 === 1 ? "#397e50" : "#80b96a";
      grassCtx.strokeStyle = hue;
      grassCtx.lineWidth = 1.5;
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      grassCtx.beginPath();
      grassCtx.moveTo(x, y);
      grassCtx.lineTo(x + (Math.random() - 0.5) * 4, y - 4 - Math.random() * 7);
      grassCtx.stroke();
    }
    const grassTexture = new THREE.CanvasTexture(grassCanvas);
    grassTexture.wrapS = THREE.RepeatWrapping;
    grassTexture.wrapT = THREE.RepeatWrapping;
    grassTexture.repeat.set(5, 8);
    const grassMaterial = new THREE.MeshStandardMaterial({ map: grassTexture, roughness: 1 });
    const garden = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 22), grassMaterial);
    garden.rotation.x = -Math.PI / 2;
    garden.position.set(-18, 0.035, 15.5);
    garden.receiveShadow = true;
    this.scene.add(garden);

    const bedEdgeMat = new THREE.MeshStandardMaterial({ color: 0xd7e0d5, roughness: 0.8 });
    [-20.65, -15.35].forEach(x => {
      const edging = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 22), bedEdgeMat);
      edging.position.set(x, 0.09, 15.5);
      this.scene.add(edging);
    });

    const bushMat = new THREE.MeshStandardMaterial({ color: 0x27764c, roughness: 0.92 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x69ae60, roughness: 0.9 });
    [-1, 1].forEach(side => {
      const shrub = new THREE.Group();
      [-0.38, 0, 0.38].forEach((offset, index) => {
        const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), index === 1 ? leafMat : bushMat);
        bush.position.set(offset, 0.48 + (index === 1 ? 0.08 : 0), 0);
        shrub.add(bush);
      });
      shrub.position.set(-18, 0, side < 0 ? 7.2 : 23.8);
      this.scene.add(shrub);
    });
    [10.0, 15.5, 21.0].forEach(z => {
      const planter = new THREE.Group();
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.34, 0.55, 12), new THREE.MeshStandardMaterial({ color: 0xb86f4a, roughness: 0.9 }));
      pot.position.y = 0.28;
      planter.add(pot);
      const shrub = new THREE.Mesh(new THREE.IcosahedronGeometry(0.46, 1), bushMat);
      shrub.position.y = 0.78;
      planter.add(shrub);
      planter.position.set(-13.8, 0, z);
      this.scene.add(planter);
    });

    // Planta ornamental en el jardín exterior, junto al acceso peatonal.
    const exteriorPlant = new THREE.Group();
    const terracottaMat = new THREE.MeshStandardMaterial({ color: 0xc47752, roughness: 0.88 });
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.46, 0.72, 16), terracottaMat);
    pot.position.y = 0.36;
    pot.castShadow = true;
    exteriorPlant.add(pot);

    const soil = new THREE.Mesh(
      new THREE.CylinderGeometry(0.53, 0.53, 0.06, 16),
      new THREE.MeshStandardMaterial({ color: 0x493526, roughness: 1 })
    );
    soil.position.y = 0.72;
    exteriorPlant.add(soil);

    const leafMats = [
      new THREE.MeshStandardMaterial({ color: 0x27764c, roughness: 0.82, side: THREE.DoubleSide }),
      new THREE.MeshStandardMaterial({ color: 0x4f9b58, roughness: 0.82, side: THREE.DoubleSide }),
      new THREE.MeshStandardMaterial({ color: 0x71ad5c, roughness: 0.82, side: THREE.DoubleSide })
    ];
    const stemMat = new THREE.MeshStandardMaterial({ color: 0x3b7546, roughness: 0.9 });
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 1.05, 8), stemMat);
    stem.position.y = 1.22;
    exteriorPlant.add(stem);

    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), leafMats[i % leafMats.length]);
      leaf.scale.set(0.42, 1.35, 0.12);
      leaf.position.set(Math.cos(angle) * 0.48, 1.55 + (i % 2) * 0.08, Math.sin(angle) * 0.48);
      leaf.rotation.z = Math.cos(angle) * 0.72;
      leaf.rotation.x = Math.sin(angle) * 0.72;
      leaf.castShadow = true;
      exteriorPlant.add(leaf);
    }
    exteriorPlant.position.set(-18, 0, 15.5);
    this.scene.add(exteriorPlant);

    this.buildAmbulance(17, 9.5);
    this.buildAmbulance(17, 19.2);
  }

  buildAmbulance(x, z) {
    const ambulance = new THREE.Group();
    const white = new THREE.MeshStandardMaterial({ color: 0xf7fbf8, roughness: 0.48, metalness: 0.05 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x427681, roughness: 0.2, metalness: 0.25 });
    const red = new THREE.MeshStandardMaterial({ color: 0xd72d38, roughness: 0.42 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x263238, roughness: 0.8 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.25, 1.28, 6.2), white);
    body.position.y = 1.12;
    body.castShadow = true;
    ambulance.add(body);
    const patientCab = new THREE.Mesh(new THREE.BoxGeometry(3.08, 1.18, 4.05), white);
    patientCab.position.set(0, 2.22, -0.62);
    patientCab.castShadow = true;
    ambulance.add(patientCab);
    const hood = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.48, 1.72), white);
    hood.position.set(0, 1.78, 2.15);
    ambulance.add(hood);
    const windshield = new THREE.Mesh(new THREE.BoxGeometry(2.52, 0.78, 0.06), glass);
    windshield.position.set(0, 2.32, 3.04);
    ambulance.add(windshield);
    [-1, 1].forEach(side => {
      const sideStripe = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.25, 4.65), red);
      sideStripe.position.set(side * 1.63, 1.22, -0.25);
      ambulance.add(sideStripe);
      const sideWindow = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.62, 1.18), glass);
      sideWindow.position.set(side * 1.57, 2.52, 1.38);
      ambulance.add(sideWindow);
      [-1, 1].forEach(wheelPos => {
        const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.17, 10, 20), dark);
        wheel.rotation.y = Math.PI / 2;
        wheel.position.set(side * 1.62, 0.55, wheelPos * 2.0);
        ambulance.add(wheel);
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.16, 12), new THREE.MeshStandardMaterial({ color: 0xb9c3c1, metalness: 0.65 }));
        hub.rotation.z = Math.PI / 2;
        hub.position.set(side * 1.64, 0.55, wheelPos * 2.0);
        ambulance.add(hub);
      });
      const cross = new THREE.Group();
      const vertical = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.72, 0.18), red);
      const horizontal = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.72), red);
      cross.add(vertical, horizontal);
      cross.position.set(side * 1.66, 2.22, -0.62);
      ambulance.add(cross);
    });
    [-1.05, 1.05].forEach(side => {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.3, 0.12), new THREE.MeshStandardMaterial({ color: 0xffe6b0, emissive: 0x664411 }));
      lamp.position.set(side, 1.78, 3.05);
      ambulance.add(lamp);
    });
    const lightbar = new THREE.Group();
    [-0.48, 0.48].forEach((offset, index) => {
      const light = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.22, 0.34), new THREE.MeshStandardMaterial({ color: index ? 0x1688d4 : 0xe3323d, emissive: index ? 0x063459 : 0x541014 }));
      light.position.x = offset;
      lightbar.add(light);
    });
    lightbar.position.set(0, 2.98, 1.5);
    ambulance.add(lightbar);
    ambulance.position.set(x, 0, z);
    this.scene.add(ambulance);
  }

  buildWaitingAreaChairs(numChairs = 30, extraChairs = 0) {
    // Si ya existían sillas anteriores, se eliminan del escenario para regenerarlas exactamente igual al número de tickets
    if (this.chairGroupMesh) {
      this.scene.remove(this.chairGroupMesh);
    }
    this.waitingChairs = [];
    this.chairGroupMesh = new THREE.Group();

    const wingColumns = Math.ceil(Math.max(0, numChairs - 30) / 5);
    const lastWingChairX = wingColumns ? 13.4 + (wingColumns - 1) * 2.4 : 0;
    this.chairRightEdge = Math.max(21, lastWingChairX + 10);
    this.expandClinicToRight(Math.max(this.deskRightEdge, this.chairRightEdge));

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
        x = 13.4 + wingCol * 2.4;
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
      singleChair.rotation.y = Math.PI;
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

    const firstDeskX = -8;
    const spacing = 8;
    const rightmostDeskX = firstDeskX + (numServers - 1) * spacing;
    const addedDeskWing = 21 + Math.max(0, numServers - 3) * 8;
    this.deskRightEdge = Math.max(21, rightmostDeskX + 5, addedDeskWing);
    this.expandClinicToRight(Math.max(this.deskRightEdge, this.chairRightEdge));

    for (let i = 1; i <= numServers; i++) {
      const deskGroup = new THREE.Group();
      const x = firstDeskX + (i - 1) * spacing;
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

      const deskFront = new THREE.Mesh(
        new THREE.BoxGeometry(3.12, 1.15, 0.12),
        new THREE.MeshStandardMaterial({ color: 0x32b7ad, roughness: 0.38 })
      );
      deskFront.position.set(0, 0.9, 0.82);
      deskGroup.add(deskFront);
      const frontCross = this.createRedCross(0.42, 0.42);
      frontCross.position.set(0, 0.92, 0.9);
      deskGroup.add(frontCross);

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
      rec.position.set(0, 1.4, -0.9);
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
    const bodyGeo = new THREE.CylinderGeometry(0.38, 0.42, 1.2, 16);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.8;
    group.add(body);

    const scrubPanel = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.62, 0.04),
      new THREE.MeshStandardMaterial({ color: 0x0c8b89 })
    );
    scrubPanel.position.set(0, 0.82, 0.39);
    group.add(scrubPanel);

    // Cabeza
    const headGeo = new THREE.SphereGeometry(0.26, 16, 16);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xfed7aa });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.6;
    group.add(head);

    const hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.27, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.52),
      new THREE.MeshStandardMaterial({ color: 0x49352c })
    );
    hair.position.set(0, 1.72, -0.03);
    group.add(hair);

    const armGeo = new THREE.CylinderGeometry(0.1, 0.12, 0.78, 10);
    const armMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc });
    [-1, 1].forEach(side => {
      const arm = new THREE.Mesh(armGeo, armMat);
      arm.position.set(side * 0.43, 0.72, 0.06);
      arm.rotation.z = side * -0.48;
      group.add(arm);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 10), headMat);
      hand.position.set(side * 0.61, 0.4, 0.12);
      group.add(hand);
    });

    const badge = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.28, 0.04),
      new THREE.MeshStandardMaterial({ color: 0x0c8b89 })
    );
    badge.position.set(0.2, 1.0, 0.4);
    group.add(badge);

    return group;
  }

  buildDigitalTurneroScreen() {
    // Pantalla LED en la pared frontal interior de la sala
    const screenGeo = new THREE.BoxGeometry(8.4, 4.9, 0.42);
    const screenMat = new THREE.MeshStandardMaterial({
      color: 0x050811,
      metalness: 0.8,
      roughness: 0.2
    });
    this.turneroScreenMesh = new THREE.Mesh(screenGeo, screenMat);
    this.turneroScreenMesh.position.set(0, 6.2, -23.15);
    this.scene.add(this.turneroScreenMesh);

    const lowerBezel = new THREE.Mesh(
      new THREE.BoxGeometry(8.1, 0.18, 0.18),
      new THREE.MeshStandardMaterial({ color: 0x27343d, metalness: 0.6, roughness: 0.3 })
    );
    lowerBezel.position.set(0, -2.32, 0.24);
    this.turneroScreenMesh.add(lowerBezel);

    // Canvas dinámico para dibujar el Turnero en 3D
    this.turneroCanvas = document.createElement("canvas");
    this.turneroCanvas.width = 512;
    this.turneroCanvas.height = 288;
    this.turneroTexture = new THREE.CanvasTexture(this.turneroCanvas);

    const displayMat = new THREE.MeshBasicMaterial({ map: this.turneroTexture });
    const displayFace = new THREE.Mesh(new THREE.PlaneGeometry(7.8, 4.3), displayMat);
    displayFace.position.set(0, 0, 0.23);
    this.turneroScreenMesh.add(displayFace);

    this.updateTurneroScreen("SALA DE ESPERA", "07:00 AM", "INGRESO · ATENCIÓN 08:00 AM");
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
    const name = this.createTextSprite("IPS Viva Salud Integral", "#ffffff", "#087f8c", null, 27);
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
    wallCross.position.set(-19.4, 5.1, -23.35);
    this.scene.add(wallCross);
  }

  createRedCross(width, height) {
    const cross = new THREE.Group();
    const red = new THREE.MeshStandardMaterial({ color: 0xd9363e, roughness: 0.4 });
    const vertical = new THREE.Mesh(new THREE.BoxGeometry(width * 0.3, height, 0.08), red);
    const horizontal = new THREE.Mesh(new THREE.BoxGeometry(width, height * 0.3, 0.08), red);
    cross.add(vertical, horizontal);
    return cross;
  }

  createSpinalStretcher(side, wallX) {
    const stretcher = new THREE.Group();
    const outline = new THREE.Shape();
    outline.moveTo(-0.48, -2.0);
    outline.quadraticCurveTo(-0.62, -2.0, -0.62, -1.82);
    outline.lineTo(-0.62, 1.82);
    outline.quadraticCurveTo(-0.62, 2.0, -0.44, 2.0);
    outline.lineTo(0.44, 2.0);
    outline.quadraticCurveTo(0.62, 2.0, 0.62, 1.82);
    outline.lineTo(0.62, -1.82);
    outline.quadraticCurveTo(0.62, -2.0, 0.44, -2.0);
    outline.closePath();

    const board = new THREE.Mesh(
      new THREE.ExtrudeGeometry(outline, { depth: 0.12, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.05, bevelThickness: 0.04 }),
      new THREE.MeshStandardMaterial({ color: 0xf04426, roughness: 0.58 })
    );
    board.position.z = -0.06;
    stretcher.add(board);

    const strapMat = new THREE.MeshStandardMaterial({ color: 0x16191b, roughness: 0.75 });
    const reflectiveMat = new THREE.MeshStandardMaterial({ color: 0xc8f225, emissive: 0x52610a, emissiveIntensity: 0.3 });
    const strapPositions = [-1.35, 0.15, 1.35];
    strapPositions.forEach(y => {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.2, 0.08), strapMat);
      strap.position.set(0, y, 0.2);
      stretcher.add(strap);
    });

    const centerBelt = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.15, 0.08), strapMat);
    centerBelt.position.set(0, -0.68, 0.2);
    stretcher.add(centerBelt);
    const reflectiveStrip = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.2, 0.04), reflectiveMat);
    reflectiveStrip.position.set(0.15, -0.68, 0.25);
    stretcher.add(reflectiveStrip);

    [-0.34, 0.34].forEach(x => {
      const shoulder = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.05, 0.09), strapMat);
      shoulder.position.set(x, 1.28, 0.22);
      shoulder.rotation.z = x < 0 ? -0.35 : 0.35;
      stretcher.add(shoulder);
      const highVis = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.46, 0.04), reflectiveMat);
      highVis.position.set(x * 0.82, 1.12, 0.28);
      highVis.rotation.z = shoulder.rotation.z;
      stretcher.add(highVis);
    });

    stretcher.rotation.y = side === 1 ? -Math.PI / 2 : Math.PI / 2;
    stretcher.position.set(wallX, 2.55, -10);
    return stretcher;
  }

  buildMedicalRoomDetails() {
    const equipment = new THREE.Group();
    const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55 });
    const red = new THREE.MeshStandardMaterial({ color: 0xd9363e, roughness: 0.45 });

    [-17, 17].forEach(x => {
      const cabinet = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.25, 0.32), white);
      cabinet.add(box);
      const cross = this.createRedCross(0.62, 0.62);
      cross.position.z = 0.2;
      cabinet.add(cross);
      cabinet.position.set(x, 4.25, -23.25);
      equipment.add(cabinet);
    });

    const emergencySign = new THREE.Group();
    const signPlate = new THREE.Mesh(new THREE.BoxGeometry(2.1, 2.1, 0.18), white);
    const emergencyCross = this.createRedCross(1.2, 1.2);
    emergencyCross.position.z = 0.14;
    emergencySign.add(signPlate, emergencyCross);
    emergencySign.position.set(11, 5.3, -23.25);
    equipment.add(emergencySign);

    [-1, 1].forEach((side, index) => {
      const extinguisher = new THREE.Group();
      const wallMount = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 1.95, 0.82),
        new THREE.MeshStandardMaterial({ color: 0xd8e0e4, metalness: 0.35, roughness: 0.5 })
      );
      wallMount.position.set(side * 0.55, 0.95, 0);
      extinguisher.add(wallMount);
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, 1.5, 16), red);
      tank.position.y = 0.85;
      extinguisher.add(tank);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.3, 12), new THREE.MeshStandardMaterial({ color: 0x283744, metalness: 0.5 }));
      top.position.set(0.08, 1.72, 0);
      extinguisher.add(top);
      const hose = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.045, 8, 20, Math.PI), new THREE.MeshStandardMaterial({ color: 0x283744 }));
      hose.position.set(0.23, 1.25, 0.12);
      hose.rotation.z = Math.PI / 2;
      extinguisher.add(hose);
      extinguisher.position.set(side === -1 ? -20.35 : this.clinicRightEdge - 0.65, 2.8, side === -1 ? -5 : 2.5);
      if (side === 1) {
        extinguisher.rotation.y = -Math.PI / 2;
        this.rightWallExtinguisher = extinguisher;
      }
      equipment.add(extinguisher);
    });

    const leftStretcher = this.createSpinalStretcher(-1, -20.45);
    leftStretcher.position.z = -8.8;
    this.rightWallStretcher = this.createSpinalStretcher(1, this.clinicRightEdge - 0.45);
    this.rightWallStretcher.position.z = -17.35;
    equipment.add(leftStretcher, this.rightWallStretcher);

    const addPlant = (x, z, isRightCorner = false) => {
      const plant = new THREE.Group();
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.42, 0.75, 16), new THREE.MeshStandardMaterial({ color: 0xd18b58, roughness: 0.8 }));
      pot.position.y = 0.38;
      plant.add(pot);
      const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.08, 16), new THREE.MeshStandardMaterial({ color: 0x493b2b }));
      soil.position.y = 0.78;
      plant.add(soil);
      const stemMat = new THREE.MeshStandardMaterial({ color: 0x397b53 });
      const leafMat = new THREE.MeshStandardMaterial({ color: 0x49a66b, roughness: 0.7 });
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.5, 8), stemMat);
      stem.position.y = 1.55;
      plant.add(stem);
      for (let i = 0; i < 7; i++) {
        const angle = i * Math.PI * 2 / 7;
        const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), leafMat);
        leaf.scale.set(0.72, 1.4, 0.62);
        leaf.position.set(Math.cos(angle) * 0.38, 1.2 + (i % 3) * 0.34, Math.sin(angle) * 0.38);
        plant.add(leaf);
      }
      plant.position.set(x, 0, z);
      equipment.add(plant);
      if (isRightCorner) {
        this.rightCornerPlants = this.rightCornerPlants || [];
        this.rightCornerPlants.push(plant);
      }
    };
    addPlant(-18.2, -1.0);
    addPlant(this.clinicRightEdge - 2.5, 1.1, true);
    addPlant(-18.5, -22.2);
    addPlant(this.clinicRightEdge - 2.5, -22.2, true);
    this.scene.add(equipment);
  }

  buildNursingStations() {
    this.workingNurses = [];
    const buildBay = (x, side) => {
      const bay = new THREE.Group();
      const bedFrame = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.42, 1.35), new THREE.MeshStandardMaterial({ color: 0x86a0a4, metalness: 0.35 }));
      bedFrame.position.y = 0.72;
      bay.add(bedFrame);
      const mattress = new THREE.Mesh(new THREE.BoxGeometry(2.85, 0.22, 1.28), new THREE.MeshStandardMaterial({ color: 0xfafcfb, roughness: 0.85 }));
      mattress.position.y = 1.02;
      bay.add(mattress);
      const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.18, 0.9), new THREE.MeshStandardMaterial({ color: 0xd9f0ed }));
      pillow.position.set(0.98, 1.22, 0);
      bay.add(pillow);
      const patientBody = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 1.35, 12), new THREE.MeshStandardMaterial({ color: 0x6d8ca3 }));
      patientBody.rotation.z = Math.PI / 2;
      patientBody.position.set(-0.05, 1.35, 0);
      bay.add(patientBody);
      const patientHead = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 12), new THREE.MeshStandardMaterial({ color: 0xe7b98f }));
      patientHead.position.set(0.92, 1.4, 0);
      bay.add(patientHead);
      const blanket = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.16, 1.2), new THREE.MeshStandardMaterial({ color: 0xb9e4df }));
      blanket.position.set(-0.55, 1.47, 0);
      bay.add(blanket);

      const nurse = new THREE.Group();
      const uniform = new THREE.MeshStandardMaterial({ color: 0xf8ffff, roughness: 0.78 });
      const skin = new THREE.MeshStandardMaterial({ color: 0xe7b98f });
      const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.42, 1.25, 14), uniform);
      torso.position.y = 1.28;
      nurse.add(torso);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 14, 12), skin);
      head.position.y = 2.12;
      nurse.add(head);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.12, 14), new THREE.MeshStandardMaterial({ color: 0xffffff }));
      cap.position.y = 2.36;
      nurse.add(cap);
      const redCross = this.createRedCross(0.22, 0.22);
      redCross.position.set(0, 2.37, 0.04);
      nurse.add(redCross);
      const workingArms = [];
      [-1, 1].forEach(armSide => {
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.8, 10), uniform);
        arm.position.set(armSide * 0.42, 1.12, 0.25);
        arm.rotation.z = armSide * 0.42;
        nurse.add(arm);
        workingArms.push(arm);
      });
      const trousers = new THREE.MeshStandardMaterial({ color: 0x188c91 });
      [-0.16, 0.16].forEach(legSide => {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.8, 10), trousers);
        leg.position.set(legSide, 0.42, 0);
        nurse.add(leg);
      });
      nurse.position.set(side * 2.25, 0, 0.2);
      nurse.userData.baseZ = nurse.position.z;
      bay.add(nurse);

      const assistant = nurse.clone(true);
      assistant.scale.setScalar(0.84);
      assistant.position.set(side * 3.25, 0, -0.72);
      assistant.userData.baseZ = assistant.position.z;
      bay.add(assistant);
      nurse.userData.workArms = workingArms;
      nurse.userData.workArmRest = workingArms.map(arm => arm.rotation.z);
      nurse.userData.workArmAmplitude = 0.2;
      assistant.userData.workArms = assistant.children.slice(4, 6);
      assistant.userData.workArmRest = assistant.userData.workArms.map(arm => arm.rotation.z);
      assistant.userData.workArmAmplitude = 0.2;
      this.workingNurses.push(nurse, assistant);

      const curtainMat = new THREE.MeshStandardMaterial({ color: 0x8bcac2, transparent: true, opacity: 0.72, side: THREE.DoubleSide });
      const curtain = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.5, 0.06), curtainMat);
      curtain.position.set(0, 2.0, 1.45);
      bay.add(curtain);
      const curtainRail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.6, 10), new THREE.MeshStandardMaterial({ color: 0xc2d0d2, metalness: 0.45 }));
      curtainRail.rotation.z = Math.PI / 2;
      curtainRail.position.set(0, 3.3, 1.45);
      bay.add(curtainRail);
      for (let fold = -1; fold <= 1; fold++) {
        const pleat = new THREE.Mesh(new THREE.BoxGeometry(0.035, 2.35, 0.1), new THREE.MeshStandardMaterial({ color: 0xc5e7e2, transparent: true, opacity: 0.7 }));
        pleat.position.set(fold * 0.8, 2.0, 1.49);
        bay.add(pleat);
      }

      const monitorStand = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.8, 10), new THREE.MeshStandardMaterial({ color: 0x70858a, metalness: 0.4 }));
      monitorStand.position.set(-side * 2.8, 0.55, -0.55);
      bay.add(monitorStand);
      const monitor = new THREE.Group();
      const monitorFrame = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.78, 0.14), new THREE.MeshStandardMaterial({ color: 0x26373b, metalness: 0.4 }));
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.62), new THREE.MeshBasicMaterial({ color: 0x123c42 }));
      screen.position.z = 0.08;
      monitor.add(monitorFrame, screen);
      const trace = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.025, 0.02), new THREE.MeshBasicMaterial({ color: 0x5becb2 }));
      trace.position.set(0, -0.08, 0.1);
      monitor.add(trace);
      monitor.position.set(-side * 2.8, 1.25, -0.55);
      bay.add(monitor);

      const cart = new THREE.Group();
      const cartTop = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.1, 0.7), new THREE.MeshStandardMaterial({ color: 0xf5f8f7, metalness: 0.2 }));
      cartTop.position.y = 1.05;
      cart.add(cartTop);
      const cartPost = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.85, 0.55), new THREE.MeshStandardMaterial({ color: 0xdce7e5 }));
      cartPost.position.y = 0.56;
      cart.add(cartPost);
      [0, 1, 2].forEach(toolIndex => {
        const vial = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.32, 10), new THREE.MeshStandardMaterial({ color: toolIndex === 1 ? 0x3ea9bf : 0xe6f4f1, transparent: true, opacity: 0.85 }));
        vial.position.set(-0.24 + toolIndex * 0.24, 1.28, 0);
        cart.add(vial);
      });
      cart.position.set(side * 2.8, 0, -0.65);
      bay.add(cart);
      bay.position.set(x, 0, -16.3);
      this.scene.add(bay);
      return bay;
    };

    this.leftNursingBay = buildBay(-17.5, -1);
    this.rightNursingBay = buildBay(this.clinicRightEdge - 4.0, 1);
    this.rightNursingBay.position.z = -20.2;
  }

  buildCommunityDetails() {
    const care = new THREE.Group();
    const wheelMetal = new THREE.MeshStandardMaterial({ color: 0x73888c, metalness: 0.45 });
    const chairMat = new THREE.MeshStandardMaterial({ color: 0xe74835 });
    [-0.48, 0.48].forEach(x => {
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.055, 10, 22), wheelMetal);
      wheel.rotation.y = Math.PI / 2;
      wheel.position.set(x, 0.5, 0);
      care.add(wheel);
    });
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.12, 0.72), chairMat);
    seat.position.set(0, 0.55, 0);
    care.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.82, 0.12), chairMat);
    back.position.set(0, 0.98, -0.34);
    care.add(back);
    const patientTorso = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.34, 0.9, 12), new THREE.MeshStandardMaterial({ color: 0x4e87aa }));
    patientTorso.position.set(0, 1.42, -0.06);
    care.add(patientTorso);
    const patientHead = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), new THREE.MeshStandardMaterial({ color: 0xe9bd98 }));
    patientHead.position.set(0, 2.06, -0.08);
    care.add(patientHead);

    const nurse = new THREE.Group();
    const coat = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 1.2, 12), new THREE.MeshStandardMaterial({ color: 0xf8ffff }));
    coat.position.y = 1;
    nurse.add(coat);
    const nurseHead = new THREE.Mesh(new THREE.SphereGeometry(0.23, 12, 10), new THREE.MeshStandardMaterial({ color: 0xd9aa83 }));
    nurseHead.position.y = 1.85;
    nurse.add(nurseHead);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.8, 10), new THREE.MeshStandardMaterial({ color: 0xf8ffff }));
    arm.position.set(-0.42, 1.2, 0.32);
    arm.rotation.z = -0.75;
    nurse.add(arm);
    nurse.position.set(1.05, 0, 0.15);
    nurse.userData.baseZ = nurse.position.z;
    care.add(nurse);
    const assistingNurse = nurse.clone(true);
    assistingNurse.scale.setScalar(0.92);
    assistingNurse.position.set(-1.05, 0, 0.3);
    assistingNurse.userData.baseZ = assistingNurse.position.z;
    care.add(assistingNurse);
    care.position.set(-17.7, 0, -7.2);
    this.scene.add(care);

    const rightWheelchairCare = care.clone(true);
    rightWheelchairCare.position.set(this.clinicRightEdge - 7, 0, -7.2);
    this.scene.add(rightWheelchairCare);
    this.rightWheelchairCare = rightWheelchairCare;
    [nurse, assistingNurse, rightWheelchairCare.children[6], rightWheelchairCare.children[7]].forEach(worker => {
      worker.userData.baseZ = worker.position.z;
      worker.userData.workArms = [worker.children[2]];
      worker.userData.workArmRest = [worker.children[2].rotation.z];
      worker.userData.workArmAmplitude = 0.18;
      this.workingNurses.push(worker);
    });

    const cooler = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.55, 0.85), new THREE.MeshStandardMaterial({ color: 0xf7fbfa, roughness: 0.32 }));
    base.position.y = 0.78;
    cooler.add(base);
    const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.88, 16), new THREE.MeshPhysicalMaterial({ color: 0x77cbe0, transparent: true, opacity: 0.62, roughness: 0.15 }));
    bottle.position.y = 2;
    cooler.add(bottle);
    const tap = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.14), new THREE.MeshStandardMaterial({ color: 0x0c8b89 }));
    tap.position.set(0.22, 1.35, 0.49);
    cooler.add(tap);
    const tray = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.24), new THREE.MeshStandardMaterial({ color: 0x8da3a5 }));
    tray.position.set(0.12, 1.02, 0.5);
    cooler.add(tray);
    cooler.position.set(this.clinicRightEdge - 1.35, 0, -1.5);
    this.scene.add(cooler);
    this.rightWaterCooler = cooler;

    const board = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(5.5, 3.0, 0.22), new THREE.MeshStandardMaterial({ color: 0x344b4c, roughness: 0.42, metalness: 0.18 }));
    board.add(frame);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.72 });
    const backing = new THREE.Mesh(new THREE.BoxGeometry(5.22, 2.72, 0.06), mat);
    backing.position.z = 0.13;
    board.add(backing);
    const boardCanvas = document.createElement("canvas");
    boardCanvas.width = 900;
    boardCanvas.height = 460;
    const boardCtx = boardCanvas.getContext("2d");
    boardCtx.fillStyle = "#f7fbfa";
    boardCtx.fillRect(0, 0, boardCanvas.width, boardCanvas.height);
    boardCtx.fillStyle = "#087f83";
    boardCtx.fillRect(0, 0, 900, 34);
    boardCtx.fillStyle = "#0e4248";
    boardCtx.font = "700 82px Arial";
    boardCtx.textAlign = "center";
    boardCtx.fillText("SALUD PÚBLICA", 450, 205);
    boardCtx.fillStyle = "#168b84";
    boardCtx.font = "700 116px Arial";
    boardCtx.fillText("CÚCUTA", 450, 330);
    const boardTexture = new THREE.CanvasTexture(boardCanvas);
    const boardFace = new THREE.Mesh(new THREE.PlaneGeometry(5.04, 2.58), new THREE.MeshBasicMaterial({ map: boardTexture }));
    boardFace.position.z = 0.17;
    board.add(boardFace);
    board.rotation.y = -Math.PI / 2;
    board.position.set(this.clinicRightEdge - 0.4, 4.45, -13.4);
    this.scene.add(board);
    this.publicHealthBoard = board;

    const educator = new THREE.Group();
    const educatorCoat = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 1.25, 12), new THREE.MeshStandardMaterial({ color: 0xf8ffff }));
    educatorCoat.position.y = 1.25;
    educator.add(educatorCoat);
    const educatorHead = new THREE.Mesh(new THREE.SphereGeometry(0.23, 12, 10), new THREE.MeshStandardMaterial({ color: 0xe6b58f }));
    educatorHead.position.y = 2.1;
    educator.add(educatorHead);
    const pointingArm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.95, 10), new THREE.MeshStandardMaterial({ color: 0xf8ffff }));
    pointingArm.position.set(0.48, 1.55, 0.15);
    pointingArm.rotation.z = 1;
    educator.add(pointingArm);
    educator.userData.workArms = [pointingArm];
    educator.userData.workArmRest = [pointingArm.rotation.z];
    educator.userData.workArmAmplitude = 0.1;
    educator.position.set(-3.8, 0, -12.8);
    educator.userData.baseZ = educator.position.z;
    const publicHealthGroup = new THREE.Group();
    publicHealthGroup.position.x = this.clinicRightEdge;
    publicHealthGroup.add(educator);
    this.workingNurses.push(educator);

    [-7.0, -5.6].forEach((x, index) => {
      const attendee = new THREE.Group();
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, 1.2, 12), new THREE.MeshStandardMaterial({ color: index ? 0x8b6aa8 : 0x3f89a1 }));
      top.position.y = 1.05;
      attendee.add(top);
      const face = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), new THREE.MeshStandardMaterial({ color: 0xe9bd98 }));
      face.position.y = 1.85;
      attendee.add(face);
      attendee.position.set(x, 0, -12.6 - index * 1.0);
      publicHealthGroup.add(attendee);
    });
    this.scene.add(publicHealthGroup);
    this.publicHealthGroup = publicHealthGroup;

    const portrait = new THREE.Group();
    const portraitFrame = new THREE.Mesh(new THREE.BoxGeometry(4.85, 5.0, 0.28), new THREE.MeshStandardMaterial({ color: 0x263b3d, roughness: 0.32, metalness: 0.32 }));
    portrait.add(portraitFrame);
    const mount = new THREE.Mesh(new THREE.BoxGeometry(4.52, 4.68, 0.06), new THREE.MeshStandardMaterial({ color: 0xf3f4ef, roughness: 0.92 }));
    mount.position.z = 0.17;
    portrait.add(mount);
    const photoTexture = new THREE.TextureLoader().load("/static/img/pinky-retrato.jpg");
    photoTexture.encoding = THREE.sRGBEncoding;
    const photo = new THREE.Mesh(new THREE.PlaneGeometry(4.28, 4.28), new THREE.MeshBasicMaterial({ map: photoTexture }));
    photo.position.z = 0.21;
    portrait.add(photo);
    portrait.rotation.y = -Math.PI / 2;
    portrait.position.set(this.clinicRightEdge - 0.4, 5.0, -7.7);
    this.scene.add(portrait);
    this.pinkyPortrait = portrait;
  }

  buildClubTelevision() {
    const tv = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(5.3, 3.4, 0.28), new THREE.MeshStandardMaterial({ color: 0x26343a, metalness: 0.65, roughness: 0.25 }));
    tv.add(frame);

    this.clubTVCanvas = document.createElement("canvas");
    this.clubTVCanvas.width = 640;
    this.clubTVCanvas.height = 400;
    this.clubTVContext = this.clubTVCanvas.getContext("2d");
    this.clubTVTexture = new THREE.CanvasTexture(this.clubTVCanvas);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(5.05, 3.15), new THREE.MeshBasicMaterial({ map: this.clubTVTexture }));
    screen.position.z = 0.16;
    tv.add(screen);

    const foot = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.18, 0.42), new THREE.MeshStandardMaterial({ color: 0x35464c, metalness: 0.5 }));
    foot.position.set(0, -1.83, -0.05);
    tv.add(foot);
    tv.rotation.y = -Math.PI / 2;
    tv.position.set(this.clinicRightEdge - 0.7, 5.0, -2.3);
    this.scene.add(tv);
    this.clubTV = tv;

    this.clubLogo = new Image();
    this.clubLogo.onload = () => this.drawClubTV(performance.now());
    this.clubLogo.src = "/static/img/a-corazon-abierto.webp";
    this.lastClubTVDraw = 0;
    this.drawClubTV(performance.now());
  }

  drawClubTV(now) {
    if (!this.clubTVContext || now - this.lastClubTVDraw < 90) return;
    this.lastClubTVDraw = now;
    const ctx = this.clubTVContext;
    const pulse = 0.88 + Math.sin(now / 360) * 0.12;
    const gradient = ctx.createLinearGradient(0, 0, 640, 400);
    gradient.addColorStop(0, "#160d12");
    gradient.addColorStop(0.52, "#35202a");
    gradient.addColorStop(1, "#101418");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 640, 400);
    ctx.fillStyle = "#d92e36";
    ctx.fillRect(0, 0, 640, 14);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 26px Arial";
    ctx.textAlign = "center";
    ctx.fillText("A CORAZÓN ABIERTO", 320, 48);
    if (this.clubLogo && this.clubLogo.complete && this.clubLogo.naturalWidth) {
      const size = 360 * pulse;
      ctx.drawImage(this.clubLogo, 320 - size / 2, 170 - size / 2, size, size);
    }
    ctx.fillStyle = "#d5e1df";
    ctx.font = "bold 18px Arial";
    ctx.fillText("HOSPITAL SANTA MARÍA · DRAMA MÉDICO", 320, 345);
    ctx.fillStyle = "#a9c7c2";
    ctx.fillRect(230, 366, 180, 5);
    this.clubTVTexture.needsUpdate = true;
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
    this.drawClubTV(performance.now());
    const motionTime = performance.now() / 700;
    (this.workingNurses || []).forEach((nurse, index) => {
      nurse.rotation.z = Math.sin(motionTime + index) * 0.045;
      nurse.position.z = nurse.userData.baseZ + Math.sin(motionTime * 0.6 + index) * 0.1;
      (nurse.userData.workArms || []).forEach((arm, armIndex) => {
        const rest = nurse.userData.workArmRest[armIndex];
        arm.rotation.z = rest + Math.sin(motionTime * 1.7 + index + armIndex) * (nurse.userData.workArmAmplitude || 0.18);
      });
    });

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

    this.updateTurneroScreen("SALA DE ESPERA", "07:00 AM", "INGRESO · ATENCIÓN 08:00 AM");
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
    this.avatarMeshes = this.group.children.slice();
    this.buildTag();
    this.buildSeatedMesh();
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

  setSeated(seated) {
    this.isSeated = seated;
    this.avatarMeshes.forEach(mesh => {
      if (mesh.geometry && mesh.geometry.type === "RingGeometry") return;
      mesh.visible = !seated;
    });
    this.seatedMeshGroup.visible = seated;
    this.tagSprite.position.y = seated ? 2.55 : 2.9;
  }

  buildSeatedMesh() {
    const seated = new THREE.Group();
    const categoryColors = {
      REGULAR: 0x3b82f6,
      VULNERABLE: 0x8b5cf6,
      ADULTO_MAYOR: 0xf59e0b,
      DISCAPACIDAD: 0x0c8b89,
      EMBARAZADA: 0xec4899
    };
    const clothes = new THREE.MeshStandardMaterial({ color: categoryColors[this.data.category] || 0x3b82f6 });
    const pants = new THREE.MeshStandardMaterial({ color: 0x27394a });
    const skin = new THREE.MeshStandardMaterial({ color: 0xf0c29d });
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.95, 14), clothes);
    torso.position.y = 1.22;
    seated.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 12), skin);
    head.position.y = 1.91;
    seated.add(head);
    const thighGeo = new THREE.CylinderGeometry(0.13, 0.14, 0.64, 10);
    [-0.18, 0.18].forEach(side => {
      const thigh = new THREE.Mesh(thighGeo, pants);
      thigh.rotation.x = Math.PI / 2;
      thigh.position.set(side, 0.82, 0.24);
      seated.add(thigh);
      const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.62, 10), pants);
      shin.position.set(side, 0.38, 0.56);
      seated.add(shin);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.68, 10), clothes);
      arm.position.set(side * 0.43, 1.12, 0.12);
      arm.rotation.z = side < 0 ? -0.42 : 0.42;
      seated.add(arm);
    });
    this.group.add(seated);
    this.seatedMeshGroup = seated;
    seated.visible = false;
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
    this.group.position.lerp(this.targetPos, this.movementFactor || 0.08);

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
      this.group.position.y = this.isSeated ? 0.08 : 0;
    }
  }

  destroy() {
    if (this.tagSprite && this.tagSprite.material.map) {
      this.tagSprite.material.map.dispose();
    }
  }
}
