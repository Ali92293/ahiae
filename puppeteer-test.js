/* اختبار فعلي عبر Puppeteer مع WebGL
 *
 * المتطلبات:
 *   - تثبيت puppeteer-core:  npm install puppeteer-core
 *   - Chrome/Chromium متاح في النظام
 *
 * التشغيل:
 *   CHROME_PATH=/path/to/chrome node tests/puppeteer-test.js
 *
 * أو مع swiftshader لمحاكاة WebGL في بيئة بلا GPU:
 *   node tests/puppeteer-test.js
 */
const path = require('path');
const fs = require('fs');

// محاولة تحميل puppeteer-core من مسارات متعددة
let puppeteer;
const paths = [
  path.resolve(__dirname, '..', '..', 'node_modules', 'puppeteer-core'),
  path.resolve(__dirname, 'node_modules', 'puppeteer-core'),
  '/tmp/node_modules/puppeteer-core',
];
for (const p of paths) {
  if (fs.existsSync(path.join(p, 'package.json'))) {
    puppeteer = require(p);
    break;
  }
}
if (!puppeteer) {
  console.error('خطأ: puppeteer-core غير مثبت. شغّل: npm install puppeteer-core');
  process.exit(1);
}

const CHROME_PATH = process.env.CHROME_PATH || '/home/z/.agent-browser/browsers/chrome-155.0.8059.39/chrome';
const URL = process.env.TEST_URL || 'http://localhost:3000/cells3d/index.html';

