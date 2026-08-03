// Fixes missing Turkish special characters across all HTML pages and site.js.
// Replacements are applied only within data-lang="tr" blocks in HTML files,
// and within the tr:{} section in site.js.
const fs = require('fs');
const path = require('path');

// Ordered list: longer / more specific patterns first to avoid partial matches
const CORRECTIONS = [
  // ── Multi-word phrases ──────────────────────────────────────────────────────
  ['Reklam Politikasi', 'Reklam Politikası'],
  ['Gizlilik Politikasini Oku', 'Gizlilik Politikasını Oku'],
  ['Tumunu Kabul Et', 'Tümünü Kabul Et'],
  ['Yalnizca Zorunlu', 'Yalnızca Zorunlu'],
  ["Telegram'da Ac", "Telegram'da Aç"],
  ['Referans Baglantisini Kopyala', 'Referans Bağlantısını Kopyala'],
  ['Baslatmak icin Telegram bot kullanici adini girin', 'Başlatmak için Telegram bot kullanıcı adını girin'],
  ['Bot kullanici adi gerekli', 'Bot kullanıcı adı gerekli'],
  ['Telegram Kullanici Adi', 'Telegram Kullanıcı Adı'],
  ['Sorunun kisa ozeti', 'Sorunun kısa özeti'],
  ['Ornek: @username', 'Örnek: @username'],
  ['Sorununuzu faydali ayrintilarla aciklayin', 'Sorununuzu faydalı ayrıntılarla açıklayın'],
  ['E-posta Taslagi Olustur', 'E-posta Taslağı Oluştur'],
  ['support@tapcogame.io ac', 'support@tapcogame.io aç'],
  ['taslagi olusturulmadan once alanlar tarayicida temizlenir', 'taslağı oluşturulmadan önce alanlar tarayıcıda temizlenir'],
  ['taslagi posta uygulamanizda acildi', 'taslağı posta uygulamanızda açıldı'],
  ['Cerez Bildirimi', 'Çerez Bildirimi'],
  ['devamli kalmasi icin temel tarayici depolamasi kullanir', 'devamlı kalması için temel tarayıcı depolaması kullanır'],
  ['Etkinlestirilirse analiz veya reklam araclari ek cerezler kullanabilir', 'Etkinleştirilirse analiz veya reklam araçları ek çerezler kullanabilir'],
  ['Tum haklari saklidir', 'Tüm hakları saklıdır'],
  ['kullanici adi', 'kullanıcı adı'],
  ['Kullanici Adi', 'Kullanıcı Adı'],
  ['istege bagli', 'isteğe bağlı'],
  ['Istege bagli', 'İsteğe bağlı'],
  ['Kopyalandi', 'Kopyalandı'],
  ['Kopyalanamadi', 'Kopyalanamadı'],

  // ── Ç / ç ───────────────────────────────────────────────────────────────────
  ['Etkinlestirilirse', 'Etkinleştirilirse'],
  ['etkinlestirilirse', 'etkinleştirilirse'],
  ['Cerezler', 'Çerezler'], ['cerezler', 'çerezler'],
  ['Cerez', 'Çerez'],       ['cerez', 'çerez'],
  ['Cekim', 'Çekim'],       ['cekim', 'çekim'],
  ['Cikarip', 'Çıkarıp'],   ['cikarip', 'çıkarıp'],
  ['Cikarmak', 'Çıkarmak'], ['cikarmak', 'çıkarmak'],
  ['Cikmak', 'Çıkmak'],     ['cikmak', 'çıkmak'],
  ['Cikti', 'Çıktı'],       ['cikti', 'çıktı'],
  ['Cizgi', 'Çizgi'],       ['cizgi', 'çizgi'],
  ['Gercekten', 'Gerçekten'],['gercekten', 'gerçekten'],
  ['Gercek', 'Gerçek'],     ['gercek', 'gerçek'],
  ['Aciklamayi', 'Açıklamayı'],
  ['Aciklamalar', 'Açıklamalar'],
  ['Aciklayan', 'Açıklayan'],['aciklayan', 'açıklayan'],
  ['Aciklamak', 'Açıklamak'],['aciklamak', 'açıklamak'],
  ['Aciklar', 'Açıklar'],   ['aciklar', 'açıklar'],
  ['Aciklik', 'Açıklık'],   ['aciklik', 'açıklık'],
  ['Acisindan', 'Açısından'],['acisindan', 'açısından'],
  ['Acildi', 'Açıldı'],     ['acildi', 'açıldı'],
  ['Aciga', 'Açığa'],       ['aciga', 'açığa'],
  ['Acin', 'Açın'],         ['acin', 'açın'],
  ['Acik', 'Açık'],         ['acik', 'açık'],
  ['Araclari', 'Araçları'], ['araclari', 'araçları'],
  ['Araclar', 'Araçlar'],   ['araclar', 'araçlar'],
  ['Araciligiyla', 'Aracılığıyla'],['araciligiyla', 'aracılığıyla'],
  ['Arac', 'Araç'],         ['arac', 'araç'],
  ['Arttirir', 'Artırır'],  ['arttirir', 'artırır'],
  ['Artirmak', 'Artırmak'], ['artirmak', 'artırmak'],
  ['Artisi', 'Artışı'],     ['artisi', 'artışı'],
  ['Artis', 'Artış'],       ['artis', 'artış'],
  ['Calismak', 'Çalışmak'], ['calismak', 'çalışmak'],
  ['Calisma', 'Çalışma'],   ['calisma', 'çalışma'],
  ['Olusturmak', 'Oluşturmak'],['olusturmak', 'oluşturmak'],
  ['Olusturma', 'Oluşturma'],['olusturma', 'oluşturma'],
  ['Olusturur', 'Oluşturur'],['olusturur', 'oluşturur'],
  ['Olusturan', 'Oluşturan'],['olusturan', 'oluşturan'],
  ['Olustur', 'Oluştur'],   ['olustur', 'oluştur'],
  ['Mesruiyet', 'Meşruiyet'],['mesruiyet', 'meşruiyet'],
  ['Mesru', 'Meşru'],       ['mesru', 'meşru'],
  ['Konusmak', 'Konuşmak'], ['konusmak', 'konuşmak'],
  ['Konusma', 'Konuşma'],   ['konusma', 'konuşma'],
  ['Kosullari', 'Koşulları'],['kosullari', 'koşulları'],
  ['Kosullar', 'Koşullar'], ['kosullar', 'koşullar'],
  ['Kosul', 'Koşul'],       ['kosul', 'koşul'],
  ['Seffaflik', 'Şeffaflık'],['seffaflik', 'şeffaflık'],
  ['Seffaf', 'Şeffaf'],     ['seffaf', 'şeffaf'],
  ['Icerik', 'İçerik'],     ['icerik', 'içerik'],
  ['Icinde', 'İçinde'],     ['icinde', 'içinde'],
  ['Icin', 'İçin'],         ['icin', 'için'],
  ['Isaret', 'İşaret'],     ['isaret', 'işaret'],
  ['Islemleri', 'İşlemleri'],['islemleri', 'işlemleri'],
  ['Islemlere', 'İşlemlere'],['islemlere', 'işlemlere'],
  ['Islemler', 'İşlemler'], ['islemler', 'işlemler'],
  ['Islem', 'İşlem'],       ['islem', 'işlem'],
  ['Isletmek', 'İşletmek'], ['isletmek', 'işletmek'],
  ['Iletisim', 'İletişim'],
  ['Ipucu', 'İpucu'],
  ['Sureciniz', 'Süreciniz'],
  ['Surecinde', 'Sürecinde'],['surecinde', 'sürecinde'],
  ['Surecler', 'Süreçler'], ['surecler', 'süreçler'],
  ['Sureci', 'Süreci'],     ['sureci', 'süreci'],
  ['Surec', 'Süreç'],       ['surec', 'süreç'],
  ['Tasarimini', 'Tasarımını'],['tasarimini', 'tasarımını'],
  ['Tasarimi', 'Tasarımı'], ['tasarimi', 'tasarımı'],
  ['Tasarim', 'Tasarım'],   ['tasarim', 'tasarım'],
  ['Yasam', 'Yaşam'],       ['yasam', 'yaşam'],

  // ── Ğ / ğ ───────────────────────────────────────────────────────────────────
  ['Baglantisini', 'Bağlantısını'],['baglantisini', 'bağlantısını'],
  ['Baglantisi', 'Bağlantısı'],['baglantisi', 'bağlantısı'],
  ['Baglantilari', 'Bağlantıları'],['baglantilari', 'bağlantıları'],
  ['Baglanti', 'Bağlantı'], ['baglanti', 'bağlantı'],
  ['Buyumesi', 'Büyümesi'], ['buyumesi', 'büyümesi'],
  ['Buyumeyi', 'Büyümeyi'], ['buyumeyi', 'büyümeyi'],
  ['Buyumer', 'Büyümer'],
  ['Buyume', 'Büyüme'],     ['buyume', 'büyüme'],
  ['Buyuksek', 'Büyüksek'],
  ['Buyuk', 'Büyük'],       ['buyuk', 'büyük'],
  ['Degil', 'Değil'],       ['degil', 'değil'],
  ['Dogrulamayi', 'Doğrulamayı'],['dogrulamayi', 'doğrulamayı'],
  ['Dogrulanmasi', 'Doğrulanması'],['dogrulanmasi', 'doğrulanması'],
  ['Dogrulanmis', 'Doğrulanmış'],['dogrulanmis', 'doğrulanmış'],
  ['Dogrulanir', 'Doğrulanır'],['dogrulanir', 'doğrulanır'],
  ['Dogrulama', 'Doğrulama'],['dogrulama', 'doğrulama'],
  ['Dogrudan', 'Doğrudan'], ['dogrudan', 'doğrudan'],
  ['Dogru', 'Doğru'],       ['dogru', 'doğru'],
  ['Egitim', 'Eğitim'],     ['egitim', 'eğitim'],
  ['Egilim', 'Eğilim'],     ['egilim', 'eğilim'],
  ['Saglayan', 'Sağlayan'], ['saglayan', 'sağlayan'],
  ['Saglamak', 'Sağlamak'], ['saglamak', 'sağlamak'],
  ['Saglikli', 'Sağlıklı'], ['saglikli', 'sağlıklı'],
  ['Saglamligi', 'Sağlamlığı'],['saglamligi', 'sağlamlığı'],
  ['Saglam', 'Sağlam'],     ['saglam', 'sağlam'],
  ['Taslagi', 'Taslağı'],   ['taslagi', 'taslağı'],
  ['Yogunlugu', 'Yoğunluğu'],['yogunlugu', 'yoğunluğu'],
  ['Yogun', 'Yoğun'],       ['yogun', 'yoğun'],
  ['Yonlendirme', 'Yönlendirme'],['yonlendirme', 'yönlendirme'],
  ['Yonlendiren', 'Yönlendiren'],['yonlendiren', 'yönlendiren'],
  ['Yonlendirilir', 'Yönlendirilir'],['yonlendirilir', 'yönlendirilir'],

  // ── Ü / ü ───────────────────────────────────────────────────────────────────
  ['Guclendirmek', 'Güçlendirmek'],['guclendirmek', 'güçlendirmek'],
  ['Guclendiren', 'Güçlendiren'],['guclendiren', 'güçlendiren'],
  ['Guclendirir', 'Güçlendirir'],['guclendirir', 'güçlendirir'],
  ['Guclu', 'Güçlü'],       ['guclu', 'güçlü'],
  ['Gucu', 'Gücü'],         ['gucu', 'gücü'],
  ['Guc', 'Güç'],           ['guc', 'güç'],
  ['Guncellemeler', 'Güncellemeler'],['guncellemeler', 'güncellemeler'],
  ['Guncellemeleri', 'Güncellemeleri'],['guncellemeleri', 'güncellemeleri'],
  ['Guncelleme', 'Güncelleme'],['guncelleme', 'güncelleme'],
  ['Gunluk', 'Günlük'],     ['gunluk', 'günlük'],
  ['Gundemi', 'Gündemi'],   ['gundemi', 'gündemi'],
  ['Gundem', 'Gündem'],     ['gundem', 'gündem'],
  ['Gunu', 'Günü'],         ['gunu', 'günü'],
  ['Guvenceleri', 'Güvenceleri'],['guvenceleri', 'güvenceleri'],
  ['Guvenilir', 'Güvenilir'],['guvenilir', 'güvenilir'],
  ['Guvenlik', 'Güvenlik'], ['guvenlik', 'güvenlik'],
  ['Guvenli', 'Güvenli'],   ['guvenli', 'güvenli'],
  ['Guven', 'Güven'],       ['guven', 'güven'],
  ['Mudahale', 'Müdahale'], ['mudahale', 'müdahale'],
  ['Odulleri', 'Ödülleri'], ['odulleri', 'ödülleri'],
  ['Odul', 'Ödül'],         ['odul', 'ödül'],
  ['Onemli', 'Önemli'],     ['onemli', 'önemli'],
  ['Onerilen', 'Önerilen'], ['onerilen', 'önerilen'],
  ['Oneri', 'Öneri'],       ['oneri', 'öneri'],
  ['Ozelligi', 'Özelliği'], ['ozelligi', 'özelliği'],
  ['Ozellikle', 'Özellikle'],['ozellikle', 'özellikle'],
  ['Ozellik', 'Özellik'],   ['ozellik', 'özellik'],
  ['Ozel', 'Özel'],         ['ozel', 'özel'],
  ['Ozeti', 'Özeti'],       ['ozeti', 'özeti'],
  ['Ozet', 'Özet'],         ['ozet', 'özet'],
  ['Ornekleri', 'Örnekleri'],['ornekleri', 'örnekleri'],
  ['Ornekler', 'Örnekler'], ['ornekler', 'örnekler'],
  ['Ornek', 'Örnek'],       ['ornek', 'örnek'],
  ['Surdurulebilir', 'Sürdürülebilir'],['surdurulebilir', 'sürdürülebilir'],
  ['Surdurmek', 'Sürdürmek'],['surdurmek', 'sürdürmek'],
  ['Surekliligi', 'Sürekliliği'],['surekliligi', 'sürekliliği'],
  ['Surekli', 'Sürekli'],   ['surekli', 'sürekli'],
  ['Tuketir', 'Tüketir'],   ['tuketir', 'tüketir'],
  ['Tuketmek', 'Tüketmek'], ['tuketmek', 'tüketmek'],
  ['Tumunu', 'Tümünü'],     ['tumunu', 'tümünü'],
  ['Turleri', 'Türleri'],   ['turleri', 'türleri'],
  ['Turler', 'Türler'],     ['turler', 'türler'],
  ['Uretim', 'Üretim'],     ['uretim', 'üretim'],
  ['Urunum', 'Ürünüm'],
  ['Urunu', 'Ürünü'],       ['urunu', 'ürünü'],
  ['Urun', 'Ürün'],         ['urun', 'ürün'],
  ['Ustun', 'Üstün'],       ['ustun', 'üstün'],
  ['Bolumu', 'Bölümü'],     ['bolumu', 'bölümü'],
  ['Bolum', 'Bölüm'],       ['bolum', 'bölüm'],
  ['Donusumun', 'Dönüşümün'],['donusumun', 'dönüşümün'],
  ['Donusum', 'Dönüşüm'],   ['donusum', 'dönüşüm'],
  ['Donusturur', 'Dönüştürür'],['donusturur', 'dönüştürür'],
  ['Donustur', 'Dönüştür'], ['donustur', 'dönüştür'],
  ['Duzgun', 'Düzgün'],     ['duzgun', 'düzgün'],
  ['Duzey', 'Düzey'],       ['duzey', 'düzey'],
  ['Menu', 'Menü'],

  // ── I / ı (dotless i — used in site nav labels & content) ───────────────────
  ['Hakkimizda', 'Hakkımızda'],
  ['Kullanicilar', 'Kullanıcılar'],['kullanicilar', 'kullanıcılar'],
  ['Kullanicilari', 'Kullanıcıları'],['kullanicilari', 'kullanıcıları'],
  ['Kullaniciya', 'Kullanıcıya'],['kullaniciya', 'kullanıcıya'],
  ['Kullanicinin', 'Kullanıcının'],['kullanicinin', 'kullanıcının'],
  ['Kullanicinin', 'Kullanıcının'],
  ['Kullanimi', 'Kullanımı'], ['kullanimi', 'kullanımı'],
  ['Kullanim', 'Kullanım'],  ['kullanim', 'kullanım'],
  ['Siniflandirma', 'Sınıflandırma'],['siniflandirma', 'sınıflandırma'],
  ['Siniflari', 'Sınıfları'],['siniflari', 'sınıfları'],
  ['Sinif', 'Sınıf'],        ['sinif', 'sınıf'],
  ['Sinirlarini', 'Sınırlarını'],['sinirlarini', 'sınırlarını'],
  ['Sinirlari', 'Sınırları'],['sinirlari', 'sınırları'],
  ['Sinirlama', 'Sınırlama'],['sinirlama', 'sınırlama'],
  ['Siniri', 'Sınırı'],      ['siniri', 'sınırı'],
  ['Sinir', 'Sınır'],        ['sinir', 'sınır'],
  ['Tarayicida', 'Tarayıcıda'],['tarayicida', 'tarayıcıda'],
  ['Tarayici', 'Tarayıcı'], ['tarayici', 'tarayıcı'],
  ['Yalnizca', 'Yalnızca'], ['yalnizca', 'yalnızca'],
  ['Yayini', 'Yayını'],     ['yayini', 'yayını'],
  ['Yayin', 'Yayın'],       ['yayin', 'yayın'],
  ['Kisaca', 'Kısaca'],     ['kisaca', 'kısaca'],
  ['Kismi', 'Kısmı'],       ['kismi', 'kısmı'],
  ['Kisa', 'Kısa'],         ['kisa', 'kısa'],
  ['Kararli', 'Kararlı'],   ['kararli', 'kararlı'],
  ['Ayrintilariyla', 'Ayrıntılarıyla'],['ayrintilariyla', 'ayrıntılarıyla'],
  ['Ayrintilarla', 'Ayrıntılarla'],['ayrintilarla', 'ayrıntılarla'],
  ['Ayrinti', 'Ayrıntı'],   ['ayrinti', 'ayrıntı'],
  ['Kanit', 'Kanıt'],       ['kanit', 'kanıt'],
  ['Rotasindan', 'Rotasından'],['rotasindan', 'rotasından'],
  ['Rotasi', 'Rotası'],     ['rotasi', 'rotası'],
  ['Politikasini', 'Politikasını'],['politikasini', 'politikasını'],
  ['Politikasi', 'Politikası'],['politikasi', 'politikası'],
  ['Uygulamanizda', 'Uygulamanızda'],['uygulamanizda', 'uygulamanızda'],
  ['Uygulamasi', 'Uygulaması'],['uygulamasi', 'uygulaması'],
  ['Depolamasi', 'Depolaması'],['depolamasi', 'depolaması'],
  ['Kalmasi', 'Kalması'],   ['kalmasi', 'kalması'],
  ['Baslatmak', 'Başlatmak'],['baslatmak', 'başlatmak'],
  ['Baslayin', 'Başlayın'], ['baslayin', 'başlayın'],
  ['Baslayarak', 'Başlayarak'],['baslayarak', 'başlayarak'],
  ['Baslayan', 'Başlayan'], ['baslayan', 'başlayan'],
  ['Baslamak', 'Başlamak'], ['baslamak', 'başlamak'],
  ['Basladigi', 'Başladığı'],['basladigi', 'başladığı'],
  ['Basladi', 'Başladı'],   ['basladi', 'başladı'],
  ['Baslangici', 'Başlangıcı'],['baslangici', 'başlangıcı'],
  ['Baslangic', 'Başlangıç'],['baslangic', 'başlangıç'],
  ['Basarili', 'Başarılı'], ['basarili', 'başarılı'],
  ['Basarisi', 'Başarısı'], ['basarisi', 'başarısı'],
  ['Basari', 'Başarı'],     ['basari', 'başarı'],
  ['Devamliligi', 'Devamlılığı'],['devamliligi', 'devamlılığı'],
  ['Devamli', 'Devamlı'],   ['devamli', 'devamlı'],
  ['Goruntusu', 'Görüntüsü'],['goruntusu', 'görüntüsü'],
  ['Goruntuleri', 'Görüntüleri'],['goruntuleri', 'görüntüleri'],
  ['Gorunum', 'Görünüm'],   ['gorunum', 'görünüm'],
  ['Gorurseniz', 'Görürseniz'],['gorurseniz', 'görürseniz'],
  ['Gorur', 'Görür'],       ['gorur', 'görür'],
  ['Gorunen', 'Görünen'],   ['gorunen', 'görünen'],
  ['Gostermek', 'Göstermek'],['gostermek', 'göstermek'],
  ['Gosteris', 'Gösteriş'], ['gosteris', 'gösteriş'],
  ['Gosterir', 'Gösterir'], ['gosterir', 'gösterir'],
  ['Yuzeyleri', 'Yüzeyleri'],['yuzeyleri', 'yüzeyleri'],
  ['Yuzey', 'Yüzey'],       ['yuzey', 'yüzey'],

  // ── "önce" — only via safe compound forms ──────────────────────────────────
  ['olmadan once', 'olmadan önce'],
  ['madan once', 'madan önce'],
  ['ndan once', 'ndan önce'],
  ['den once', 'den önce'],
  ['dan once', 'dan önce'],
  ['Once de', 'Önce de'],
  ['once de', 'önce de'],

  // ── Standalone "Gün" — only after compound forms above are done ─────────────
  ['Gunleri', 'Günleri'],   ['gunleri', 'günleri'],
  [' Gun ', ' Gün '],       [' gun ', ' gün '],
];

