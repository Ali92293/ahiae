/* فحص صياغة JavaScript لجميع ملفات المشروع + سلامة البيانات */
const fs = require('fs');
const path = require('path');

// المسار إلى مجلد المشروع (الأصل لمجلد tests/)
const PROJECT_DIR = path.resolve(__dirname, '..');

let errors = 0;

console.log('=== فحص صياغة JavaScript ===\n');

const files = [
  path.join(PROJECT_DIR, 'data.js'),
  path.join(PROJECT_DIR, 'cell-scene.js'),
  path.join(PROJECT_DIR, 'app.js'),
];

// sandbox يحاكي بيئة المتصفف
function makeFakeElement() {
  const el = {
    style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {},
    appendChild() {},
    remove() {},
    setAttribute() {},
    querySelector: () => makeFakeElement(),
    querySelectorAll: () => [],
    textContent: '',
    innerHTML: '',
    getContext: () => null,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1, height: 1 }),
    parentElement: null,
    focus: () => {},
    scrollIntoView: () => {},
    traverse: () => {},
    addEventListener: () => {},
  };
  return el;
}

function makeSandbox() {
  const windowObj = {};
  const documentObj = {
    getElementById: () => makeFakeElement(),
    createElement: () => makeFakeElement(),
    addEventListener: () => {},
    readyState: 'complete',
    body: {
      classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
      style: {},
      scrollIntoView: () => {},
    },
    querySelector: () => makeFakeElement(),
    querySelectorAll: () => [],
    activeElement: null,
  };
  return {
    window: windowObj,
    document: documentObj,
    console: console,
    setTimeout: () => 0,
    clearTimeout: () => {},
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
  };
}

// تحميل data.js أولاً ليتوفر window.ORGANELLES
const dataCode = fs.readFileSync(path.join(PROJECT_DIR, 'data.js'), 'utf8');
const cellSceneCode = fs.readFileSync(path.join(PROJECT_DIR, 'cell-scene.js'), 'utf8');
const appCode = fs.readFileSync(path.join(PROJECT_DIR, 'app.js'), 'utf8');

// فحص صياغة كل ملف على حدة (بالاعتماد على acorn عبر Function constructor)
files.forEach((file) => {
  const filename = path.basename(file);
  const code = fs.readFileSync(file, 'utf8');
  try {
    // حاول إنشاء دالة من الكود — سيرمي خطأ إذا كانت الصياغة خاطئة
    new Function(code);
    console.log(`✓ ${filename} — صياغة صحيحة`);
  } catch (e) {
    console.log(`✗ ${filename} — خطأ صياغة: ${e.message}`);
    errors++;
  }
});

// فحص سلامة البيانات
console.log('\n=== فحص سلامة بيانات العضيات ===\n');

