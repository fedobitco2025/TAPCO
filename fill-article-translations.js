// Adds Arabic and Turkish translations to sections 2-4 of the 11 incomplete
// articles, and adds an English block to their existing AR/TR-only summary.
const fs = require('fs');
const path = require('path');

// Helper: insert AR+TR after the EN block identified by its h2 heading
function addTranslations(content, enH2, arH2, arP, trH2, trP) {
  const arBlock = `\n        <div class="lang-block lang-rtl" data-lang="ar">\n          <h2>${arH2}</h2>\n          ${arP}\n        </div>\n        <div class="lang-block lang-ltr" data-lang="tr">\n          <h2>${trH2}</h2>\n          ${trP}\n        </div>`;
  // Find the EN section that contains this heading and insert after its closing </div>
  const pattern = new RegExp(
    `(<div class="lang-block lang-ltr" data-lang="en">\\s*<h2>${escRe(enH2)}<\\/h2>[\\s\\S]*?<\\/div>)(\\s*<\\/section>)`,
    'g'
  );
  return content.replace(pattern, (_, enDiv, close) => enDiv + arBlock + close);
}

// Helper: add EN block before the existing AR block in the summary section
function addEnToSummary(content, enH2, enP) {
  const enBlock = `<div class="lang-block lang-ltr" data-lang="en">\n          <h2>${enH2}</h2>\n          <p>${enP}</p>\n        </div>\n        `;
  return content.replace(
    /(<section>\s*)((?:<div class="lang-block lang-rtl" data-lang="ar">))/,
    (_, sec, ar) => sec + enBlock + ar
  );
}

function escRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── Per-article translation data ─────────────────────────────────────────────

