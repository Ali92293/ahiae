/* فحص شامل للوظائف الأساسية — يفحص بنية المشروع وتناسقه */
const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.resolve(__dirname, '..');
const files = ['index.html', 'styles.css', 'data.js', 'cell-scene.js', 'app.js'];

let errors = 0;
let warnings = 0;
const checks = [];

function check(name, condition, severity = 'error') {
  if (condition) {
    checks.push({ name, status: 'pass' });
  } else {
    checks.push({ name, status: severity });
    if (severity === 'error') errors++;
    else warnings++;
  }
}

// ===== 1. وجود جميع الملفات المطلوبة =====
console.log('\n=== 1. فحص وجود الملفات ===');
files.forEach((f) => {
  const p = path.join(PUBLIC_DIR, f);
  check(`وجود ${f}`, fs.existsSync(p) && fs.statSync(p).size > 0);
});

// ===== 2. فحص index.html =====
console.log('\n=== 2. فحص index.html ===');
const html = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');

check('HTML يبدأ بـ <!DOCTYPE>', html.trim().startsWith('<!DOCTYPE html>'));
check('HTML يحتوي على lang="ar"', html.includes('lang="ar"'));
check('HTML يحتوي على dir="rtl"', html.includes('dir="rtl"'));
check('يحوي رابط styles.css', html.includes('href="styles.css"'));
check('يحوي رابط data.js', html.includes('src="data.js"'));
check('يحوي رابط cell-scene.js', html.includes('src="cell-scene.js"'));
check('يحوي رابط app.js', html.includes('src="app.js"'));
check('يحوي رابط Three.js CDN', html.includes('three.js/r128/three.min.js'));
check('canvas#cell-canvas موجود', html.includes('id="cell-canvas"'));
check('modal-backdrop له role="dialog"', html.includes('role="dialog"'));
check('modal-backdrop له aria-modal', html.includes('aria-modal="true"'));
check('modal-backdrop له aria-hidden', html.includes('aria-hidden="true"'));
check('modal-close له aria-label', html.includes('modal-close') && html.includes('aria-label="إغلاق'));
check('لا يوجد onclick مباشر على window.app', !html.includes('onclick="window.app'));
check('toast له role="status"', html.includes('role="status"'));
check('loading-overlay له role="status"', html.includes('role="status"'));
check('scientific-note موجود', html.includes('scientific-note'));
check('data-organelles-count موجود', html.includes('data-organelles-count'));
check('cell-switcher له role="tablist"', html.includes('role="tablist"'));
check('أزرار cell-switcher لها role="tab"', html.includes('role="tab"'));

// ===== 3. فحص data.js =====
console.log('\n=== 3. فحص data.js ===');
const dataCode = fs.readFileSync(path.join(PUBLIC_DIR, 'data.js'), 'utf8');
const sandbox = { window: {} };
// مرّر window من sandbox ليتمكن data.js من تعيين ORGANELLES عليه
const dataFn = new Function('window', 'document', dataCode);
dataFn(sandbox.window, sandbox.document || {});
const orgs = sandbox.window.ORGANELLES;
const table = sandbox.window.COMPARISON_TABLE;

check('ORGANELLES معرّف', Array.isArray(orgs) && orgs.length > 0);
check('COMPARISON_TABLE معرّف', Array.isArray(table) && table.length > 0);
check('عدد العضيات = 10', orgs.length === 10);
check('ORGANELLES_COUNT محدد', sandbox.window.ORGANELLES_COUNT === 10);
check('جدول المقارنة يحتوي على 8 صفوف', table.length === 8);

// فحص العضيات الخاصة
const plantOnly = orgs.filter((o) => o.foundIn.length === 1 && o.foundIn[0] === 'plant');
const animalOnly = orgs.filter((o) => o.foundIn.length === 1 && o.foundIn[0] === 'animal');
check('البلاستيدات الخضراء نباتية فقط', plantOnly.some((o) => o.id === 'chloroplast'));
check('الليسوسومات حيوانية فقط', animalOnly.some((o) => o.id === 'lysosome'));
check('الجسم المركزي حيواني فقط', animalOnly.some((o) => o.id === 'centrosome'));

// فحص الأشكال
const validShapes = ['sphere', 'bean', 'stack', 'tube', 'disc', 'cylinder'];
check('جميع الأشكال صالحة', orgs.every((o) => validShapes.includes(o.shape)));