try {
  const sb = makeSandbox();
  const fn = new Function('window', dataCode);
  fn(sb.window);

  const orgs = sb.window.ORGANELLES;
  const table = sb.window.COMPARISON_TABLE;

  // 1. عدد العضيات
  console.log(`عدد العضيات: ${orgs.length}`);
  if (orgs.length === 10) {
    console.log('✓ العدد متطابق مع المتوقع (10)');
  } else {
    console.log(`✗ العدد غير متوقع: ${orgs.length}`);
    errors++;
  }

  // 2. معرّفات فريدة
  const ids = orgs.map((o) => o.id);
  const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (duplicates.length === 0) {
    console.log('✓ جميع المعرّفات فريدة');
  } else {
    console.log(`✗ معرّفات مكررة: ${duplicates.join(', ')}`);
    errors++;
  }

  // 3. جميع الخصائص المطلوبة موجودة
  const required = [
    'id', 'nameArabic', 'nameEnglish', 'emoji', 'color', 'colorHex',
    'borderColor', 'textColor', 'position', 'radius', 'shape', 'animation',
    'foundIn', 'shortDescription', 'fullDescription', 'functions', 'funFact', 'analogy',
  ];
  let missingCount = 0;
  orgs.forEach((org) => {
    required.forEach((field) => {
      if (!(field in org)) {
        console.log(`✗ العضية ${org.id || '?'} تفتقد الحقل: ${field}`);
        missingCount++;
      }
    });
  });
  if (missingCount === 0) {
    console.log('✓ جميع العضيات تحتوي على الخصائص المطلوبة');
  } else {
    errors += missingCount;
  }

  // 4. foundIn صحيحة
  const validCellTypes = ['plant', 'animal'];
  let invalidFoundIn = 0;
  orgs.forEach((org) => {
    if (!Array.isArray(org.foundIn) || org.foundIn.length === 0) {
      console.log(`✗ العضية ${org.id}: foundIn فارغة`);
      invalidFoundIn++;
    }
    org.foundIn.forEach((c) => {
      if (!validCellTypes.includes(c)) {
        console.log(`✗ العضية ${org.id}: foundIn تحتوي قيمة غير صالحة: ${c}`);
        invalidFoundIn++;
      }
    });
  });
  if (invalidFoundIn === 0) {
    console.log('✓ جميع قيم foundIn صحيحة');
  } else {
    errors += invalidFoundIn;
  }

  // 5. shape صالحة
  const validShapes = ['sphere', 'bean', 'stack', 'tube', 'disc', 'cylinder'];
  let invalidShape = 0;
  orgs.forEach((org) => {
    if (!validShapes.includes(org.shape)) {
      console.log(`✗ العضية ${org.id}: shape غير صالحة: ${org.shape}`);
      invalidShape++;
    }
  });
  if (invalidShape === 0) {
    console.log('✓ جميع قيم shape صالحة');
  } else {
    errors += invalidShape;
  }

  // 6. animation صالحة
  const validAnimations = ['pulse', 'float', 'drift', 'wiggle', 'spin', 'static'];
  let invalidAnim = 0;
  orgs.forEach((org) => {
    if (!validAnimations.includes(org.animation)) {
      console.log(`✗ العضية ${org.id}: animation غير صالحة: ${org.animation}`);
      invalidAnim++;
    }
  });
  if (invalidAnim === 0) {
    console.log('✓ جميع قيم animation صالحة');
  } else {
    errors += invalidAnim;
  }

  // 7. الألوان صالحة (hex)
  const hexColorRegex = /^#[0-9a-f]{6}$/i;
  let invalidColor = 0;
  orgs.forEach((org) => {
    if (!hexColorRegex.test(org.colorHex)) {
      console.log(`✗ العضية ${org.id}: colorHex غير صالح: ${org.colorHex}`);
      invalidColor++;
    }
    if (!hexColorRegex.test(org.borderColor)) {
      console.log(`✗ العضية ${org.id}: borderColor غير صالح: ${org.borderColor}`);
      invalidColor++;
    }
  });
  if (invalidColor === 0) {
    console.log('✓ جميع الألوان بصيغة hex صحيحة');
  } else {
    errors += invalidColor;
  }

  // 8. العضيات النباتية والحيوانية
  const plantOrgs = orgs.filter((o) => o.foundIn.includes('plant'));
  const animalOrgs = orgs.filter((o) => o.foundIn.includes('animal'));
  console.log(`العضيات في الخلية النباتية: ${plantOrgs.length}`);
  console.log(`العضيات في الخلية الحيوانية: ${animalOrgs.length}`);

  // 9. العضيات الخاصة بكل خلية
  const onlyPlant = orgs.filter((o) => o.foundIn.length === 1 && o.foundIn[0] === 'plant');
  const onlyAnimal = orgs.filter((o) => o.foundIn.length === 1 && o.foundIn[0] === 'animal');
  console.log(`عضيات نباتية فقط: ${onlyPlant.map((o) => o.id).join(', ')}`);
  console.log(`عضيات حيوانية فقط: ${onlyAnimal.map((o) => o.id).join(', ')}`);

  // 10. جدول المقارنة
  console.log(`\nعدد صفوف جدول المقارنة: ${table.length}`);
  if (table.length === 8) {
    console.log('✓ جدول المقارنة يحتوي على 8 صفوف');
  } else {
    console.log(`✗ جدول المقارنة يحتوي على ${table.length} صفًّا (متوقع 8)`);
    errors++;
  }

  // 11. جميع صفوف المقارنة لها الحقول المطلوبة
  let invalidRow = 0;
  table.forEach((row, i) => {
    if (!row.feature || !row.animalCell || !row.plantCell) {
      console.log(`✗ صف المقارنة ${i} يفتقد حقولًا`);
      invalidRow++;
    }
  });
  if (invalidRow === 0) {
    console.log('✓ جميع صفوف المقارنة تحتوي على الحقول المطلوبة');
  } else {
    errors += invalidRow;
  }

  // 12. ORGANELLES_COUNT محدد
  if (sb.window.ORGANELLES_COUNT === orgs.length) {
    console.log(`✓ ORGANELLES_COUNT متطابق مع العدد الفعلي (${sb.window.ORGANELLES_COUNT})`);
  } else {
    console.log(`✗ ORGANELLES_COUNT غير متطابق: ${sb.window.ORGANELLES_COUNT} مقابل ${orgs.length}`);
    errors++;
  }

  // 13. functions ليست فارغة
  let emptyFunctions = 0;
  orgs.forEach((org) => {
    if (!Array.isArray(org.functions) || org.functions.length === 0) {
      console.log(`✗ العضية ${org.id}: قائمة الوظائف فارغة`);
      emptyFunctions++;
    }
  });
  if (emptyFunctions === 0) {
    console.log('✓ جميع العضيات لها قائمة وظائف');
  } else {
    errors += emptyFunctions;
  }

  // 14. position تحتوي x, y, z
  let invalidPos = 0;
  orgs.forEach((org) => {
    const p = org.position;
    if (typeof p.x !== 'number' || typeof p.y !== 'number' || typeof p.z !== 'number') {
      console.log(`✗ العضية ${org.id}: position غير صالحة`);
      invalidPos++;
    }
  });
  if (invalidPos === 0) {
    console.log('✓ جميع قيم position صحيحة (x, y, z)');
  } else {
    errors += invalidPos;
  }
} catch (e) {
  console.log(`✗ خطأ في تحميل البيانات: ${e.message}`);
  errors++;
}

console.log(`\n=== النتيجة النهائية ===`);
if (errors === 0) {
  console.log('✅ جميع الفحوص نجحت، لا أخطاء');
  process.exit(0);
} else {
  console.log(`❌ ${errors} خطأ موجود`);
  process.exit(1);
}
