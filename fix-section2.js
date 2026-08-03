// Fixes the remaining section 2 in each article that still lacks AR/TR.
const fs = require('fs');
const path = require('path');

function escRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function addTranslations(content, enH2, arH2, arP, trH2, trP) {
  const arBlock =
    `\n        <div class="lang-block lang-rtl" data-lang="ar">\n          <h2>${arH2}</h2>\n          ${arP}\n        </div>` +
    `\n        <div class="lang-block lang-ltr" data-lang="tr">\n          <h2>${trH2}</h2>\n          ${trP}\n        </div>`;
  const pattern = new RegExp(
    `(<div class="lang-block lang-ltr" data-lang="en">\\s*<h2>${escRe(enH2)}<\\/h2>[\\s\\S]*?<\\/div>)(\\s*<\\/section>)`,
    'g'
  );
  return content.replace(pattern, (_, enDiv, close) => enDiv + arBlock + close);
}

const FIXES = [
  { file: 'article-fair-progression-design.html',
    enH2: 'Pacing by phases',
    arH2: 'التوزيع حسب المراحل',
    arP: '<p>استخدم مراحل مبكرة ومتوسطة وناضجة بأهداف وتيرة مختلفة. المرحلة المبكرة تبني الثقة، والمتوسطة تعلّم الاستراتيجية، والناضجة تعزز الإتقان.</p>\n          <p>عندما تستخدم جميع المراحل منطق وتيرة واحداً تصبح التجربة مسطحة ومتكررة.</p>',
    trH2: 'Aşamaya göre tempo',
    trP: '<p>Farklı tempo hedefleriyle erken, orta ve olgun aşamalar kullanın. Erken aşama güven inşa eder, orta aşama strateji öğretir, olgun aşama ustalığı pekiştirir.</p>\n          <p>Tüm aşamalar aynı tempo mantığını kullandığında deneyim düzleşir ve tekrara döner.</p>' },

  { file: 'article-energy-system-balancing.html',
    enH2: 'Recovery windows and expectation setting',
    arH2: 'نوافذ الاستعادة وتحديد التوقعات',
    arP: '<p>اعرض الاستعادة بوضوح مع فترات زمنية مفهومة. منطق الاستعادة المخفي أو غير المتسق يولّد الإحباط.</p>\n          <p>نوافذ الاستعادة الموثوقة تحسن الثقة والتخطيط لدى المستخدم.</p>',
    trH2: 'Yenileme pencereleri ve beklenti belirleme',
    trP: '<p>Yenilemeyi anlaşılır aralıklarla açıkça gösterin. Gizli veya tutarsız yenileme mantığı hayal kırıklığı yaratır.</p>\n          <p>Güvenilir yenileme pencereleri güveni ve planlamayı geliştirir.</p>' },

  { file: 'article-community-trust-playbook.html',
    enH2: 'Incident communication rules',
    arH2: 'قواعد التواصل عند الحوادث',
    arP: '<p>ابدأ بالحقائق ثم الأثر ثم الخطوة التالية المتوقعة. تجنب الطمأنينة المبهمة التي لا تقدم معلومة حقيقية.</p>\n          <p>التحديثات المصحوبة بطوابع زمنية تزيد الموثوقية المدركة لدى المجتمع بشكل ملحوظ.</p>',
    trH2: 'Olay iletişim kuralları',
    trP: '<p>Önce gerçekleri, sonra etkiyi, ardından beklenen sonraki adımı belirtin. Belirsiz güvencelerden kaçının.</p>\n          <p>Zaman damgalı güncellemeler algılanan güvenilirliği önemli ölçüde artırır.</p>' },

  { file: 'article-security-for-mini-apps.html',
    enH2: 'Identity-bound operations',
    arH2: 'العمليات المرتبطة بالهوية',
    arP: '<p>العمليات الحساسة يجب أن تستمد هوية اللاعب من سياق تيليغرام المُتحقق منه وليس من معرّفات يقدمها المستخدم.</p>\n          <p>هذا يمنع ناقلات انتحال الهوية الأساسية ويبقي المسارات المالية خاضعة للمساءلة الكاملة.</p>',
    trH2: 'Kimliğe bağlı işlemler',
    trP: '<p>Hassas işlemler oyuncu kimliğini kullanıcı tarafından sağlanan kimliklerden değil doğrulanmış Telegram bağlamından türetmelidir.</p>\n          <p>Bu temel kimlik sahteciliği vektörlerini engeller ve finansal yolları tam anlamıyla hesap verebilir kılar.</p>' },

  { file: 'article-content-governance-for-game-sites.html',
    enH2: 'Claim taxonomy',
    arH2: 'تصنيف الادعاءات',
    arP: '<p>صنّف التصريحات على أنها حقيقية أو تفسيرية أو خارطة طريق أو مشروطة.</p>\n          <p>هذا التصنيف يمنع الوعود الزائدة عن غير قصد ويجعل المراجعة التحريرية أسرع وأوضح.</p>',
    trH2: 'İddia taksonomisi',
    trP: '<p>İfadeleri olgusal, açıklayıcı, yol haritası veya koşullu olarak sınıflandırın.</p>\n          <p>Bu yanlışlıkla aşırı söz vermeyi önler ve editoryal incelemeyi hızlandırır.</p>' },

  { file: 'article-onboarding-without-hype.html',
    enH2: 'Expectation framing',
    arH2: 'صياغة التوقعات',
    arP: '<p>أخبر المستخدمين عن حلقة القيمة الحقيقية بلغة سهلة ومباشرة دون مبالغة.</p>\n          <p>تجنب صياغة النتائج المضاربية أو المضمونة التي لا يمكن تحقيقها بشكل موثوق ومتسق.</p>',
    trH2: 'Beklenti çerçeveleme',
    trP: '<p>Kullanıcılara gerçek değer döngüsünü sade ve anlaşılır bir dille abartısız anlatın.</p>\n          <p>Güvenilir biçimde sağlanamayacak spekülatif veya garantili sonuç çerçevesinden kaçının.</p>' },

  { file: 'article-anti-abuse-without-false-positives.html',
    enH2: 'Risk scoring over binary blocking',
    arH2: 'تقييم المخاطر بدلاً من الحجب الثنائي',
    arP: '<p>استخدم درجات مخاطر تدريجية بدلاً من العقوبات الدائمة الفورية عند الاشتباه بالإساءة.</p>\n          <p>الاستجابات الطبقية تقلل الأضرار الجانبية وتمنح فرصة لتصحيح الأخطاء بشكل عادل.</p>',
    trH2: 'İkili engelleme yerine risk puanlaması',
    trP: '<p>Şüpheli durumda anlık kalıcı cezalar yerine kademeli risk puanlaması kullanın.</p>\n          <p>Katmanlı tepkiler yan hasarı azaltır ve hataları adil biçimde düzeltme fırsatı tanır.</p>' },

  { file: 'article-support-ops-for-live-games.html',
    enH2: 'Triage tiers',
    arH2: 'مستويات الفرز',
    arP: '<p>افصل الطلبات إلى فئات واضحة: الحساب والتقدم والتقنية والسياسة.</p>\n          <p>الدقة في التصنيف تختصر وقت الحل وتقلل الانتقال غير الضروري بين الأقسام.</p>',
    trH2: 'Önceliklendirme kademeleri',
    trP: '<p>Talepleri hesap, ilerleme, teknik ve politika kategorilerine net biçimde ayırın.</p>\n          <p>Kategori hassasiyeti çözüm süresini kısaltır ve bölümler arası gereksiz aktarımı azaltır.</p>' },

  { file: 'article-monetization-separation-principles.html',
    enH2: 'Channel separation',
    arH2: 'فصل القنوات',
    arP: '<p>حدّد بوضوح تام الأسطح التحريرية من تلك المدفوعة باللعبة.</p>\n          <p>تجنب الحوافز المتقاطعة بين مشاهدات الإعلانات ونتائج مكافآت اللعبة للحفاظ على الامتثال.</p>',
    trH2: 'Kanal ayrımı',
    trP: '<p>Hangi yüzeylerin editoryal hangilerinin oyun odaklı olduğunu açıkça tanımlayın.</p>\n          <p>Uyumluluğu korumak için reklam görüntülemeleri ile oyun ödül sonuçları arasındaki çapraz teşviklerden kaçının.</p>' },
];

const DIRS = ['.', 'backend/public'];
let updated = 0;

for (const fix of FIXES) {
  for (const dir of DIRS) {
    const fp = path.join(dir, fix.file);
    if (!fs.existsSync(fp)) continue;
    let content = fs.readFileSync(fp, 'utf8');
    const original = content;
    content = addTranslations(content, fix.enH2, fix.arH2, fix.arP, fix.trH2, fix.trP);
    if (content !== original) {
      fs.writeFileSync(fp, content, 'utf8');
      console.log('Fixed:', fp);
      updated++;
    } else {
      console.warn('NO MATCH:', fp, '| h2:', fix.enH2);
    }
  }
}
console.log('\nDone —', updated, 'files updated.');