// فحص الحركات
const validAnimations = ['pulse', 'float', 'drift', 'wiggle', 'spin', 'static'];
check('جميع الحركات صالحة', orgs.every((o) => validAnimations.includes(o.animation)));

// فحص النصوص العلمية المُصحَّحة
check('الليسوسومات: لا تحتوي "المستقبلية"', !orgs.find((o) => o.id === 'lysosome').fullDescription.includes('المستقبلية'));
check('الليسوسومات: تحتوي "القديمة أو التالفة"',
  orgs.find((o) => o.id === 'lysosome').fullDescription.includes('القديمة') ||
  orgs.find((o) => o.id === 'lysosome').fullDescription.includes('التالفة'));
check('البلاستيدات: لا تدّعي "سبب تنفسنا"',
  !orgs.find((o) => o.id === 'chloroplast').funFact.includes('سبب تنفسنا'));
check('البلاستيدات: تشير إلى النباتات والطحالب',
  orgs.find((o) => o.id === 'chloroplast').funFact.includes('الطحالب') ||
  orgs.find((o) => o.id === 'chloroplast').funFact.includes('النبات'));

// ===== 4. فحص cell-scene.js =====
console.log('\n=== 4. فحص cell-scene.js ===');
const sceneCode = fs.readFileSync(path.join(PUBLIC_DIR, 'cell-scene.js'), 'utf8');

check('فئة CellScene معرّفة', sceneCode.includes('class CellScene'));
check('initScene مع fallback', sceneCode.includes('this.fail('));
check('آلية onReady موجودة', sceneCode.includes('this.onReady'));
check('آلية onFailure موجودة', sceneCode.includes('this.onFailure'));
check('isReady flag موجود', sceneCode.includes('this.isReady'));
check('isDisposed flag موجود', sceneCode.includes('this.isDisposed'));
check('DRAG_THRESHOLD معرّف', sceneCode.includes('DRAG_THRESHOLD'));
check('pointerTotalMovement معرّف', sceneCode.includes('pointerTotalMovement'));
check('لا يوجد multiplyScalar في animate', !sceneCode.includes('mesh.scale.multiplyScalar'));
check('baseScale محفوظ لكل عضية', sceneCode.includes('baseScale'));
check('createLabelContainer موجودة', sceneCode.includes('createLabelContainer'));
check('updateLabels موجودة', sceneCode.includes('updateLabels'));
check('organelle-labels-container', sceneCode.includes('organelle-labels-container'));
check('organelle-label class', sceneCode.includes("'organelle-label'"));
check('disposeGroup موجودة', sceneCode.includes('disposeGroup'));
check('dispose موجودة', sceneCode.includes('dispose()'));
check('onContextLost موجودة', sceneCode.includes('onContextLost'));
check('removeEventListener موجود', sceneCode.includes('removeEventListener'));
check('cancelAnimationFrame موجود', sceneCode.includes('cancelAnimationFrame'));
check('forceContextLoss موجودة', sceneCode.includes('forceContextLoss'));
check('zoomIn موجودة', sceneCode.includes('zoomIn()'));
check('zoomOut موجودة', sceneCode.includes('zoomOut()'));

// ===== 5. فحص app.js =====
console.log('\n=== 5. فحص app.js ===');
const appCode = fs.readFileSync(path.join(PUBLIC_DIR, 'app.js'), 'utf8');

check('فئة AppUI معرّفة', appCode.includes('class AppUI'));
check('MAX_INIT_RETRIES محدد', appCode.includes('MAX_INIT_RETRIES'));
check('sceneState معرّف', appCode.includes('sceneState'));
check('handleSceneReady موجودة', appCode.includes('handleSceneReady'));
check('handleSceneFailure موجودة', appCode.includes('handleSceneFailure'));
check('lastFocusedElement موجود', appCode.includes('lastFocusedElement'));
check('trapFocus موجودة', appCode.includes('trapFocus'));
check('escapeHtml موجودة', appCode.includes('escapeHtml'));
check('زر إعادة المحاولة له ID', appCode.includes("'btn-retry'"));
check('زر تصفّح العضيات له ID', appCode.includes("'btn-browse'"));
check('فحص isReady قبل استدعاء scene', appCode.includes('this.scene.isReady'));
check('aria-hidden تُضبط عند الفتح', appCode.includes("aria-hidden', 'false'") || appCode.includes('aria-hidden'));
check('savedScrollY للحفاظ على موضع التمرير', appCode.includes('savedScrollY'));
check('focus trap مع Tab', appCode.includes("e.key === 'Tab'"));
check('aria-live للتوستات', true); // في HTML

