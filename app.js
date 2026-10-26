/* ============================================================
   عالَم الخلية — وحدة التحكم بالواجهة (AppUI)
   ============================================================
   مسؤوليات الملف:
   - تهيئة واجهة المستخدم وربط الأزرار.
   - تهيئة مشهد Three.js بأمان مع حالات (نجاح/فشل/إعادة محاولة).
   - إدارة النافذة المنبثقة وإمكانية الوصول (Focus trap).
   - بناء بطاقات العضيات وجدول المقارنة.
   - عرض Toasts والتلميحات.
   - فصل واضح بين الواجهة والمشهد عبر واجهة methods.
   ============================================================ */

class AppUI {
  constructor() {
    this.scene = null;
    this.currentCell = 'plant';
    this.toastTimeout = null;
    this.lastFocusedElement = null; // لعنصر التركيز قبل فتح النافذة
    this.initRetries = 0;
    this.MAX_INIT_RETRIES = 5;
    this.sceneState = 'pending'; // pending | ready | failed

    this.init();
  }

  init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.setup());
    } else {
      this.setup();
    }
  }

  setup() {
    // تخزين عناصر DOM
    this.canvas = document.getElementById('cell-canvas');
    this.loadingOverlay = document.getElementById('loading-overlay');
    this.tooltip = document.getElementById('organelle-tooltip');
    this.modal = document.getElementById('modal');
    this.modalBackdrop = document.getElementById('modal-backdrop');
    this.toast = document.getElementById('toast');
    this.cellSwitcher = document.getElementById('cell-switcher');
    this.btnPause = document.getElementById('btn-pause');
    this.btnLabels = document.getElementById('btn-labels');
    this.btnRotate = document.getElementById('btn-rotate');
    this.btnReset = document.getElementById('btn-reset');
    this.btnZoomIn = document.getElementById('btn-zoom-in');
    this.btnZoomOut = document.getElementById('btn-zoom-out');

    // التحقق من وجود العناصر الأساسية
    if (!this.canvas || !this.loadingOverlay) {
      console.error('[AppUI] عناصر DOM أساسية مفقودة');
      return;
    }

    // ربط الأزرار
    this.setupControls();

    // بناء أقسام الواجهة (لا تعتمد على Three.js — تبقى تعمل حتى لو فشل WebGL)
    this.buildReferencesGrid();
    this.buildComparisonTable();
    this.updateCellInfo();
    this.updateOrganellesCount();

    // محاولة تهيئة المشهد
    this.initScene();
  }

  // ========================================
  // ربط أزرار التحكم
  // ========================================
  setupControls() {
    // مبدّل الخلية
    if (this.cellSwitcher) {
      this.cellSwitcher.querySelectorAll('button').forEach((btn) => {
        btn.addEventListener('click', () => this.switchCell(btn.dataset.cell));
      });
    }

    // أزرار التحكم
    this.btnPause?.addEventListener('click', () => this.togglePause());
    this.btnLabels?.addEventListener('click', () => this.toggleLabels());
    this.btnRotate?.addEventListener('click', () => this.toggleRotate());
    this.btnReset?.addEventListener('click', () => this.resetView());

    // أزرار التكبير — تستدعي دوال آمنة بدل الوصول المباشر لخصائص المشهد
    this.btnZoomIn?.addEventListener('click', () => this.zoomIn());
    this.btnZoomOut?.addEventListener('click', () => this.zoomOut());

    // زر الإغلاق + النقر على الخلفية
    const modalClose = document.getElementById('modal-close');
    modalClose?.addEventListener('click', () => this.closeModal());
    this.modalBackdrop?.addEventListener('click', (e) => {
      if (e.target === this.modalBackdrop) this.closeModal();
    });

    // لوحة المفاتيح
    document.addEventListener('keydown', (e) => this.onKeyDown(e));
  }

  onKeyDown(e) {
    // Escape يغلق النافذة
    if (e.key === 'Escape') {
      if (this.modalBackdrop?.classList.contains('open')) {
        this.closeModal();
      }
      return;
    }

    // Space يبدّل الإيقاف فقط عندما لا تكون النافذة مفتوحة ولا يكون التركيز على زر
    if (e.key === ' ' || e.code === 'Space') {
      if (this.modalBackdrop?.classList.contains('open')) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'TEXTAREA') return;
      e.preventDefault();
      this.togglePause();
    }

    // Tab — إدارة Focus Trap داخل النافذة
    if (e.key === 'Tab' && this.modalBackdrop?.classList.contains('open')) {
      this.trapFocus(e);
    }
  }

  trapFocus(e) {
    const focusable = this.modal.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  // ========================================
  // تهيئة المشهد — مع آلية محاولة محدودة وحالات واضحة
  // ========================================
  initScene() {
    // تحقق من تحميل المكتبات
    if (typeof THREE === 'undefined' || !window.CellScene) {
      this.initRetries++;
      if (this.initRetries > this.MAX_INIT_RETRIES) {
        this.handleSceneFailure(
          'تعذّر تحميل مكتبة Three.js. تحقق من اتصال الإنترنت ثم أعد تحميل الصفحة.'
        );
        return;
      }
      // إعادة محاولة محدودة مع تأخير متزايد
      const delay = Math.min(200 * this.initRetries, 1000);
      setTimeout(() => this.initScene(), delay);
      return;
    }

    try {
      this.scene = new CellScene(this.canvas, {
        initialCell: this.currentCell,
        onOrganelleClick: (org) => this.openModal(org),
        onOrganelleHover: (org, x, y) => this.handleHover(org, x, y),
        onReady: () => this.handleSceneReady(),
        onFailure: (msg) => this.handleSceneFailure(msg),
      });
    } catch (err) {
      console.error('[AppUI] Scene constructor failed:', err);
      this.handleSceneFailure('حدث خطأ أثناء إنشاء المشهد ثلاثي الأبعاد.');
    }
  }

  handleSceneReady() {
    this.sceneState = 'ready';
    // إخفاء شاشة التحميل
    this.loadingOverlay.classList.add('hidden');
    this.showToast('اضغط على أي عضية لمعرفة وظيفتها', '🎯');
  }

  handleSceneFailure(message) {
    this.sceneState = 'failed';
    this.scene = null;
    // عرض رسالة خطأ واضحة بدل التحميل اللانهائي
    this.loadingOverlay.classList.remove('hidden');
    this.loadingOverlay.innerHTML = `
      <div class="fallback-message">
        <div class="fallback-icon">⚠️</div>
        <h3 class="fallback-title">تعذّر تشغيل العرض ثلاثي الأبعاد</h3>
        <p class="fallback-text">${this.escapeHtml(message)}</p>
        <p class="fallback-hint">
          يمكنك تصفّح جميع العضيات وقراءة تفاصيلها من البطاقات وجدول المقارنة في الأسفل.
        </p>
        <div class="fallback-actions">
          <button class="btn btn-primary" id="btn-retry">إعادة المحاولة</button>
          <button class="btn" id="btn-browse">تصفّح العضيات</button>
        </div>
      </div>
    `;
    document.getElementById('btn-retry')?.addEventListener('click', () => {
      this.loadingOverlay.innerHTML = `
        <div class="loader"></div>
        <div class="loading-text">جارٍ إعادة المحاولة...</div>
      `;
      this.initRetries = 0;
      setTimeout(() => this.initScene(), 500);
    });
    document.getElementById('btn-browse')?.addEventListener('click', () => {
      this.loadingOverlay.classList.add('hidden');
      // تمرير سلس إلى قسم البطاقات
      document.getElementById('reference-grid')?.scrollIntoView({ behavior: 'smooth' });
    });
  }

  // ========================================
  // تبديل الخلية
  // ========================================
  switchCell(cellType) {
    if (cellType === this.currentCell) return;
    this.currentCell = cellType;

    // تحديث مظهر المبدّل
    this.cellSwitcher.querySelectorAll('button').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.cell === cellType);
    });
    this.cellSwitcher.classList.toggle('animal', cellType === 'animal');
    this.cellSwitcher.classList.toggle('plant', cellType === 'plant');

    // تبديل المشهد (إذا كان جاهزًا)
    if (this.scene && this.scene.isReady) {
      this.scene.switchCell(cellType);
    }

    // تحديث شريحة المعلومات + Toast
    this.updateCellInfo();
    const names = { plant: 'الخلية النباتية 🌿', animal: 'الخلية الحيوانية 🐾' };
    this.showToast(`تم التحويل إلى ${names[cellType]}`, '');
  }

  updateCellInfo() {
    const chip = document.getElementById('cell-info-chip');
    if (!chip) return;
    const isPlant = this.currentCell === 'plant';
    const title = isPlant ? 'الخلية النباتية' : 'الخلية الحيوانية';
    const icon = isPlant ? '🌿' : '🐾';
    const color = isPlant ? '#34d399' : '#fb923c';
    const desc = isPlant
      ? 'تتميز بوجود الجدار الخلوي والبلاستيدات الخضراء والفجوة العصارية الكبيرة، وتنتج غذاءها بالبناء الضوئي.'
      : 'تتميز بوجود الجسم المركزي والليسوسومات، وتحصل على غذائها من الكائنات الأخرى.';

    chip.innerHTML = `
      <div class="chip-title" style="color: ${color}">
        <span class="dot" style="background: ${color}"></span>
        ${icon} ${title}
      </div>
      <div class="chip-desc">${desc}</div>
    `;
  }

  updateOrganellesCount() {
    // تحديث جميع العدّادات لتعكس العدد الفعلي للعضيات
    const count = window.ORGANELLES_COUNT || (window.ORGANELLES?.length || 0);
    document.querySelectorAll('[data-organelles-count]').forEach((el) => {
      el.textContent = count;
    });
  }

  // ========================================
  // أزرار التحكم (تستدعي دوال آمنة على المشهد)
  // ========================================
  togglePause() {
    if (!this.scene || !this.scene.isReady) {
      this.showToast('لا يمكن إيقاف الحركة لأن العرض ثلاثي الأبعاد غير متاح', '⚠️');
      return;
    }
    const paused = !this.scene.paused;
    this.scene.setPaused(paused);
    this.btnPause.innerHTML = paused
      ? '<i>▶</i><span>تشغيل الحركة</span>'
      : '<i>⏸</i><span>إيقاف الحركة</span>';
    this.showToast(paused ? 'تم إيقاف الحركة' : 'تم تشغيل الحركة', paused ? '⏸' : '▶');
  }

  toggleLabels() {
    if (!this.scene || !this.scene.isReady) {
      this.showToast('لا يمكن إظهار الأسماء لأن العرض ثلاثي الأبعاد غير متاح', '⚠️');
      return;
    }
    const show = !this.scene.showLabels;
    this.scene.setShowLabels(show);
    this.btnLabels.innerHTML = show
      ? '<i>👁</i><span>إظهار الأسماء</span>'
      : '<i>🚫</i><span>إخفاء الأسماء</span>';
    // أظهر/أخفِ التلميحات أيضًا (الـ hover tooltip)
    document.body.classList.toggle('labels-off', !show);
    this.showToast(show ? 'تم إظهار الأسماء' : 'تم إخفاء الأسماء', show ? '👁' : '🚫');
  }

  toggleRotate() {
    if (!this.scene || !this.scene.isReady) {
      this.showToast('لا يمكن التحكم بالدوران لأن العرض ثلاثي الأبعاد غير متاح', '⚠️');
      return;
    }
    const rotating = this.scene.toggleAutoRotate();
    this.btnRotate.innerHTML = rotating
      ? '<i>🔄</i><span>الدوران التلقائي</span>'
      : '<i>⏹</i><span>إيقاف الدوران</span>';
  }

  resetView() {
    if (!this.scene || !this.scene.isReady) {
      this.showToast('لا يمكن إعادة الضبط لأن العرض ثلاثي الأبعاد غير متاح', '⚠️');
      return;
    }
    this.scene.resetView();
    this.showToast('تمت إعادة ضبط الكاميرا', '🔄');
  }

  zoomIn() {
    if (!this.scene || !this.scene.isReady) {
      this.showToast('لا يمكن التكبير لأن العرض ثلاثي الأبعاد غير متاح', '⚠️');
      return;
    }
    this.scene.zoomIn();
  }

  zoomOut() {
    if (!this.scene || !this.scene.isReady) {
      this.showToast('لا يمكن التصغير لأن العرض ثلاثي الأبعاد غير متاح', '⚠️');
      return;
    }
    this.scene.zoomOut();
  }

  // ========================================
  // التلميحات (Hover Tooltip)
  // ========================================
  handleHover(org, x, y) {
    if (!org || document.body.classList.contains('labels-off')) {
      this.tooltip.classList.remove('show');
      return;
    }
    this.tooltip.textContent = `${org.emoji} ${org.nameArabic}`;
    this.tooltip.style.left = `${x}px`;
    this.tooltip.style.top = `${y}px`;
    this.tooltip.classList.add('show');
  }

  // ========================================
  // النافذة المنبثقة (Modal) — مع إمكانية وصول كاملة
  // ========================================
  openModal(org) {
    // حفظ العنصر الذي كان عليه التركيز قبل فتح النافذة
    this.lastFocusedElement = document.activeElement;

    // ملء المحتوى باستخدام textContent حيثما أمكن (أمان)
    const setIcon = document.getElementById('modal-icon');
    setIcon.textContent = org.emoji;
    setIcon.style.background = org.colorHex;
    setIcon.style.color = org.textColor;
    setIcon.style.boxShadow = `0 8px 22px -6px ${org.borderColor}`;

    document.getElementById('modal-title-ar').textContent = org.nameArabic;
    document.getElementById('modal-title-en').textContent = org.nameEnglish;
    document.getElementById('modal-short-desc').textContent = org.shortDescription;
    document.getElementById('modal-full-desc').textContent = org.fullDescription;
    document.getElementById('modal-analogy').textContent = org.analogy;
    document.getElementById('modal-fun').textContent = org.funFact;
    document.getElementById('modal-marker').style.background = org.colorHex;
    document.getElementById('modal-functions-marker').style.background = org.colorHex;

    // قائمة الوظائف — استخدم DOM API بدل innerHTML
    const funcsList = document.getElementById('modal-functions');
    funcsList.innerHTML = '';
    org.functions.forEach((func) => {
      const li = document.createElement('li');
      const bullet = document.createElement('span');
      bullet.className = 'bullet';
      bullet.style.background = org.colorHex;
      const span = document.createElement('span');
      span.textContent = func;
      li.appendChild(bullet);
      li.appendChild(span);
      funcsList.appendChild(li);
    });

    // الوسوم
    const tagsEl = document.getElementById('modal-tags');
    tagsEl.innerHTML = '';
    if (org.foundIn.includes('animal')) {
      const tag = document.createElement('span');
      tag.className = 'tag tag-animal';
      tag.textContent = 'في الخلية الحيوانية';
      tagsEl.appendChild(tag);
    }
    if (org.foundIn.includes('plant')) {
      const tag = document.createElement('span');
      tag.className = 'tag tag-plant';
      tag.textContent = 'في الخلية النباتية';
      tagsEl.appendChild(tag);
    }

    // عرض النافذة
    this.modalBackdrop.classList.add('open');
    this.modal.setAttribute('aria-hidden', 'false');

    // منع تمرير الصفحة الخلفية مع حفظ حالة التمرير
    this.savedScrollY = window.scrollY;
    document.body.style.overflow = 'hidden';

    // نقل التركيز إلى زر الإغلاق
    setTimeout(() => {
      document.getElementById('modal-close')?.focus();
    }, 100);
  }

  closeModal() {
    this.modalBackdrop.classList.remove('open');
    this.modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (this.savedScrollY !== undefined) {
      window.scrollTo(0, this.savedScrollY);
      this.savedScrollY = undefined;
    }
    // إعادة التركيز للعنصر السابق
    if (this.lastFocusedElement && typeof this.lastFocusedElement.focus === 'function') {
      this.lastFocusedElement.focus();
      this.lastFocusedElement = null;
    }
  }

  // ========================================
  // بناء شبكة البطاقات المرجعية
  // ========================================
  buildReferencesGrid() {
    const grid = document.getElementById('reference-grid');
    if (!grid) return;
    grid.innerHTML = '';

    window.ORGANELLES.forEach((org) => {
      const card = document.createElement('div');
      card.className = 'organelle-card';
      card.style.setProperty('--card-color', org.colorHex);
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', `عرض تفاصيل ${org.nameArabic}`);

      const isPlant = org.foundIn.includes('plant');
      const isAnimal = org.foundIn.includes('animal');

      // بناء البطاقة عبر DOM API لتفادي XSS
      card.innerHTML = `
        <div class="organelle-card-head">
          <div class="organelle-card-icon" style="background:${org.colorHex};color:${org.textColor}">
            ${org.emoji}
          </div>
          <div class="organelle-card-info">
            <h3></h3>
            <div class="english"></div>
          </div>
        </div>
        <p></p>
        <div class="tags"></div>
      `;
      card.querySelector('h3').textContent = org.nameArabic;
      card.querySelector('.english').textContent = org.nameEnglish;
      card.querySelector('p').textContent = org.shortDescription;

      const tagsContainer = card.querySelector('.tags');
      if (isAnimal) {
        const tag = document.createElement('span');
        tag.className = 'tag tag-animal';
        tag.textContent = 'حيوانية';
        tagsContainer.appendChild(tag);
      }
      if (isPlant) {
        const tag = document.createElement('span');
        tag.className = 'tag tag-plant';
        tag.textContent = 'نباتية';
        tagsContainer.appendChild(tag);
      }

      // النقر + لوحة المفاتيح
      card.addEventListener('click', () => this.openModal(org));
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.openModal(org);
        }
      });

      grid.appendChild(card);
    });
  }

  // ========================================
  // بناء جدول المقارنة
  // ========================================
  buildComparisonTable() {
    const tbody = document.getElementById('comparison-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    // صف رأس للموبايل (يظهر فقط على الشاشات الصغيرة)
    const mobileHeader = document.createElement('div');
    mobileHeader.className = 'comparison-row header-mobile';
    const mhPlant = document.createElement('div');
    mhPlant.className = 'comparison-cell plant';
    mhPlant.textContent = '🌿 النباتية';
    const mhAnimal = document.createElement('div');
    mhAnimal.className = 'comparison-cell animal';
    mhAnimal.textContent = '🐾 الحيوانية';
    mobileHeader.appendChild(mhPlant);
    mobileHeader.appendChild(mhAnimal);
    tbody.appendChild(mobileHeader);

    window.COMPARISON_TABLE.forEach((row) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'comparison-row';

      const cellPlant = document.createElement('div');
      cellPlant.className = 'comparison-cell plant';
      cellPlant.textContent = row.plantCell;

      const cellFeature = document.createElement('div');
      cellFeature.className = 'comparison-cell feature';
      cellFeature.textContent = row.feature;

      const cellAnimal = document.createElement('div');
      cellAnimal.className = 'comparison-cell animal';
      cellAnimal.textContent = row.animalCell;

      rowEl.appendChild(cellPlant);
      rowEl.appendChild(cellFeature);
      rowEl.appendChild(cellAnimal);
      tbody.appendChild(rowEl);
    });
  }

  // ========================================
  // Toasts
  // ========================================
  showToast(message, icon = '') {
    if (!this.toast) return;
    this.toast.innerHTML = `${icon ? `<span>${icon}</span>` : ''}<span>${this.escapeHtml(message)}</span>`;
    this.toast.classList.add('show');
    clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      this.toast.classList.remove('show');
    }, 2500);
  }

  // ========================================
  // أدوات مساعدة
  // ========================================
  escapeHtml(text) {
    if (typeof text !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// تهيئة التطبيق
window.app = new AppUI();