(async () => {
  console.log('=== بدء اختبار فعلي عبر Puppeteer ===\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu-sandbox',
      '--no-zygote',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--enable-unsafe-swiftshader',
      '--use-angle=swiftshader',
      '--window-size=1280,800',
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  page.on('console', (msg) => {
    const type = msg.type();
    if (type === 'error' || type === 'warning') {
      console.log(`[console.${type}] ${msg.text().substring(0, 150)}`);
    }
  });
  page.on('pageerror', (err) => console.log(`[pageerror] ${err.message}`));

  try {
    // 1. تنقل إلى الموقع
    console.log('1. التنقل إلى الموقع...');
    await page.goto(URL, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 4000)); // انتظر Three.js

    // 2. تحقق من المتغيرات العامة
    console.log('\n2. فحص المتغيرات العامة:');
    const v = await page.evaluate(() => ({
      THREE: typeof THREE,
      CellScene: typeof window.CellScene,
      app: typeof window.app,
      sceneState: window.app ? window.app.sceneState : 'no-app',
      sceneIsReady: window.app && window.app.scene ? window.app.scene.isReady : false,
      canvasW: document.getElementById('cell-canvas').clientWidth,
      canvasH: document.getElementById('cell-canvas').clientHeight,
    }));
    console.log(`   THREE: ${v.THREE}`);
    console.log(`   CellScene: ${v.CellScene}`);
    console.log(`   app: ${v.app}`);
    console.log(`   sceneState: ${v.sceneState}`);
    console.log(`   sceneIsReady: ${v.sceneIsReady}`);
    console.log(`   canvas: ${v.canvasW}x${v.canvasH}`);

    // 3. فحص WebGL
    console.log('\n3. فحص دعم WebGL:');
    const glInfo = await page.evaluate(() => {
      const c = document.createElement('canvas');
      const gl2 = c.getContext('webgl2');
      const gl1 = c.getContext('webgl');
      if (gl2) return `WebGL2 OK — version=${gl2.getParameter(gl2.VERSION)}, renderer=${gl2.getParameter(gl2.RENDERER)}`;
      if (gl1) return `WebGL1 OK — version=${gl1.VERSION}, renderer=${gl1.getParameter(gl1.RENDERER)}`;
      return 'WebGL NOT available';
    });
    console.log(`   ${glInfo}`);

    // 4. فحص حالة المشهد
    console.log('\n4. فحص حالة المشهد:');
    const s = await page.evaluate(() => {
      if (!window.app || !window.app.scene) return { error: 'no scene' };
      return {
        isReady: window.app.scene.isReady,
        isDisposed: window.app.scene.isDisposed,
        paused: window.app.scene.paused,
        showLabels: window.app.scene.showLabels,
        autoRotate: window.app.scene.autoRotate,
        currentCellType: window.app.scene.currentCellType,
        organelleMeshesCount: window.app.scene.organelleMeshes.length,
        labelsCount: window.app.scene.labels.length,
        particlesExist: !!window.app.scene.particles,
        innerLightExists: !!window.app.scene.innerLight,
        cellGroupExists: !!window.app.scene.cellGroup,
        cameraPosition: window.app.scene.camera ? Array.from(window.app.scene.camera.position.toArray()) : null,
        rendererExists: !!window.app.scene.renderer,
        glOnCanvas: (function() {
          const c = document.getElementById('cell-canvas');
          const gl = c.getContext('webgl2') || c.getContext('webgl');
          return gl ? 'available' : 'not-on-canvas';
        })()
      };
    });
    Object.entries(s).forEach(([k, val]) => {
      console.log(`   ${k}: ${JSON.stringify(val)}`);
    });

    // 5. فحص البطاقات والواجهة
    console.log('\n5. فحص البطاقات والجدول:');
    const u = await page.evaluate(() => ({
      cardsCount: document.querySelectorAll('.organelle-card').length,
      labelsIn3D: document.querySelectorAll('.organelle-label').length,
      comparisonRows: document.querySelectorAll('.comparison-row').length,
      organelleCount: document.querySelector('[data-organelles-count]') ? document.querySelector('[data-organelles-count]').textContent : 'missing',
      loadingOverlayHidden: document.getElementById('loading-overlay').classList.contains('hidden'),
      fallbackVisible: !!document.querySelector('.fallback-message'),
      fallbackText: document.querySelector('.fallback-text') ? document.querySelector('.fallback-text').textContent.trim().substring(0, 80) : ''
    }));
    Object.entries(u).forEach(([k, val]) => console.log(`   ${k}: ${val}`));

    // 6. التقاط لقطة شاشة أولية
    console.log('\n6. التقاط لقطة شاشة أولية:');
    await page.screenshot({ path: '/home/z/my-project/download/cells3d-webgl-plant.png' });
    console.log('   تم: download/cells3d-webgl-plant.png');

    // 7. اختبار النقر على عضية (محاكاة)
    console.log('\n7. اختبار النقر على عضية:');
    const box = await page.evaluate(() => {
      const r = document.getElementById('cell-canvas').getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    // حركة قصيرة جداً للتمويه على hover
    await page.mouse.move(box.x, box.y);
    await new Promise(r => setTimeout(r, 200));
    // نقرة (بدون سحب)
    await page.mouse.click(box.x, box.y);
    await new Promise(r => setTimeout(r, 1500));

    const modal1 = await page.evaluate(() => ({
      modalOpen: document.getElementById('modal-backdrop').classList.contains('open'),
      modalTitle: document.getElementById('modal-title-ar').textContent,
      activeElementId: document.activeElement ? document.activeElement.id : 'none'
    }));
    console.log(`   modalOpen: ${modal1.modalOpen}`);
    console.log(`   modalTitle: ${modal1.modalTitle}`);
    console.log(`   activeElement: ${modal1.activeElementId}`);

    // أغلق النافذة
    await page.evaluate(() => document.getElementById('modal-close').click());
    await new Promise(r => setTimeout(r, 500));

    // لقطة بعد فتح وإغلاق النافذة
    await page.screenshot({ path: '/home/z/my-project/download/cells3d-webgl-after-click.png' });

    // 8. اختبار التمييز بين النقرة والسحب
    console.log('\n8. اختبار التمييز بين النقرة والسحب:');
    const startX = box.x, startY = box.y;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    // حرّك 80px على شكل خطوات صغيرة لمحاكاة سحب فعلي
    for (let i = 1; i <= 16; i++) {
      await page.mouse.move(startX + i * 5, startY + i * 2);
      await new Promise(r => setTimeout(r, 20));
    }
    await page.mouse.up();
    await new Promise(r => setTimeout(r, 800));

    const dragResult = await page.evaluate(() => ({
      modalOpenedAfterDrag: document.getElementById('modal-backdrop').classList.contains('open'),
      pointerTotalMovement: window.app.scene.pointerTotalMovement,
      targetRotationY: parseFloat(window.app.scene.targetRotation.y.toFixed(4)),
      isPointerDown: window.app.scene.isPointerDown
    }));
    console.log(`   modalOpenedAfterDrag: ${dragResult.modalOpenedAfterDrag} (يجب أن يكون false)`);
    console.log(`   pointerTotalMovement: ${dragResult.pointerTotalMovement} (يجب > 6)`);
    console.log(`   targetRotationY: ${dragResult.targetRotationY} (يجب أن يتغير من 0)`);
    console.log(`   isPointerDown: ${dragResult.isPointerDown} (يجب أن يكون false)`);

    // 9. اختبار زر التسميات
    console.log('\n9. اختبار زر إظهار/إخفاء الأسماء:');
    const before = await page.evaluate(() => ({
      count: document.querySelectorAll('.organelle-label').length,
      display: getComputedStyle(document.querySelector('.organelle-labels-container')).display,
      showLabels: window.app.scene.showLabels
    }));
    console.log(`   قبل النقر: count=${before.count}, display=${before.display}, showLabels=${before.showLabels}`);

    await page.evaluate(() => document.getElementById('btn-labels').click());
    await new Promise(r => setTimeout(r, 500));
    const after = await page.evaluate(() => ({
      count: document.querySelectorAll('.organelle-label').length,
      display: getComputedStyle(document.querySelector('.organelle-labels-container')).display,
      showLabels: window.app.scene.showLabels
    }));
    console.log(`   بعد النقر: count=${after.count}, display=${after.display}, showLabels=${after.showLabels}`);

    // أعدها
    await page.evaluate(() => document.getElementById('btn-labels').click());
    await new Promise(r => setTimeout(r, 300));

    // 10. التبديل إلى الخلية الحيوانية
    console.log('\n10. التبديل إلى الخلية الحيوانية:');
    await page.evaluate(() => document.querySelector('[data-cell="animal"]').click());
    await new Promise(r => setTimeout(r, 2000));
    const sw = await page.evaluate(() => ({
      cellType: window.app.currentCell,
      organelleMeshes: window.app.scene.organelleMeshes.length,
      labels: window.app.scene.labels.length,
      infoChip: document.querySelector('#cell-info-chip .chip-title').textContent.trim().substring(0, 30),
      onlyAnimalOrganelles: window.app.scene.organelleMeshes.filter(e => e.data.foundIn.length === 1 && e.data.foundIn[0] === 'animal').map(e => e.data.id)
    }));
    console.log(`   cellType: ${sw.cellType}`);
    console.log(`   organelleMeshes: ${sw.organelleMeshes} (متوقع 9 للحيوانية)`);
    console.log(`   labels: ${sw.labels}`);
    console.log(`   infoChip: ${sw.infoChip}`);
    console.log(`   onlyAnimalOrganelles: ${sw.onlyAnimalOrganelles.join(', ')}`);

    // لقطة للخلية الحيوانية
    await page.screenshot({ path: '/home/z/my-project/download/cells3d-webgl-animal.png' });
    console.log('   لقطة: download/cells3d-webgl-animal.png');

    // 11. التكبير والتصغير
    console.log('\n11. اختبار التكبير والتصغير:');
    const zoomBefore = await page.evaluate(() => window.app.scene.targetDistance);
    await page.evaluate(() => window.app.scene.zoomIn());
    await new Promise(r => setTimeout(r, 300));
    const zoomAfterIn = await page.evaluate(() => window.app.scene.targetDistance);
    await page.evaluate(() => window.app.scene.zoomOut());
    await new Promise(r => setTimeout(r, 300));
    const zoomAfterOut = await page.evaluate(() => window.app.scene.targetDistance);
    console.log(`   قبل: ${zoomBefore}`);
    console.log(`   بعد التكبير: ${zoomAfterIn} (يجب أن يقل)`);
    console.log(`   بعد التصغير: ${zoomAfterOut} (يجب أن يعود للقريب من الأصلي)`);

    // 12. اختبار الموبايل
    console.log('\n12. اختبار على شاشة موبايل (390x844):');
    await page.setViewport({ width: 390, height: 844 });
    await new Promise(r => setTimeout(r, 1500));
    const mobile = await page.evaluate(() => ({
      headerMobileVisible: getComputedStyle(document.querySelector('.comparison-row.header-mobile')).display,
      headerDesktopHidden: getComputedStyle(document.querySelector('.comparison-row.header')).display,
      cardsCount: document.querySelectorAll('.organelle-card').length,
      canvasW: document.getElementById('cell-canvas').clientWidth,
      canvasH: document.getElementById('cell-canvas').clientHeight,
    }));
    console.log(`   رأس الموبايل: ${mobile.headerMobileVisible} (يجب grid)`);
    console.log(`   رأس المكتبي: ${mobile.headerDesktopHidden} (يجب none)`);
    console.log(`   cardsCount: ${mobile.cardsCount}`);
    console.log(`   canvas: ${mobile.canvasW}x${mobile.canvasH}`);

    await page.screenshot({ path: '/home/z/my-project/download/cells3d-webgl-mobile.png', fullPage: false });
    console.log('   لقطة: download/cells3d-webgl-mobile.png');

    // 13. اختبار سلوك فشل WebGL (محاكاة)
    console.log('\n13. اختبار سلوك فشل WebGL (محاكاة):');
    // تعطيل scene مؤقتًا لاختبار أن الأزرار تعرض رسالة تحذير
    await page.evaluate(() => {
      window.__wasReady = window.app.scene.isReady;
      window.app.scene.isReady = false;
    });
    await page.evaluate(() => document.getElementById('btn-pause').click());
    await new Promise(r => setTimeout(r, 500));
    const pauseWarn = await page.evaluate(() => document.getElementById('toast').textContent.trim());
    console.log(`   رسالة عند فشل WebGL: "${pauseWarn}"`);
    // أعدها
    await page.evaluate(() => { window.app.scene.isReady = window.__wasReady; });

    console.log('\n=== اكتمل الاختبار بنجاح ===\n');
    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error('ERROR:', err.message);
    console.error(err.stack);
    try { await browser.close(); } catch(e) {}
    process.exit(1);
  }
})();
