/* ============================================================
   عالَم الخلية — 3D Cell Scene (Three.js)
   ============================================================
   مسؤوليات الملف:
   - إنشاء المشهد ثلاثي الأبعاد وإدارته.
   - بناء الخلية النباتية والحيوانية وعضياتها.
   - كشف النقر على العضيات (Raycasting).
   - التحكم بالكاميرا (تدوير، تكبير، لمس).
   - إدارة التسميات ثلاثية الأبعاد (HTML overlays).
   - معالجة فشل WebGL وإعادة المحاولة بأمان.
   - تنظيف الموارد عند التبديل بين الخلايا.
   ============================================================ */

class CellScene {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.options = options;
    this.currentCellType = options.initialCell || 'plant';
    this.onOrganelleClick = options.onOrganelleClick || (() => {});
    this.onOrganelleHover = options.onOrganelleHover || (() => {});
    this.onReady = options.onReady || (() => {});
    this.onFailure = options.onFailure || (() => {});

    // حالة التشغيل
    this.paused = false;
    this.showLabels = true;
    this.autoRotate = true;
    this.isReady = false;
    this.isDisposed = false;

    // Three.js core
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.raycaster = null;
    this.mouse = new THREE.Vector2();

    // العضيات والمجموعات
    this.cellGroup = null;
    this.organelleMeshes = []; // { mesh, data, basePosition, baseRotation, baseScale }
    this.particles = null;

    // حالة الكاميرا
    this.targetRotation = { x: 0, y: 0 };
    this.currentRotation = { x: 0, y: 0 };
    this.targetDistance = 14;
    this.currentDistance = 14;

    // حالة السحب/النقر — للتمييز بدقة بين النقرة والسحب
    this.isPointerDown = false;
    this.pointerStartX = 0;
    this.pointerStartY = 0;
    this.pointerLastX = 0;
    this.pointerLastY = 0;
    this.pointerTotalMovement = 0; // مجموع الحركة لتمييز النقرة عن السحب
    this.isDragging = false;
    this.DRAG_THRESHOLD = 6; // عتبة الحركة (px) — فوقها يُعتبر سحبًا
    this.pinchStartDistance = null;
    this.lastPinchDistance = null;

    // التسميات
    this.labelContainer = null;
    this.labels = []; // { element, mesh, offset }

    // الساعة
    this.clock = new THREE.Clock();
    this.animationId = null;
    this.boundResize = this.onResize.bind(this);