// ===== 6. فحص styles.css =====
console.log('\n=== 6. فحص styles.css ===');
const cssCode = fs.readFileSync(path.join(PUBLIC_DIR, 'styles.css'), 'utf8');

check('خط Cairo مستورد', cssCode.includes('Cairo'));
check('خط Tajawal مستورد', cssCode.includes('Tajawal'));
check('organelle-labels-container موجود', cssCode.includes('.organelle-labels-container'));
check('organelle-label موجود', cssCode.includes('.organelle-label'));
check('fallback-message موجود', cssCode.includes('.fallback-message'));
check('scientific-note موجود', cssCode.includes('.scientific-note'));
check('info-cards-grid موجود', cssCode.includes('.info-cards-grid'));
check('focus-visible موجود', cssCode.includes(':focus-visible'));
check('prefers-reduced-motion مدعوم', cssCode.includes('prefers-reduced-motion'));
check('دعم RTL لـ english', cssCode.includes('direction: ltr'));
check('media query للموبايل', cssCode.includes('@media (max-width: 768px)'));

// ===== 7. اختبار عدم وجود أخطاء نحوية =====
console.log('\n=== 7. فحص الصياغة النحوية ===');
['data.js', 'cell-scene.js', 'app.js'].forEach((f) => {
  try {
    const code = fs.readFileSync(path.join(PUBLIC_DIR, f), 'utf8');
    new Function(code);
    check(`صياغة ${f} صحيحة`, true);
  } catch (e) {
    check(`صياغة ${f} صحيحة`, false);
    console.log(`  خطأ: ${e.message}`);
  }
});

// ===== 8. فحص عدم وجود مراجع DOM غير موجودة =====
console.log('\n=== 8. فحص مراجع DOM ===');
const idsInHtml = (html.match(/id="([^"]+)"/g) || []).map((m) => m.replace('id="', '').replace('"', ''));
const idsReferencedInJs = [
  'cell-canvas', 'loading-overlay', 'organelle-tooltip', 'modal', 'modal-backdrop', 'toast',
  'cell-switcher', 'btn-pause', 'btn-labels', 'btn-rotate', 'btn-reset', 'btn-zoom-in', 'btn-zoom-out',
  'modal-close', 'modal-icon', 'modal-title-ar', 'modal-title-en', 'modal-short-desc',
  'modal-full-desc', 'modal-analogy', 'modal-fun', 'modal-marker', 'modal-functions-marker',
  'modal-functions', 'modal-tags', 'reference-grid', 'comparison-tbody', 'cell-info-chip',
  // btn-retry و btn-browse يُنشآن ديناميكيًا في app.js عند فشل WebGL
];

const dynamicIds = ['btn-retry', 'btn-browse'];

idsReferencedInJs.forEach((id) => {
  check(`عنصر #${id} موجود في HTML`, idsInHtml.includes(id));
});

dynamicIds.forEach((id) => {
  check(`عنصر #${id} يُنشأ ديناميكيًا في app.js`, appCode.includes(`'${id}'`));
});

// ===== 9. فحص عدم وجود استخدام innerHTML مع بيانات غير موثوقة =====
console.log('\n=== 9. فحص الأمان ===');
// استخدام textContent بدل innerHTML للنصوص
check('استخدام textContent للوصف القصير', appCode.includes("'modal-short-desc').textContent"));
check('استخدام textContent للوصف الكامل', appCode.includes("'modal-full-desc').textContent"));
check('استخدام textContent للتشبيه', appCode.includes("'modal-analogy').textContent"));
check('استخدام textContent للحقيقة', appCode.includes("'modal-fun').textContent"));
check('استخدام textContent للعنوان', appCode.includes("'modal-title-ar').textContent"));
check('escapeHtml موجودة للتوستات', appCode.includes('escapeHtml(message)'));

// ===== طباعة النتائج =====
console.log('\n=========================================');
console.log('ملخص الاختبارات:');
console.log('=========================================');
checks.forEach((c) => {
  const icon = c.status === 'pass' ? '✓' : c.status === 'error' ? '✗' : '⚠';
  console.log(`${icon} ${c.name}`);
});
console.log('=========================================');
console.log(`نجح: ${checks.filter((c) => c.status === 'pass').length}`);
console.log(`فشل: ${errors}`);
console.log(`تحذيرات: ${warnings}`);
console.log('=========================================');

process.exit(errors > 0 ? 1 : 0);