// ── Apply corrections to a string ─────────────────────────────────────────────
function applyCorrections(text) {
  let out = text;
  for (const [wrong, right] of CORRECTIONS) {
    out = out.split(wrong).join(right);
  }
  return out;
}

// ── Process HTML: correct only data-lang="tr" blocks ─────────────────────────
function fixHtmlFile(filePath) {
  const original = fs.readFileSync(filePath, 'utf8');
  const marker = 'data-lang="tr">';
  const parts = original.split(marker);
  if (parts.length < 2) return false;

  const fixed = parts.map((part, idx) => {
    if (idx === 0) return part;
    // Find next language boundary so we correct only the TR segment
    const nextLang = part.search(/data-lang="(en|ar)"/);
    if (nextLang === -1) return applyCorrections(part);
    return applyCorrections(part.slice(0, nextLang)) + part.slice(nextLang);
  }).join(marker);

  if (fixed === original) return false;
  fs.writeFileSync(filePath, fixed, 'utf8');
  return true;
}

// ── Process site.js: correct only the tr:{} section ─────────────────────────
function fixSiteJs(filePath) {
  const original = fs.readFileSync(filePath, 'utf8');
  // Match the tr: { ... } block precisely
  const fixed = original.replace(
    /(tr:\s*\{)([\s\S]*?)(\n\s*\}[\s\S]*?const COOKIE_KEY)/,
    (match, open, body, after) => open + applyCorrections(body) + after
  );
  if (fixed === original) return false;
  fs.writeFileSync(filePath, fixed, 'utf8');
  return true;
}

// ── Run ───────────────────────────────────────────────────────────────────────
let updated = 0;

const siteJsFiles = [
  'site-assets/js/site.js',
  'backend/public/site-assets/js/site.js',
];
for (const f of siteJsFiles) {
  if (fixSiteJs(f)) { console.log('JS fixed:', f); updated++; }
}

const htmlDirs = ['.', 'backend/public'];
for (const dir of htmlDirs) {
  const files = fs.readdirSync(dir).filter(f =>
    f.endsWith('.html') && !['Game.html', 'visual-test-loader.html', '404.html', 'fix-turkish.js'].includes(f)
  );
  for (const file of files) {
    const fp = path.join(dir, file);
    try {
      if (fixHtmlFile(fp)) { console.log('HTML fixed:', fp); updated++; }
    } catch (e) {
      console.error('Error:', fp, e.message);
    }
  }
}

console.log(`\nDone — ${updated} file(s) updated.`);