    this.init();
  }

  // ========================================
  // التهيئة
  // ========================================
  init() {
    // فحص مكتبة Three.js
    if (typeof THREE === 'undefined') {
      this.fail('مكتبة Three.js غير محمّلة. تحقق من اتصال الإنترنت.');
      return;
    }

    // Scene + Fog
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x0a0e1a, 0.025);

    // Camera
    const aspect = this.getAspectRatio();
    this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 1000);
    this.camera.position.set(0, 0, this.currentDistance);

    // Renderer — مع معالجة فشل WebGL بأمان
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch (err) {
      console.error('WebGL initialization failed:', err);
      this.fail('متصفحك لا يدعم WebGL، أو تعذّر إنشاء سياق الرسم.');
      return;
    }

    // تحقّق إضافي: هل أنشأ العارض سياقًا فعلًا؟
    let gl = null;
    try {
      gl = this.renderer.getContext();
    } catch (err) {
      console.error('getContext failed:', err);
    }
    if (!gl) {
      this.fail('تعذّر الحصول على سياق WebGL من المتصفح.');
      return;
    }

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight, false);
    this.renderer.setClearColor(0x000000, 0);
    if (THREE.SRGBColorSpace !== undefined) {
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    }
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    // Raycaster
    this.raycaster = new THREE.Raycaster();

    // الإضاءة + الجسيمات + الخلية الأولى
    this.setupLights();
    this.createBackgroundParticles();
    this.createLabelContainer();
    this.loadCell(this.currentCellType);

    // الأحداث
    this.setupEventListeners();

    // علم الجاهزية
    this.isReady = true;
    this.onReady();

    // بدء حلقة الرسم
    this.animate();
  }

  fail(message) {
    console.error('[CellScene] Failure:', message);
    this.isReady = false;
    this.onFailure(message);
  }

  // ========================================
  // الإضاءة
  // ========================================
  setupLights() {
    const ambient = new THREE.AmbientLight(0x404060, 0.6);
    this.scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
    keyLight.position.set(8, 10, 8);
    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x6080ff, 0.5);
    fillLight.position.set(-8, -4, -6);
    this.scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xff8040, 0.4);
    rimLight.position.set(0, -8, 4);
    this.scene.add(rimLight);

    // ضوء داخلي يضيء الخلية من المركز
    this.innerLight = new THREE.PointLight(0xffffff, 1.5, 30);
    this.innerLight.position.set(0, 0, 0);
    this.scene.add(this.innerLight);
  }

  // ========================================
  // جسيمات الخلفية (دوائر صغيرة عائمة)
  // ========================================
  createBackgroundParticles() {
    const particleCount = 200;
    const positions = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);
    const colors = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      const radius = 20 + Math.random() * 25;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i3 + 2] = radius * Math.cos(phi);
      sizes[i] = Math.random() * 0.08 + 0.02;

      const choice = Math.random();
      if (choice < 0.4) {
        colors[i3] = 0.2; colors[i3 + 1] = 0.8; colors[i3 + 2] = 0.5;
      } else if (choice < 0.7) {
        colors[i3] = 0.9; colors[i3 + 1] = 0.5; colors[i3 + 2] = 0.2;
      } else {
        colors[i3] = 0.5; colors[i3 + 1] = 0.4; colors[i3 + 2] = 0.9;
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    // نستخدم اسم aColor لتفادي التعارض مع color المدمج في three.js
    geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: `
        attribute float size;
        attribute vec3 aColor;
        varying vec3 vColor;
        uniform float uTime;
        void main() {
          vColor = aColor;
          vec3 pos = position;
          pos.y += sin(uTime * 0.5 + position.x * 0.1) * 0.5;
          pos.x += cos(uTime * 0.3 + position.z * 0.1) * 0.3;
          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          gl_PointSize = size * (300.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float dist = length(uv);
          if (dist > 0.5) discard;
          float alpha = smoothstep(0.5, 0.0, dist) * 0.6;
          gl_FragColor = vec4(vColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.particles = new THREE.Points(geometry, material);
    this.scene.add(this.particles);
  }

  // ========================================
  // التسميات ثلاثية الأبعاد (HTML overlays)
  // ========================================
  createLabelContainer() {
    this.labelContainer = document.createElement('div');
    this.labelContainer.className = 'organelle-labels-container';
    this.canvas.parentElement.appendChild(this.labelContainer);
  }

  createLabel(organelleMesh, org) {
    const labelEl = document.createElement('div');
    labelEl.className = 'organelle-label';
    labelEl.textContent = org.nameArabic;
    labelEl.style.borderColor = org.colorHex;
    labelEl.style.color = org.colorHex;
    this.labelContainer.appendChild(labelEl);

    return {
      element: labelEl,
      mesh: organelleMesh,
    };
  }

  updateLabels() {
    if (!this.labelContainer) return;
    this.labelContainer.style.display = this.showLabels ? 'block' : 'none';
    if (!this.showLabels) return;

    const tempV = new THREE.Vector3();
    const rect = this.canvas.getBoundingClientRect();

    this.labels.forEach((label) => {
      // اقرأ موضع العضية في إحداثيات العالم
      label.mesh.getWorldPosition(tempV);
      // أضف إزاحة بسيطة للأعلى كي لا تغطي العضية
      tempV.y += (label.mesh.userData.baseScale || 1) * 0.6;

      // اسقاط الإحداثيات إلى فضاء الشاشة
      tempV.project(this.camera);

      const x = (tempV.x * 0.5 + 0.5) * rect.width;
      const y = (-tempV.y * 0.5 + 0.5) * rect.height;

      // إذا كانت العضية خلف الكاميرا، أخفِ التسمية
      if (tempV.z > 1) {
        label.element.style.display = 'none';
      } else {
        label.element.style.display = 'block';
        label.element.style.transform = `translate(-50%, -100%) translate(${x}px, ${y}px)`;
      }
    });
  }

  // ========================================
  // تحميل خلية جديدة (نباتية أو حيوانية)
  // ========================================
  loadCell(cellType) {
    if (this.isDisposed) return;
    this.currentCellType = cellType;

    // تنظيف الخلية السابقة
    if (this.cellGroup) {
      this.scene.remove(this.cellGroup);
      this.disposeGroup(this.cellGroup);
      this.cellGroup = null;
    }
    this.organelleMeshes = [];

    // تنظيف التسميات السابقة
    this.labels.forEach((l) => l.element.remove());
    this.labels = [];

    // إنشاء المجموعة الجديدة
    this.cellGroup = new THREE.Group();

    if (cellType === 'plant') {
      this.buildPlantCellBody();
    } else {
      this.buildAnimalCellBody();
    }

    // إضافة العضيات الخاصة بنوع الخلية
    const organelles = window.ORGANELLES.filter((o) => o.foundIn.includes(cellType));
    organelles.forEach((org) => {
      const mesh = this.createOrganelleMesh(org);
      if (mesh) {
        this.cellGroup.add(mesh);

        // حفظ الحالة الأساسية (مهم لمنع تراكم الحجم)
        const baseScale = mesh.scale.clone();
        const entry = {
          mesh,
          data: org,
          basePosition: { x: org.position.x, y: org.position.y, z: org.position.z },
          baseRotation: { x: mesh.rotation.x, y: mesh.rotation.y, z: mesh.rotation.z },
          baseScale,
          highlightTime: 0,
          isHighlighted: false,
        };
        this.organelleMeshes.push(entry);

        // أنشئ تسمية HTML فوق كل عضية
        const label = this.createLabel(mesh, org);
        this.labels.push(label);
      }
    });

    this.scene.add(this.cellGroup);

    // ضبط لون الضوء الداخلي حسب نوع الخلية
    if (this.innerLight) {
      this.innerLight.color.setHex(cellType === 'plant' ? 0xa0ffa0 : 0xffd0a0);
    }
  }

  // ========================================
  // بناء جسم الخلية النباتية
  // ========================================
  buildPlantCellBody() {
    // الجدار الخلوي — مكعب صلب شبه شفاف
    const wallGeometry = new THREE.BoxGeometry(8, 8, 8, 4, 4, 4);
    const wallMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xa16207,
      transparent: true,
      opacity: 0.18,
      roughness: 0.4,
      metalness: 0.1,
      transmission: 0.4,
      thickness: 1,
      side: THREE.DoubleSide,
    });
    const cellWall = new THREE.Mesh(wallGeometry, wallMaterial);
    this.cellGroup.add(cellWall);

    // إطار يبرز حواف الجدار الخلوي
    const wallEdges = new THREE.EdgesGeometry(wallGeometry);
    const wallLine = new THREE.LineSegments(
      wallEdges,
      new THREE.LineBasicMaterial({ color: 0xb45309, transparent: true, opacity: 0.6 })
    );
    this.cellGroup.add(wallLine);

    // الغشاء البلازمي — مكعب داخلي
    const membraneGeometry = new THREE.BoxGeometry(7.4, 7.4, 7.4);
    const membraneMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x4ade80,
      transparent: true,
      opacity: 0.12,
      roughness: 0.2,
      transmission: 0.7,
      thickness: 0.5,
      side: THREE.DoubleSide,
    });
    const membrane = new THREE.Mesh(membraneGeometry, membraneMaterial);
    this.cellGroup.add(membrane);

    // الفجوة العصارية المركزية الكبيرة — عنصر بصري بارز
    const vacuoleGeometry = new THREE.SphereGeometry(2.2, 32, 32);
    const vacuoleMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x60a5fa,
      transparent: true,
      opacity: 0.25,
      roughness: 0.1,
      transmission: 0.85,
      thickness: 1.5,
      ior: 1.33,
    });
    const centralVacuole = new THREE.Mesh(vacuoleGeometry, vacuoleMaterial);
    centralVacuole.position.set(0.5, -0.3, 0.5);
    centralVacuole.userData.isCellBody = true;
    this.cellGroup.add(centralVacuole);

    // توهج السيتوبلازم
    const cytoGeometry = new THREE.SphereGeometry(3.7, 32, 32);
    const cytoMaterial = new THREE.MeshBasicMaterial({
      color: 0x86efac,
      transparent: true,
      opacity: 0.06,
      side: THREE.BackSide,
    });
    const cytoGlow = new THREE.Mesh(cytoGeometry, cytoMaterial);
    this.cellGroup.add(cytoGlow);
  }

  // ========================================
  // بناء جسم الخلية الحيوانية (شكل غير منتظم)
  // ========================================
  buildAnimalCellBody() {
    const membraneGeometry = new THREE.IcosahedronGeometry(4, 4);
    const positions = membraneGeometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const z = positions.getZ(i);
      // ضجيج بسيط لجعل الشكل غير منتظم
      const noise =
        Math.sin(x * 1.5) * 0.2 +
        Math.cos(y * 1.5) * 0.2 +
        Math.sin(z * 1.5) * 0.2 +
        Math.sin(x * 3 + y * 2) * 0.1;
      const scale = 1 + noise;
      positions.setXYZ(i, x * scale, y * scale, z * scale);
    }
    membraneGeometry.computeVertexNormals();

    const membraneMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xfb923c,
      transparent: true,
      opacity: 0.22,
      roughness: 0.3,
      metalness: 0.05,
      transmission: 0.6,
      thickness: 1,
      side: THREE.DoubleSide,
    });
    const membrane = new THREE.Mesh(membraneGeometry, membraneMaterial);
    this.cellGroup.add(membrane);

    // إطار يبرز حواف الغشاء
    const edges = new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(4.05, 2));
    const edgesLine = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: 0xea580c, transparent: true, opacity: 0.4 })
    );
    this.cellGroup.add(edgesLine);

    // توهج السيتوبلازم
    const cytoGeometry = new THREE.SphereGeometry(3.8, 32, 32);
    const cytoMaterial = new THREE.MeshBasicMaterial({
      color: 0xfdba74,
      transparent: true,
      opacity: 0.08,
      side: THREE.BackSide,
    });
    const cytoGlow = new THREE.Mesh(cytoGeometry, cytoMaterial);
    this.cellGroup.add(cytoGlow);
  }

  // ========================================
  // إنشاء مجسّم العضية حسب الشكل
  // ========================================
  createOrganelleMesh(org) {
    const color = org.color;
    const radius = Math.max(0.1, org.radius || 0.5);
    let mesh;

    switch (org.shape) {
      case 'sphere':
        // في الخلية النباتية، نُظهر الفجوة الكبيرة بدل الصغيرة
        if (org.id === 'vacuole' && this.currentCellType === 'plant') {
          return null;
        }
        mesh = this.createSphereMesh(org, color, radius);
        break;
      case 'bean':
        mesh = this.createBeanMesh(org, color, radius);
        break;
      case 'stack':
        mesh = this.createStackMesh(org, color, radius);
        break;
      case 'tube':
        mesh = this.createTubeMesh(org, color, radius);
        break;
      case 'disc':
        mesh = this.createDiscMesh(org, color, radius);
        break;
      case 'cylinder':
        mesh = this.createCylinderMesh(org, color, radius);
        break;
      default:
        mesh = this.createSphereMesh(org, color, radius);
    }

    if (!mesh) return null;

    mesh.position.set(org.position.x, org.position.y, org.position.z);
    mesh.userData.organelleData = org;

    return mesh;
  }

  createSphereMesh(org, color, radius) {
    const geometry = new THREE.SphereGeometry(radius, 32, 32);
    const material = new THREE.MeshPhysicalMaterial({
      color,
      roughness: 0.35,
      metalness: 0.1,
      clearcoat: 0.5,
      clearcoatRoughness: 0.2,
      emissive: color,
      emissiveIntensity: 0.15,
    });
    const mesh = new THREE.Mesh(geometry, material);

    // تفاصيل داخلية للنواة (النوية)
    if (org.id === 'nucleus') {
      const innerGeo = new THREE.SphereGeometry(radius * 0.35, 16, 16);
      const innerMat = new THREE.MeshPhysicalMaterial({
        color: 0x4c1d95,
        roughness: 0.5,
        emissive: 0x4c1d95,
        emissiveIntensity: 0.3,
      });
      const inner = new THREE.Mesh(innerGeo, innerMat);
      inner.position.set(radius * 0.3, radius * 0.2, radius * 0.3);
      mesh.add(inner);
    }

    // الليسوسومات تبدو نصف شفافة
    if (org.id === 'lysosome') {
      material.transmission = 0.3;
      material.thickness = 0.5;
      material.transparent = true;
      material.opacity = 0.85;
    }

    return mesh;
  }

  createBeanMesh(org, color, radius) {
    const geometry = new THREE.SphereGeometry(radius, 32, 32);
    const material = new THREE.MeshPhysicalMaterial({
      color,
      roughness: 0.4,
      metalness: 0.1,
      clearcoat: 0.4,
      emissive: color,
      emissiveIntensity: 0.2,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.scale.set(1.4, 0.7, 0.9); // شكل حبة الفاصولياء

    // الأعراف الداخلية للميتوكوندريا (طيات تزيد مساحة السطح)
    const innerGroup = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const innerGeo = new THREE.TorusGeometry(radius * 0.3, radius * 0.05, 8, 24);
      const innerMat = new THREE.MeshPhysicalMaterial({
        color: 0x7f1d1d,
        roughness: 0.6,
        emissive: 0x7f1d1d,
        emissiveIntensity: 0.1,
      });
      const ring = new THREE.Mesh(innerGeo, innerMat);
      ring.position.x = -radius * 0.4 + i * radius * 0.18;
      ring.rotation.y = Math.PI / 2;
      innerGroup.add(ring);
    }
    mesh.add(innerGroup);

    return mesh;
  }

  createStackMesh(org, color, radius) {
    // جهاز جولجي: أكوام من الأكياس المسطحة
    const group = new THREE.Group();
    const layers = 5;
    for (let i = 0; i < layers; i++) {
      const layerGeo = new THREE.SphereGeometry(radius * 0.9, 24, 16);
      const layerMat = new THREE.MeshPhysicalMaterial({
        color,
        roughness: 0.4,
        metalness: 0.15,
        emissive: color,
        emissiveIntensity: 0.15,
        transparent: true,
        opacity: 0.85,
      });
      const layer = new THREE.Mesh(layerGeo, layerMat);
      layer.scale.set(1, 0.15, 1);
      layer.position.y = (i - (layers - 1) / 2) * radius * 0.3;
      layer.userData.organelleData = org; // مهم لكشف النقر على الأجزاء الفرعية
      group.add(layer);
    }
    group.userData.organelleData = org; // على مستوى المجموعة أيضًا
    return group;
  }

  createTubeMesh(org, color, radius) {
    // الشبكة الإندوبلازمية: أنبوب منحني مع ريبوسومات على سطحه
    const group = new THREE.Group();
    const material = new THREE.MeshPhysicalMaterial({
      color,
      roughness: 0.4,
      metalness: 0.1,
      emissive: color,
      emissiveIntensity: 0.2,
      transparent: true,
      opacity: 0.85,
    });

    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-radius, 0, 0),
      new THREE.Vector3(-radius * 0.4, radius * 0.5, radius * 0.3),
      new THREE.Vector3(radius * 0.3, -radius * 0.3, -radius * 0.4),
      new THREE.Vector3(radius, radius * 0.4, radius * 0.2),
      new THREE.Vector3(radius * 0.5, -radius * 0.5, radius * 0.6),
    ]);
    const tubeGeo = new THREE.TubeGeometry(curve, 60, radius * 0.18, 12, false);
    const tube = new THREE.Mesh(tubeGeo, material);
    tube.userData.organelleData = org;
    group.add(tube);

    // ريبوسومات صغيرة على طول الأنبوب
    for (let i = 0; i < 8; i++) {
      const t = i / 8;
      const pos = curve.getPoint(t);
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(radius * 0.1, 12, 12),
        new THREE.MeshPhysicalMaterial({
          color: 0x1d4ed8,
          roughness: 0.3,
          emissive: 0x1d4ed8,
          emissiveIntensity: 0.3,
        })
      );
      dot.position.copy(pos);
      dot.userData.organelleData = org;
      group.add(dot);
    }

    group.userData.organelleData = org;
    return group;
  }

  createDiscMesh(org, color, radius) {
    // البلاستيدة الخضراء: قرص بيضاوي مع ثيلاكويدات داخلية
    const geometry = new THREE.SphereGeometry(radius, 32, 32);
    const material = new THREE.MeshPhysicalMaterial({
      color,
      roughness: 0.4,
      metalness: 0.1,
      clearcoat: 0.6,
      emissive: color,
      emissiveIntensity: 0.25,
      transparent: true,
      opacity: 0.92,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.scale.set(1, 0.4, 0.7);

    // قرصات الثيلاكويد الداخلية
    const thylaGroup = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const thylaGeo = new THREE.CylinderGeometry(radius * 0.4, radius * 0.4, radius * 0.05, 16);
      const thylaMat = new THREE.MeshPhysicalMaterial({
        color: 0x14532d,
        roughness: 0.5,
        emissive: 0x166534,
        emissiveIntensity: 0.2,
      });
      const disc = new THREE.Mesh(thylaGeo, thylaMat);
      disc.rotation.x = Math.PI / 2;
      disc.position.x = -radius * 0.3 + i * radius * 0.2;
      disc.userData.organelleData = org;
      thylaGroup.add(disc);
    }
    mesh.add(thylaGroup);

    return mesh;
  }

  createCylinderMesh(org, color, radius) {
    // الجسم المركزي: أسطوانتان متعامدتان
    const group = new THREE.Group();
    const material = new THREE.MeshPhysicalMaterial({
      color,
      roughness: 0.4,
      metalness: 0.2,
      emissive: color,
      emissiveIntensity: 0.25,
    });

    const cyl1 = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.3, radius * 0.3, radius * 1.5, 16),
      material
    );
    cyl1.userData.organelleData = org;
    group.add(cyl1);

    const cyl2 = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.3, radius * 0.3, radius * 1.5, 16),
      material
    );
    cyl2.rotation.z = Math.PI / 2;
    cyl2.position.x = radius * 0.2;
    cyl2.position.y = radius * 0.2;
    cyl2.userData.organelleData = org;
    group.add(cyl2);

    group.userData.organelleData = org;
    return group;
  }

  // ========================================
  // الأحداث: ماوس، لمس، تكبير
  // ========================================
  setupEventListeners() {
    this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
    window.addEventListener('mousemove', this.onMouseMove.bind(this));
    window.addEventListener('mouseup', this.onMouseUp.bind(this));
    this.canvas.addEventListener('wheel', this.onWheel.bind(this), { passive: false });

    // لمس
    this.canvas.addEventListener('touchstart', this.onTouchStart.bind(this), { passive: false });
    this.canvas.addEventListener('touchmove', this.onTouchMove.bind(this), { passive: false });
    this.canvas.addEventListener('touchend', this.onTouchEnd.bind(this));
    this.canvas.addEventListener('touchcancel', this.onTouchEnd.bind(this));

    // النقر لكشف العضيات
    this.canvas.addEventListener('click', this.onCanvasClick.bind(this));

    // تغيير الحجم
    window.addEventListener('resize', this.boundResize);

    // فقدان سياق WebGL
    this.canvas.addEventListener('webglcontextlost', this.onContextLost.bind(this));
  }

  // ---- ماوس ----
  onMouseDown(e) {
    this.isPointerDown = true;
    this.pointerStartX = e.clientX;
    this.pointerStartY = e.clientY;
    this.pointerLastX = e.clientX;
    this.pointerLastY = e.clientY;
    this.pointerTotalMovement = 0;
    this.isDragging = false;
    this.autoRotate = false;
  }

  onMouseMove(e) {
    // تحديث موضع الماوس لكشف الـ hover
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    if (this.isPointerDown) {
      const dx = e.clientX - this.pointerLastX;
      const dy = e.clientY - this.pointerLastY;
      this.pointerTotalMovement += Math.abs(dx) + Math.abs(dy);

      // تجاوز العتبة = سحب
      if (this.pointerTotalMovement > this.DRAG_THRESHOLD) {
        this.isDragging = true;
        this.targetRotation.y += dx * 0.008;
        this.targetRotation.x += dy * 0.008;
        this.targetRotation.x = Math.max(
          -Math.PI / 2.5,
          Math.min(Math.PI / 2.5, this.targetRotation.x)
        );
      }

      this.pointerLastX = e.clientX;
      this.pointerLastY = e.clientY;
    }

    this.checkHover(e.clientX, e.clientY);
  }

  onMouseUp(e) {
    // النقر الحقيقي يُكتشف في onCanvasClick
    this.isPointerDown = false;
    this.isDragging = false;
  }

  // ---- لمس ----
  onTouchStart(e) {
    if (e.touches.length === 1) {
      this.isPointerDown = true;
      this.pointerStartX = e.touches[0].clientX;
      this.pointerStartY = e.touches[0].clientY;
      this.pointerLastX = e.touches[0].clientX;
      this.pointerLastY = e.touches[0].clientY;
      this.pointerTotalMovement = 0;
      this.isDragging = false;
      this.autoRotate = false;
      e.preventDefault();
    }
    if (e.touches.length === 2) {
      // بدء إيماءة القرص (التكبير بإصبعين)
      this.lastPinchDistance = this.getPinchDistance(e.touches);
      e.preventDefault();
    }
  }

  onTouchMove(e) {
    if (e.touches.length === 1 && this.isPointerDown) {
      const dx = e.touches[0].clientX - this.pointerLastX;
      const dy = e.touches[0].clientY - this.pointerLastY;
      this.pointerTotalMovement += Math.abs(dx) + Math.abs(dy);

      if (this.pointerTotalMovement > this.DRAG_THRESHOLD) {
        this.isDragging = true;
        this.targetRotation.y += dx * 0.008;
        this.targetRotation.x += dy * 0.008;
        this.targetRotation.x = Math.max(
          -Math.PI / 2.5,
          Math.min(Math.PI / 2.5, this.targetRotation.x)
        );
      }

      this.pointerLastX = e.touches[0].clientX;
      this.pointerLastY = e.touches[0].clientY;
      e.preventDefault();
    }
    if (e.touches.length === 2 && this.lastPinchDistance != null) {
      const distance = this.getPinchDistance(e.touches);
      const delta = this.lastPinchDistance - distance;
      this.targetDistance += delta * 0.03;
      this.targetDistance = Math.max(7, Math.min(28, this.targetDistance));
      this.lastPinchDistance = distance;
      this.isDragging = true; // القرص يمنع النقر
      this.pointerTotalMovement = this.DRAG_THRESHOLD + 1;
      e.preventDefault();
    }
  }

  onTouchEnd(e) {
    // النقر باللمس فقط إذا لم يكن سحبًا
    if (this.pointerTotalMovement <= this.DRAG_THRESHOLD && e.changedTouches.length === 1) {
      const touch = e.changedTouches[0];
      this.handleClickAt(touch.clientX, touch.clientY);
    }
    this.isPointerDown = false;
    this.isDragging = false;
    this.lastPinchDistance = null;
  }

  getPinchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  onWheel(e) {
    e.preventDefault();
    this.targetDistance += e.deltaY * 0.01;
    this.targetDistance = Math.max(7, Math.min(28, this.targetDistance));
  }

  // النقر بالماوس — يجب أن نميّزه عن السحب
  onCanvasClick(e) {
    // إذا تجاوزت الحركة العتبة = سحب، تجاهل النقرة
    if (this.pointerTotalMovement > this.DRAG_THRESHOLD) {
      return;
    }
    this.handleClickAt(e.clientX, e.clientY);
  }

  // ========================================
  // كشف النقر على العضية (Raycasting)
  // ========================================
  handleClickAt(clientX, clientY) {
    if (!this.isReady) return;

    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    // اجمع كل المجسمات (العضيات + أجزائها الفرعية)
    const allMeshes = [];
    this.organelleMeshes.forEach((entry) => {
      allMeshes.push(entry.mesh);
      entry.mesh.traverse((child) => {
        if (child.isMesh) allMeshes.push(child);
      });
    });

    const intersects = this.raycaster.intersectObjects(allMeshes, false);
    if (intersects.length === 0) return;

    // ابحث عن أقرب سلف يحمل بيانات العضية
    let target = intersects[0].object;
    while (target && !target.userData.organelleData) {
      target = target.parent;
    }
    if (target && target.userData.organelleData) {
      // ابحث عن الإدخال المطابق في organelleMeshes
      const entry = this.organelleMeshes.find((e) => e.mesh === target);
      this.onOrganelleClick(target.userData.organelleData);
      if (entry) this.highlightOrganelle(entry);
    }
  }

  checkHover(clientX, clientY) {
    if (!this.isReady) return;

    if (this.isDragging) {
      this.onOrganelleHover(null, clientX, clientY);
      this.canvas.style.cursor = 'grabbing';
      return;
    }

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const allMeshes = [];
    this.organelleMeshes.forEach((entry) => {
      allMeshes.push(entry.mesh);
      entry.mesh.traverse((child) => {
        if (child.isMesh) allMeshes.push(child);
      });
    });

    const intersects = this.raycaster.intersectObjects(allMeshes, false);
    if (intersects.length > 0) {
      let target = intersects[0].object;
      while (target && !target.userData.organelleData) {
        target = target.parent;
      }
      if (target && target.userData.organelleData) {
        this.onOrganelleHover(target.userData.organelleData, clientX, clientY);
        this.canvas.style.cursor = 'pointer';
        return;
      }
    }
    this.onOrganelleHover(null, clientX, clientY);
    this.canvas.style.cursor = 'grab';
  }

  // ========================================
  // إبراز العضية المختارة (نخفاض حجم متحرك)
  // ========================================
  highlightOrganelle(entry) {
    // إعادة ضبط الإبراز السابق على نفس العضية
    entry.isHighlighted = true;
    entry.highlightTime = 0;
  }

  // ========================================
  // ضبط الكاميرا والحالة
  // ========================================
  setPaused(paused) {
    this.paused = paused;
  }

  setShowLabels(show) {
    this.showLabels = show;
  }

  resetView() {
    this.targetRotation = { x: 0, y: 0 };
    this.targetDistance = 14;
    this.autoRotate = true;
  }

  toggleAutoRotate() {
    this.autoRotate = !this.autoRotate;
    return this.autoRotate;
  }

  zoomIn() {
    this.targetDistance = Math.max(7, this.targetDistance - 2);
  }

  zoomOut() {
    this.targetDistance = Math.min(28, this.targetDistance + 2);
  }

  switchCell(cellType) {
    if (!this.isReady) return;
    this.loadCell(cellType);
    this.resetView();
  }

  // ========================================
  // تغيير الحجم
  // ========================================
  getAspectRatio() {
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    return w / h;
  }

  onResize() {
    if (!this.isReady || this.isDisposed) return;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w === 0 || h === 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  // ========================================
  // فقدان سياق WebGL
  // ========================================
  onContextLost(e) {
    e.preventDefault();
    console.warn('[CellScene] WebGL context lost.');
    this.fail('فقد سياق WebGL. أعد تحميل الصفحة لمحاولة استعادة العرض ثلاثي الأبعاد.');
  }

  // ========================================
  // حلقة الرسم الرئيسية
  // ========================================
  animate() {
    if (this.isDisposed) return;
    this.animationId = requestAnimationFrame(() => this.animate());

    if (!this.isReady || !this.clock) return;

    const delta = Math.min(this.clock.getDelta(), 0.1); // حدّ أقصى لمنع قفزات كبيرة
    const elapsed = this.clock.getElapsedTime();

    // حركة سلسة للكاميرا
    this.currentRotation.x += (this.targetRotation.x - this.currentRotation.x) * 0.1;
    this.currentRotation.y += (this.targetRotation.y - this.currentRotation.y) * 0.1;
    this.currentDistance += (this.targetDistance - this.currentDistance) * 0.1;

    // الدوران التلقائي
    if (this.autoRotate && !this.paused) {
      this.targetRotation.y += 0.003;
    }

    // موضع الكاميرا (إحداثيات كروية)
    const x = this.currentDistance * Math.sin(this.currentRotation.y) * Math.cos(this.currentRotation.x);
    const y = this.currentDistance * Math.sin(this.currentRotation.x);
    const z = this.currentDistance * Math.cos(this.currentRotation.y) * Math.cos(this.currentRotation.x);
    this.camera.position.set(x, y, z);
    this.camera.lookAt(0, 0, 0);

    // حركة العضيات
    if (!this.paused && this.cellGroup) {
      this.organelleMeshes.forEach((entry, i) => {
        const mesh = entry.mesh;
        const org = entry.data;
        const phase = i * 0.7;
        const baseScale = entry.baseScale;
        const baseX = baseScale.x;
        const baseY = baseScale.y;
        const baseZ = baseScale.z;

        // ضبط الحركة حسب النوع — باستخدام baseScale بدل multiplyScalar
        switch (org.animation) {
          case 'pulse': {
            const s = 1 + Math.sin(elapsed * 2 + phase) * 0.08;
            mesh.scale.set(baseX * s, baseY * s, baseZ * s);
            break;
          }
          case 'float': {
            mesh.position.y = entry.basePosition.y + Math.sin(elapsed * 0.8 + phase) * 0.2;
            mesh.position.x = entry.basePosition.x + Math.cos(elapsed * 0.6 + phase) * 0.15;
            break;
          }
          case 'drift': {
            mesh.position.x = entry.basePosition.x + Math.sin(elapsed * 0.5 + phase) * 0.3;
            mesh.position.y = entry.basePosition.y + Math.cos(elapsed * 0.7 + phase) * 0.25;
            mesh.position.z = entry.basePosition.z + Math.sin(elapsed * 0.4 + phase * 1.3) * 0.2;
            break;
          }
          case 'wiggle': {
            mesh.rotation.z = entry.baseRotation.z + Math.sin(elapsed * 2 + phase) * 0.2;
            mesh.rotation.x = entry.baseRotation.x + Math.cos(elapsed * 1.5 + phase) * 0.15;
            const s = 1 + Math.sin(elapsed * 3 + phase) * 0.05;
            mesh.scale.set(baseX * s, baseY * s, baseZ * s);
            break;
          }
          case 'spin': {
            mesh.rotation.y += delta * 1;
            mesh.rotation.x += delta * 0.5;
            break;
          }
        }

        // تأثير الإبراز المؤقت — بدون تراكم
        if (entry.isHighlighted) {
          entry.highlightTime += delta;
          const t = entry.highlightTime;
          // موجة حجمية تختفي تدريجيًا (لا تضرب في الحجم الحالي)
          const pulse = Math.sin(t * 8) * 0.15 * Math.exp(-t * 1.5);
          // اضرب في baseScale مباشرة، لا في scale الحالي
          mesh.scale.set(
            baseX * (1 + pulse),
            baseY * (1 + pulse),
            baseZ * (1 + pulse)
          );
          if (t > 1) {
            entry.isHighlighted = false;
            // أعد الحجم إلى الأساس
            mesh.scale.copy(baseScale);
          }
        }
      });

      // تحديث جسيمات الخلفية
      if (this.particles) {
        this.particles.material.uniforms.uTime.value = elapsed;
        this.particles.rotation.y = elapsed * 0.02;
      }

      // نبض الضوء الداخلي
      if (this.innerLight) {
        this.innerLight.intensity = 1.5 + Math.sin(elapsed * 1.5) * 0.4;
      }
    }

    // تحديث مواضع التسميات
    this.updateLabels();

    this.renderer.render(this.scene, this.camera);
  }

  // ========================================
  // تنظيف الموارد
  // ========================================
  disposeGroup(group) {
    group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
  }

  dispose() {
    this.isDisposed = true;
    if (this.animationId) cancelAnimationFrame(this.animationId);

    // إزالة مستمعي الأحداث
    window.removeEventListener('resize', this.boundResize);

    // إزالة التسميات
    if (this.labelContainer) {
      this.labelContainer.remove();
      this.labelContainer = null;
    }
    this.labels = [];

    // التخلص من الخلية
    if (this.cellGroup) {
      this.disposeGroup(this.cellGroup);
      this.cellGroup = null;
    }

    // التخلص من الجسيمات
    if (this.particles) {
      this.particles.geometry.dispose();
      this.particles.material.dispose();
      this.particles = null;
    }

    // التخلص من العارض
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss?.();
      this.renderer = null;
    }
  }
}

// إتاحة الفئة عالميًا
window.CellScene = CellScene;