const ARTICLES = {

'article-telegram-retention-loops.html': [
  { enH2: 'Design principle 1: visible session value',
    arH2: 'مبدأ التصميم الأول: قيمة جلسة واضحة',
    arP:  '<p>كل جلسة عودة يجب أن تحقق نتيجة محددة وملموسة. الوضوح هو المفتاح: يجب أن يفهم المستخدم النتيجة قبل أن يبدأ.</p>\n          <p>إذا كان هدف الجلسة غامضاً يشعر المستخدم بأنه يعمل بلا وجهة. المنتجات الناجحة تعرض هدفاً رئيسياً واحداً وهدفاً اختيارياً واحداً في كل جلسة.</p>',
    trH2: 'Tasarım ilkesi 1: görünür oturum değeri',
    trP:  '<p>Her geri dönüş oturumu görünür ve sınırlı bir sonuç sunmalıdır. Netlik esastır: kullanıcı başlamadan önce sonucu anlamalıdır.</p>\n          <p>Oturum hedefi belirsizse kullanıcı yönsüz çalıştığını hisseder. Başarılı ürünler oturum başına tek birincil ve tek isteğe bağlı hedef gösterir.</p>' },
  { enH2: 'Design principle 2: fair absence handling',
    arH2: 'مبدأ التصميم الثاني: التعامل العادل مع الغياب',
    arP:  '<p>المستخدمون سيفوّتون جلسات بالتأكيد. العقاب المفرط على الغياب يخلق قلقاً ويدفع للانسحاب. استخدم مسارات استرداد لطيفة تحافظ على الدافع دون محو الجهد.</p>\n          <p>هذا النهج يحسن جودة الاحتفاظ على المدى الطويل لأنه يكافئ الاستمرارية مع احترام قيود الحياة الحقيقية.</p>',
    trH2: 'Tasarım ilkesi 2: adil devamsızlık yönetimi',
    trP:  '<p>Kullanıcılar kaçınılmaz olarak oturumları atlayacaktır. Devamsızlığı aşırı cezalandırmak kaygı ve terk oranını artırır. Çabayı silmeden motivasyonu koruyan yumuşak kurtarma yolları kullanın.</p>\n          <p>Bu yaklaşım gerçek yaşam kısıtlamalarına saygı gösterirken tutarlılığı ödüllendirdiğinden uzun vadeli tutundurma kalitesini artırır.</p>' },
  { enH2: 'Design principle 3: integrity-aligned rewards',
    arH2: 'مبدأ التصميم الثالث: مكافآت متوافقة مع النزاهة',
    arP:  '<p>حلقات الاحتفاظ يجب ألا تتجاوز منطق التحقق أبداً. إذا مُنحت مكافآت الحلقة اليومية دون فحوص مكافحة الإساءة ستهيمن حركة المرور الآلية على النظام.</p>\n          <p>النمو المستدام يأتي من دمج تصميم الحلقة مع التحقق الخلفي وليس من زيادة حجم المكافآت وحده.</p>',
    trH2: 'Tasarım ilkesi 3: bütünlükle örtüşen ödüller',
    trP:  '<p>Tutundurma döngüleri hiçbir zaman doğrulama mantığını atlatmamalıdır. Günlük döngü ödülleri kötüye kullanım önleme kontrolleri olmadan verilirse otomatik trafik sisteme hâkim olur.</p>\n          <p>Sürdürülebilir büyüme döngü tasarımını arka uç doğrulamasıyla entegre etmekten gelir; sadece ödül hacmini artırmaktan değil.</p>' },
  { summary: true, enH2: 'Key takeaway',
    enP: 'Retention design works when users understand why they return, what they gain, and what happens when they miss a session. Transparency and verification together produce sustainable daily activity.' },
],

'article-fair-progression-design.html': [
  { enH2: 'Phase pacing',
    arH2: 'توزيع الوتيرة حسب المراحل',
    arP:  '<p>استخدم مراحل مبكرة ومتوسطة وناضجة بأهداف وتيرة مختلفة. المرحلة المبكرة تبني الثقة، المتوسطة تعلّم الاستراتيجية، والناضجة تعزز الإتقان.</p>\n          <p>عندما تستخدم جميع المراحل منطق وتيرة واحداً تصبح التجربة مسطحة ومتكررة.</p>',
    trH2: 'Aşamaya göre tempo dağılımı',
    trP:  '<p>Farklı tempo hedefleriyle erken, orta ve olgun aşamalar kullanın. Erken aşama güven inşa eder, orta aşama strateji öğretir, olgun aşama ustalığı pekiştirir.</p>\n          <p>Tüm aşamalar aynı tempo mantığını kullandığında deneyim düzleşir ve tekrara döner.</p>' },
  { enH2: 'Milestone visibility',
    arH2: 'وضوح نقاط التقدم',
    arP:  '<p>يجب أن تكون نقاط التقدم قريبة كفاية لتحفّز وبعيدة كفاية لتبدو ذات معنى. أظهر نقاط التقدم القادمة بوضوح حتى يتمكن المستخدمون من التخطيط لجلساتهم.</p>\n          <p>نقاط التقدم المخفية تقلل الإحساس بالسيطرة وتخفض الالتزام.</p>',
    trH2: 'Kilometre taşı görünürlüğü',
    trP:  '<p>Kilometre taşları motive edecek kadar yakın, anlamlı hissettirecek kadar uzak olmalıdır. Kullanıcıların oturumlarını planlayabilmesi için yaklaşan kilometre taşlarını açıkça gösterin.</p>\n          <p>Gizli kilometre taşları algılanan kontrolü azaltır ve bağlılığı düşürür.</p>' },
  { enH2: 'Friction that teaches, not punishes',
    arH2: 'الاحتكاك الذي يعلّم ولا يعاقب',
    arP:  '<p>بعض الاحتكاك صحي لأنه يُدخل جودة القرار. لكن الاحتكاك العقابي بدون تفسير يبدو غير عادل.</p>\n          <p>استخدم الاحتكاك لتعليم أنماط لعب أفضل ثم كافئ التكيّف.</p>',
    trH2: 'Cezalandırmayan, öğreten sürtüşme',
    trP:  '<p>Bir miktar sürtüşme sağlıklıdır çünkü karar kalitesi getirir. Ancak açıklama olmayan cezalandırıcı sürtüşme adaletsiz hissettirir.</p>\n          <p>Daha iyi oyun kalıpları öğretmek için sürtüşme kullanın ardından uyumu ödüllendirin.</p>' },
  { summary: true, enH2: 'Key takeaway',
    enP: 'Fair progression keeps players engaged by offering visible milestones, honest pacing, and friction that teaches rather than punishes. Clarity at every stage reduces frustration and improves long-term retention.' },
],

'article-energy-system-balancing.html': [
  { enH2: 'Recovery display',
    arH2: 'عرض الاستعادة بوضوح',
    arP:  '<p>اعرض الاستعادة بوضوح مع فترات زمنية مفهومة. منطق الاستعادة المخفي أو غير المتسق يولّد الإحباط.</p>\n          <p>نوافذ الاستعادة الموثوقة تحسن الثقة والتخطيط لدى المستخدم.</p>',
    trH2: 'Yenilemeyi açıkça göster',
    trP:  '<p>Yenilemeyi anlaşılır aralıklarla açıkça gösterin. Gizli veya tutarsız yenileme mantığı hayal kırıklığı yaratır.</p>\n          <p>Güvenilir yenileme pencereleri güveni ve planlamayı geliştirir.</p>' },
  { enH2: 'Upgrade impact boundaries',
    arH2: 'حدود تأثير التطويرات',
    arP:  '<p>التطويرات المرتبطة بالطاقة يجب أن تبدو ذات معنى دون خلق أنماط الدفع للتجاوز.</p>\n          <p>ضع حدوداً صارمة وأعلن عنها علنياً للحفاظ على العدالة.</p>',
    trH2: 'Geliştirme etki sınırları',
    trP:  '<p>Enerjiyle ilgili geliştirmeler ödeme yaparak atlama kalıpları oluşturmadan anlamlı hissetmelidir.</p>\n          <p>Adilliği korumak için kesin üst sınırlar belirleyin ve bunları kamuoyuna açıklayın.</p>' },
  { enH2: 'Anti-abuse integration',
    arH2: 'التكامل مع مكافحة الإساءة',
    arP:  '<p>يجب التحقق من أنظمة الطاقة من جانب الخادم لمنع الإساءة عبر إعادة التشغيل أو الأتمتة.</p>\n          <p>العدالة التشغيلية تعتمد على كل من التصميم والتطبيق معاً.</p>',
    trH2: 'Kötüye kullanım önleme entegrasyonu',
    trP:  '<p>Enerji sistemleri tekrar oynatma veya otomasyon kötüye kullanımını önlemek için sunucu tarafında doğrulanmalıdır.</p>\n          <p>Operasyonel adalet hem tasarıma hem de uygulamaya bağlıdır.</p>' },
  { summary: true, enH2: 'Key takeaway',
    enP: 'Balanced energy systems show clear recovery windows, set fair upgrade caps, and validate all interactions server-side. Transparency and anti-abuse integration together protect both player experience and system integrity.' },
],

'article-community-trust-playbook.html': [
  { enH2: 'Incident communication',
    arH2: 'التواصل عند الحوادث',
    arP:  '<p>ابدأ بالحقائق ثم الأثر ثم الخطوة التالية المتوقعة. تجنب الطمأنينة المبهمة.</p>\n          <p>التحديثات المصحوبة بطوابع زمنية تزيد الموثوقية المدركة لدى المجتمع.</p>',
    trH2: 'Olay iletişimi',
    trP:  '<p>Önce gerçekleri, sonra etkiyi, ardından beklenen sonraki adımı belirtin. Belirsiz güvencelerden kaçının.</p>\n          <p>Zaman damgalı güncellemeler algılanan güvenilirliği artırır.</p>' },
  { enH2: 'Policy consistency',
    arH2: 'اتساق السياسات',
    arP:  '<p>انشر حدوداً واضحة وطبّقها بالتساوي على جميع المستخدمين.</p>\n          <p>التطبيق غير المتسق هو أسرع طريق لشك المجتمع وتآكل الثقة.</p>',
    trH2: 'Politika tutarlılığı',
    trP:  '<p>Net sınırlar yayınlayın ve bunları tüm kullanıcılara eşit biçimde uygulayın.</p>\n          <p>Tutarsız uygulama topluluk şüpheciliğine giden en hızlı yoldur.</p>' },
  { enH2: 'Feedback loops',
    arH2: 'حلقات التغذية الراجعة',
    arP:  '<p>اجمع نقاط الألم المتكررة للمستخدمين وحوّلها إلى تحديثات خارطة الطريق.</p>\n          <p>المجتمعات تثق في الفرق التي تُغلق الحلقات علناً وتُظهر أنها سمعت.</p>',
    trH2: 'Geri bildirim döngüleri',
    trP:  '<p>Yinelenen kullanıcı sorunlarını toplayın ve bunları yol haritası güncellemelerine dönüştürün.</p>\n          <p>Topluluklar döngüleri kamuoyunda kapatan ekiplere güvenir.</p>' },
  { summary: true, enH2: 'Key takeaway',
    enP: 'Community trust is built through consistent communication, transparent policies, and visible follow-through. Teams that close feedback loops publicly earn long-term credibility with their player base.' },
],

'article-security-for-mini-apps.html': [
  { enH2: 'Identity verification',
    arH2: 'التحقق من الهوية',
    arP:  '<p>العمليات الحساسة يجب أن تستمد هوية اللاعب من سياق تيليغرام المُتحقق منه وليس من معرّفات يقدمها المستخدم.</p>\n          <p>هذا يمنع ناقلات انتحال الهوية الأساسية ويبقي المسارات المالية خاضعة للمساءلة.</p>',
    trH2: 'Kimlik doğrulama',
    trP:  '<p>Hassas işlemler oyuncu kimliğini kullanıcı tarafından sağlanan kimliklerden değil doğrulanmış Telegram bağlamından türetmelidir.</p>\n          <p>Bu temel kimlik sahteciliği vektörlerini engeller ve finansal yolları hesap verebilir tutar.</p>' },
  { enH2: 'Replay and timing protection',
    arH2: 'الحماية من إعادة التشغيل والتوقيت',
    arP:  '<p>استخدم نوافذ الطوابع الزمنية وفحوص nonce والقدرة على التكامل في العمليات القابلة للتعديل.</p>\n          <p>مقاومة إعادة التشغيل أمر بالغ الأهمية عندما تُقابَل إجراءات المستخدم بنتائج الرصيد أو المكافآت.</p>',
    trH2: 'Tekrar oynatma ve zamanlama koruması',
    trP:  '<p>Değiştirilebilir işlemler için zaman damgası pencereleri, nonce kontrolleri ve idempotency kullanın.</p>\n          <p>Kullanıcı eylemleri bakiye veya ödül sonuçlarıyla eşleştiğinde tekrar oynatma direnci kritik önem taşır.</p>' },
  { enH2: 'Fail-closed by default',
    arH2: 'إغلاق آمن بشكل افتراضي',
    arP:  '<p>عندما يفشل التحقق يجب أن ترفض العمليات بأمان بدلاً من الاستمرار جزئياً.</p>\n          <p>سلوك الفشل المفتوح يخلق تناقضات صامتة مكلفة الإصلاح على المدى الطويل.</p>',
    trH2: 'Varsayılan olarak güvenli kapalı',
    trP:  '<p>Doğrulama başarısız olduğunda işlemler kısmen devam etmek yerine güvenli şekilde reddedilmelidir.</p>\n          <p>Açık hata davranışı düzeltmesi maliyetli olan sessiz tutarsızlıklar yaratır.</p>' },
  { summary: true, enH2: 'Key takeaway',
    enP: 'Secure mini apps verify identity from trusted context, protect against replay attacks with nonces and timestamps, and fail closed when verification cannot be confirmed. Each layer reduces exploitable surface area.' },
],

'article-content-governance-for-game-sites.html': [
  { enH2: 'Content classification',
    arH2: 'تصنيف المحتوى',
    arP:  '<p>صنّف التصريحات على أنها حقيقية أو تفسيرية أو خارطة طريق أو مشروطة.</p>\n          <p>هذا التصنيف يمنع الوعود الزائدة عن غير قصد ويجعل المراجعة أسرع وأوضح.</p>',
    trH2: 'İçerik sınıflandırması',
    trP:  '<p>İfadeleri olgusal, açıklayıcı, yol haritası veya koşullu olarak sınıflandırın.</p>\n          <p>Bu yanlışlıkla aşırı söz vermeyi önler ve incelemeyi hızlandırır.</p>' },
  { enH2: 'Multilingual consistency',
    arH2: 'الاتساق متعدد اللغات',
    arP:  '<p>كتل اللغة المختلفة يجب أن تنقل نفس قصد السياسة دون انجراف في المعنى.</p>\n          <p>الانجراف في الترجمة يمكن أن يخلق مخاطر الامتثال حتى عندما يكون النص المصدر صحيحاً.</p>',
    trH2: 'Çok dilli tutarlılık',
    trP:  '<p>Farklı dil blokları anlam kayması olmadan aynı politika amacını iletmelidir.</p>\n          <p>Çeviri sapması kaynak metin doğru olsa bile uyumluluk riski yaratabilir.</p>' },
  { enH2: 'Review workflow',
    arH2: 'سير عمل المراجعة',
    arP:  '<p>استخدم قائمة تحقق بسيطة للنشر: الدقة وسلامة السياسة ووضوح المستخدم وربط الدعم.</p>\n          <p>الانضباط التحريري يراكم مصداقية الموقع مع الوقت بشكل تدريجي وثابت.</p>',
    trH2: 'İnceleme iş akışı',
    trP:  '<p>Basit bir yayın kontrol listesi kullanın: doğruluk, politika güvenliği, kullanıcı netliği ve destek bağlantısı.</p>\n          <p>Editoryal disiplin zaman içinde site güvenilirliğini birikimli olarak artırır.</p>' },
  { summary: true, enH2: 'Key takeaway',
    enP: 'Content governance protects site credibility by classifying claims accurately, maintaining consistent meaning across languages, and applying a structured review workflow before every publish.' },
],

'article-onboarding-without-hype.html': [
  { enH2: 'Clear value communication',
    arH2: 'التواصل الواضح عن القيمة',
    arP:  '<p>أخبر المستخدمين عن حلقة القيمة الحقيقية بلغة سهلة ومباشرة.</p>\n          <p>تجنب صياغة النتائج المضاربية أو المضمونة التي لا يمكن تحقيقها بشكل موثوق.</p>',
    trH2: 'Net değer iletişimi',
    trP:  '<p>Kullanıcılara gerçek değer döngüsünü sade ve anlaşılır bir dille anlatın.</p>\n          <p>Spekülatif veya garantili sonuç çerçevesinden kaçının.</p>' },
  { enH2: 'First-success design',
    arH2: 'تصميم النجاح الأول',
    arP:  '<p>يجب أن تحقق الجلسة الأولى إشارة نجاح واحدة ذات معنى في غضون دقائق من البداية.</p>\n          <p>الثقة المبكرة تحسن جودة التفعيل وترفع معدلات الاستمرار.</p>',
    trH2: 'İlk başarı tasarımı',
    trP:  '<p>İlk oturum başladıktan dakikalar içinde tek anlamlı bir başarı sinyali üretmelidir.</p>\n          <p>Erken güven aktivasyon kalitesini artırır ve devam oranlarını yükseltir.</p>' },
  { enH2: 'Support-connected onboarding',
    arH2: 'الإعداد المرتبط بالدعم',
    arP:  '<p>يجب أن يكشف الإعداد عن مسارات مباشرة لصفحة الأسئلة الشائعة والدعم من البداية.</p>\n          <p>تقليل الارتباك مبكراً يخفض معدل الانسحاب على مدار دورة حياة المستخدم.</p>',
    trH2: 'Destekle bağlantılı oryantasyon',
    trP:  '<p>Oryantasyon başından itibaren SSS ve desteğe doğrudan yollar açmalıdır.</p>\n          <p>Erken karışıklığı azaltmak kullanıcı yaşam döngüsü boyunca kayıp oranını düşürür.</p>' },
  { summary: true, enH2: 'Key takeaway',
    enP: 'Onboarding built on clarity rather than hype produces better activation and longer retention. Honest value framing, early success signals, and visible support pathways set realistic expectations from the first session.' },
],

'article-anti-abuse-without-false-positives.html': [
  { enH2: 'Graduated risk states',
    arH2: 'حالات المخاطر التدريجية',
    arP:  '<p>استخدم حالات مخاطر تدريجية بدلاً من العقوبات الدائمة الفورية عند الاشتباه.</p>\n          <p>الاستجابات الطبقية تقلل الأضرار الجانبية وتمنح فرصة لتصحيح الأخطاء.</p>',
    trH2: 'Kademeli risk durumları',
    trP:  '<p>Şüphe durumunda anlık kalıcı cezalar yerine kademeli risk durumları kullanın.</p>\n          <p>Katmanlı tepkiler yan hasarı azaltır ve hataları düzeltme fırsatı tanır.</p>' },
  { enH2: 'Evidence-linked decisions',
    arH2: 'قرارات مرتبطة بالأدلة',
    arP:  '<p>يجب أن تكون الإجراءات مرتبطة بأدلة أحداث قابلة للتتبع والمراجعة.</p>\n          <p>التطبيق المبهم يُضعف الثقة بسرعة ويجعل الاستئناف مستحيلاً.</p>',
    trH2: 'Kanıta bağlı kararlar',
    trP:  '<p>Eylemler izlenebilir ve incelenebilir olay kanıtına bağlı olmalıdır.</p>\n          <p>Şeffaf olmayan uygulama güveni hızla aşındırır ve itirazı imkânsız kılar.</p>' },
  { enH2: 'Recovery and appeal',
    arH2: 'الاسترداد والاستئناف',
    arP:  '<p>امنح المستخدمين مساراً واضحاً لحل الاكتشافات الخاطئة عبر الدعم.</p>\n          <p>آليات التصحيح العادلة جزء لا يتجزأ من جودة منظومة الأمان الكاملة.</p>',
    trH2: 'Kurtarma ve itiraz',
    trP:  '<p>Kullanıcılara destek yoluyla yanlış tespitleri çözme için net bir yol verin.</p>\n          <p>Adil düzeltme mekanizmaları güvenlik kalitesinin ayrılmaz bir parçasıdır.</p>' },
  { summary: true, enH2: 'Key takeaway',
    enP: 'Effective anti-abuse systems protect honest players by using graduated risk states, tying enforcement to traceable evidence, and providing recovery paths when automated detection makes mistakes.' },
],

'article-support-ops-for-live-games.html': [
  { enH2: 'Request categorisation',
    arH2: 'تصنيف الطلبات',
    arP:  '<p>افصل الطلبات إلى فئات: الحساب والتقدم والتقنية والسياسة.</p>\n          <p>الدقة في التصنيف تختصر وقت الحل وتقلل الانتقال بين الأقسام.</p>',
    trH2: 'Talep kategorize etme',
    trP:  '<p>Talepleri hesap, ilerleme, teknik ve politika kategorilerine ayırın.</p>\n          <p>Kategori hassasiyeti çözüm süresini kısaltır ve bölümler arası aktarımı azaltır.</p>' },
  { enH2: 'Evidence-first handling',
    arH2: 'التعامل بالأدلة أولاً',
    arP:  '<p>اجمع الطوابع الزمنية وسياق الجلسة والمؤشرات القابلة للتكرار قبل أي تصعيد.</p>\n          <p>المدخلات الأفضل تؤدي إلى إصلاحات هندسية أسرع وأدق.</p>',
    trH2: 'Önce kanıt yaklaşımı',
    trP:  '<p>Eskalasyondan önce zaman damgaları, oturum bağlamı ve tekrarlanabilir göstergeler toplayın.</p>\n          <p>Daha iyi girdiler daha hızlı ve daha doğru mühendislik düzeltmelerine yol açar.</p>' },
  { enH2: 'Closed-loop communication',
    arH2: 'التواصل بإغلاق الحلقة',
    arP:  '<p>أخبر المستخدمين عند حل المشكلات ووثّق الإصلاحات المتكررة علناً في صفحات الدعم.</p>\n          <p>جودة الإغلاق تؤثر بشكل مباشر على الثقة على المدى الطويل.</p>',
    trH2: 'Kapalı döngü iletişimi',
    trP:  '<p>Sorunlar çözüldüğünde kullanıcıları bilgilendirin ve yinelenen düzeltmeleri destek sayfalarında kamuoyunda belgeleyin.</p>\n          <p>Kapanış kalitesi uzun vadeli güveni doğrudan etkiler.</p>' },
  { summary: true, enH2: 'Key takeaway',
    enP: 'Support operations in live games improve resolution quality by categorising requests accurately, collecting evidence before escalation, and closing the loop with users and public documentation when issues are resolved.' },
],

'article-metrics-that-matter-in-tap-games.html': [
  { enH2: 'Activation quality',
    arH2: 'جودة التفعيل',
    arP:  '<p>تتبّع ما إذا كان مستخدمو الجلسة الأولى يصلون إلى معالم ذات معنى وليس فقط أعداد التسجيل.</p>\n          <p>التفعيل الصحي يتنبأ بالاحتفاظ الأطول ويكشف ثغرات تجربة الإعداد مبكراً.</p>',
    trH2: 'Aktivasyon kalitesi',
    trP:  '<p>Yalnızca kayıt sayısı değil ilk oturum kullanıcılarının anlamlı kilometre taşlarına ulaşıp ulaşmadığını takip edin.</p>\n          <p>Sağlıklı aktivasyon daha uzun tutundurmanın habercisidir ve oryantasyon boşluklarını erken ortaya koyar.</p>' },
  { enH2: 'Progression stability',
    arH2: 'استقرار التقدم',
    arP:  '<p>قِس التسرّب عند بوابات التقدم وعقبات التطويرات لتحديد نقاط الاحتكاك.</p>\n          <p>المنحنيات غير المستقرة تظهر مبكراً في تحليلات القمع وتشير إلى مشاكل التصميم.</p>',
    trH2: 'İlerleme istikrarı',
    trP:  '<p>İlerleme kapılarındaki ve geliştirme darboğazlarındaki düşüşleri ölçerek sürtüşme noktalarını belirleyin.</p>\n          <p>Dengesiz eğriler huni analizlerinde erken görünür ve tasarım sorunlarına işaret eder.</p>' },
  { enH2: 'Trust indicators',
    arH2: 'مؤشرات الثقة',
    arP:  '<p>راقب معدل تكرار الدعم وشكاوى السياسات وانعكاسات التطبيق الإيجابي الكاذب.</p>\n          <p>مقاييس الثقة تكشف المخاطر الخفية للمنتج التي لا تظهر في لوحات البيانات التقليدية.</p>',
    trH2: 'Güven göstergeleri',
    trP:  '<p>Destek tekrarlama oranını, politikayla ilgili şikayetleri ve yanlış pozitif uygulama geri almalarını izleyin.</p>\n          <p>Güven metrikleri geleneksel panolarda görünmeyen gizli ürün riskini ortaya koyar.</p>' },
  { summary: true, enH2: 'Key takeaway',
    enP: 'Metrics worth tracking go beyond installs and daily active users. Activation quality, progression stability, and trust indicators together reveal the real health of a tap game and guide better product decisions.' },
],

'article-monetization-separation-principles.html': [
  { enH2: 'Surface definition',
    arH2: 'تعريف الأسطح',
    arP:  '<p>حدّد الأسطح التحريرية من تلك المدفوعة باللعبة بوضوح تام.</p>\n          <p>تجنب الحوافز المتقاطعة بين مشاهدات الإعلانات ونتائج مكافآت اللعبة.</p>',
    trH2: 'Yüzey tanımı',
    trP:  '<p>Hangi yüzeylerin editoryal hangilerinin oyun odaklı olduğunu açıkça tanımlayın.</p>\n          <p>Reklam görüntülemeleri ile oyun ödül sonuçları arasındaki çapraz tetikleyici teşviklerden kaçının.</p>' },
  { enH2: 'Language separation',
    arH2: 'الفصل اللغوي',
    arP:  '<p>الصفحات التحريرية يجب أن تستخدم لغة تعليمية وليس إطار المكافآت التجارية.</p>\n          <p>اللغة الواضحة تقلل الغموض لدى المراجعين وتحمي الموقع من مخاطر السياسات.</p>',
    trH2: 'Dil ayrımı',
    trP:  '<p>Editoryal sayfalar işlemsel ödül çerçevelemesi değil eğitici dil kullanmalıdır.</p>\n          <p>Net dil inceleyici belirsizliğini azaltır ve siteyi politika risklerinden korur.</p>' },
  { enH2: 'Operational controls',
    arH2: 'الضوابط التشغيلية',
    arP:  '<p>طبّق فحوصات داخلية لمنع الاقتران العرضي بين منطق الإعلانات والمكافآت.</p>\n          <p>ضوابط الحوكمة تحافظ على الامتثال وتمنع الانجراف على المدى الطويل.</p>',
    trH2: 'Operasyonel kontroller',
    trP:  '<p>Reklam ve ödül mantığı arasındaki yanlışlıkla oluşan bağlantıyı önlemek için dahili kontroller uygulayın.</p>\n          <p>Yönetişim kontrolleri uyumluluğu korur ve uzun vadeli sapmayı önler.</p>' },
  { summary: true, enH2: 'Key takeaway',
    enP: 'Monetization integrity requires clear surface definitions, educational language on editorial pages, and operational controls that prevent ad logic from coupling with reward outcomes. Separation protects both trust and compliance.' },
],

};

// ─── Apply to files ────────────────────────────────────────────────────────────

const DIRS = ['.', 'backend/public'];
let totalUpdated = 0;

for (const [filename, entries] of Object.entries(ARTICLES)) {
  for (const dir of DIRS) {
    const fp = path.join(dir, filename);
    if (!fs.existsSync(fp)) continue;
    let content = fs.readFileSync(fp, 'utf8');
    const original = content;

    for (const entry of entries) {
      if (entry.summary) {
        content = addEnToSummary(content, entry.enH2, entry.enP);
      } else {
        content = addTranslations(content, entry.enH2, entry.arH2, entry.arP, entry.trH2, entry.trP);
      }
    }

    if (content !== original) {
      fs.writeFileSync(fp, content, 'utf8');
      console.log('Updated:', fp);
      totalUpdated++;
    } else {
      console.warn('No change (check h2 match):', fp);
    }
  }
}

console.log('\nDone —', totalUpdated, 'files updated.');
