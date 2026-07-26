(() => {
  'use strict';

  const state = {
    key: sessionStorage.getItem('tapcoAdminKey') || '',
    view: 'overview',
    overview: null,
    lists: { players: [], withdrawals: [], transactions: [], security: [] },
    pages: { players: 1, withdrawals: 1, transactions: 1, security: 1 }
  };

  const $ = (id) => document.getElementById(id);
  const dashboardLocale = 'ar-EG-u-nu-latn';
  const number = new Intl.NumberFormat(dashboardLocale, { maximumFractionDigits: 2 });
  const integer = new Intl.NumberFormat(dashboardLocale, { maximumFractionDigits: 0 });
  const dateTime = new Intl.DateTimeFormat(dashboardLocale, { dateStyle: 'medium', timeStyle: 'short' });
  const titles = {
    overview: ['لوحة القيادة', 'النظرة العامة'], players: ['إدارة المجتمع', 'اللاعبون'],
    withdrawals: ['الاقتصاد والسلسلة', 'طلبات السحب'], transactions: ['حركة الأرصدة', 'المعاملات'],
    security: ['المراقبة والحماية', 'السجل الأمني']
  };
  const statusLabels = {
    none: 'سليم', soft_flag: 'مراقبة', shadow_ban: 'حظر خفي', smart_ban: 'حظر ذكي',
    pending: 'قيد الانتظار', processing: 'قيد المعالجة', refunding: 'قيد الاسترداد',
    completed: 'مكتمل', failed: 'فشل', success: 'ناجح', blocked: 'محظور'
  };
  const typeLabels = { deposit: 'إيداع', withdraw: 'سحب TAPCO', withdraw_game: 'سحب نقاط', transfer: 'تحويل' };
  const withdrawalColors = { completed: '#176b4d', processing: '#d59b2d', pending: '#376994', refunding: '#9b6a3d', failed: '#b4473c' };

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
  }

  function formatDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : dateTime.format(date);
  }

  function badge(value) {
    const safe = escapeHtml(value || 'none');
    return `<span class="badge ${safe}">${escapeHtml(statusLabels[value] || value || 'غير محدد')}</span>`;
  }

  async function api(path) {
    const response = await fetch(path, { headers: { 'X-TAPCO-Admin-Key': state.key, Accept: 'application/json' } });
    if (response.status === 401 || response.status === 503) {
      if (response.status === 401) sessionStorage.removeItem('tapcoAdminKey');
      const error = new Error(response.status === 503 ? 'المراقبة الإدارية غير مفعّلة على الخادم.' : 'مفتاح الإدارة غير صحيح.');
      error.auth = true;
      throw error;
    }
    if (!response.ok) throw new Error(`تعذر تحميل البيانات (${response.status})`);
    return response.json();
  }

  function showLogin(message = '') {
    $('appShell').classList.add('hidden');
    $('loginScreen').classList.remove('hidden');
    $('loginError').textContent = message;
    $('adminKey').value = state.key;
  }

  function showApp() {
    $('loginScreen').classList.add('hidden');
    $('appShell').classList.remove('hidden');
    $('connectionState').textContent = 'متصل ومحمي';
  }

  function showNotice(message) {
    $('notice').textContent = message;
    $('notice').classList.toggle('hidden', !message);
  }

  function debounce(callback, delay = 350) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => callback(...args), delay); };
  }

  function renderKpis(data) {
    const activityToday = data.activity.find((item) => item.day === new Date().toISOString().slice(0, 10));
    const items = [
      ['اللاعبون النشطون اليوم', integer.format(data.players.activeToday), `${integer.format(data.players.newToday)} لاعب جديد`],
      ['النقاط المسجلة اليوم', integer.format(activityToday?.points || 0), `${integer.format(activityToday?.clicks || 0)} نقرة`],
      ['إجمالي أرصدة اللعبة', integer.format(data.economy.gameBalance), 'نقطة داخل اقتصاد اللعبة'],
      ['التزام TAPCO للاعبين', number.format(data.economy.tapcoBalance), `${integer.format(data.players.flagged)} حساب تحت المراقبة`]
    ];
    $('kpiGrid').innerHTML = items.map(([label, value, foot]) => `<article class="kpi"><span class="kpi-accent"></span><span class="kpi-label">${label}</span><strong class="kpi-value">${value}</strong><span class="kpi-foot">${foot}</span></article>`).join('');
  }

  function renderAlerts(data, economy) {
    const alerts = economy?.alerts || [];
    const strip = $('alertStrip');
    if (!alerts.length) {
      strip.className = 'status-strip';
      strip.textContent = `جميع المؤشرات الأساسية مستقرة. تتم مراقبة ${integer.format(data.players.total)} لاعب.`;
      return;
    }
    strip.className = 'status-strip warning';
    strip.textContent = `توجد ${integer.format(alerts.length)} تنبيهات تشغيلية: ${alerts.join(' · ')}`;
  }

  function renderWithdrawals(rows) {
    const normalized = rows.map((row) => ({ status: row._id || 'unknown', count: Number(row.count || 0) }));
    const total = normalized.reduce((sum, row) => sum + row.count, 0);
    let offset = 0;
    const slices = normalized.map((row) => {
      const start = offset;
      offset += total ? row.count / total * 100 : 0;
      return `${withdrawalColors[row.status] || '#89928e'} ${start}% ${offset}%`;
    });
    $('withdrawalDonut').style.background = total ? `conic-gradient(${slices.join(',')})` : 'conic-gradient(#dfe3dc 0 100%)';
    $('withdrawalTotal').textContent = integer.format(total);
    $('withdrawalLegend').innerHTML = normalized.length ? normalized.map((row) => `<div class="legend-row"><i style="background:${withdrawalColors[row.status] || '#89928e'}"></i><span>${escapeHtml(statusLabels[row.status] || row.status)}</span><strong>${integer.format(row.count)}</strong></div>`).join('') : '<div class="empty-state">لا توجد طلبات ضمن الفترة</div>';
  }

  function renderCompactLists(data) {
    $('topPlayers').innerHTML = data.topPlayers.length ? data.topPlayers.map((player, index) => `<button class="compact-row row-action" data-player="${escapeHtml(player.playerId)}"><span class="rank">${index + 1}</span><span><strong>${escapeHtml(player.playerId)}</strong><small>المستوى ${integer.format(player.level)}</small></span><span class="compact-value">${integer.format(player.dailyPoints)}</span></button>`).join('') : '<div class="empty-state">لا توجد بيانات نشاط بعد</div>';
    $('securitySummary').innerHTML = data.securityActions24h.length ? data.securityActions24h.map((item, index) => `<div class="compact-row"><span class="rank">${index + 1}</span><span><strong>${escapeHtml(item._id || 'حدث غير مصنف')}</strong><small>حدث أمني مسجل</small></span><span class="compact-value">${integer.format(item.count)}</span></div>`).join('') : '<div class="empty-state">لا توجد إشارات أمنية خلال 24 ساعة</div>';
  }

  function drawChart(rows) {
    const canvas = $('activityChart');
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, rect.width * ratio);
    canvas.height = Math.max(1, rect.height * ratio);
    const context = canvas.getContext('2d');
    context.scale(ratio, ratio);
    const width = rect.width, height = rect.height;
    const pad = { top: 20, right: 14, bottom: 32, left: 38 };
    const plotWidth = width - pad.right - pad.left, plotHeight = height - pad.top - pad.bottom;
    const maxActive = Math.max(1, ...rows.map((row) => row.activePlayers));
    const maxPoints = Math.max(1, ...rows.map((row) => row.points));
    context.font = '10px Bahnschrift, "Segoe UI", sans-serif';
    context.strokeStyle = '#e5e8e2'; context.fillStyle = '#7c8581'; context.lineWidth = 1;
    for (let line = 0; line <= 4; line += 1) {
      const y = pad.top + plotHeight * line / 4;
      context.beginPath(); context.moveTo(pad.left, y); context.lineTo(width - pad.right, y); context.stroke();
    }
    if (!rows.length) {
      context.fillText('ستظهر اتجاهات النشاط بعد بدء تسجيل البيانات اليومية', width / 2 - 120, height / 2);
      return;
    }
    const xAt = (index) => pad.left + (rows.length === 1 ? plotWidth / 2 : index * plotWidth / (rows.length - 1));
    const line = (key, max, color) => {
      context.beginPath();
      rows.forEach((row, index) => {
        const x = xAt(index), y = pad.top + plotHeight - row[key] / max * plotHeight;
        if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
      });
      context.strokeStyle = color; context.lineWidth = 2.5; context.stroke();
      rows.forEach((row, index) => { const x = xAt(index), y = pad.top + plotHeight - row[key] / max * plotHeight; context.beginPath(); context.arc(x, y, 3, 0, Math.PI * 2); context.fillStyle = color; context.fill(); });
    };
    line('points', maxPoints, '#d59b2d'); line('activePlayers', maxActive, '#176b4d');
    context.fillStyle = '#7c8581'; context.textAlign = 'center';
    const step = Math.max(1, Math.ceil(rows.length / 6));
    rows.forEach((row, index) => { if (index % step === 0 || index === rows.length - 1) context.fillText(row.day.slice(5), xAt(index), height - 9); });
  }

  async function loadOverview() {
    const days = $('rangeSelect').value;
    const [overview, economy] = await Promise.all([api(`/api/admin/overview?days=${days}`), api('/api/admin/economy')]);
    state.overview = overview;
    renderKpis(overview); renderAlerts(overview, economy); renderWithdrawals(overview.withdrawals); renderCompactLists(overview); drawChart(overview.activity);
    if (!overview.historyStartsAt) showNotice('بدأ جمع السجل اليومي الآن؛ ستكتمل الرسوم التاريخية تدريجياً مع مزامنة اللاعبين.'); else showNotice('');
  }

  function renderPagination(id, key, payload) {
    const pages = Math.max(1, Number(payload.pages || Math.ceil(payload.total / payload.limit) || 1));
    $(id).innerHTML = `<span>الصفحة ${integer.format(payload.page)} من ${integer.format(pages)} · ${integer.format(payload.total)} سجل</span><div class="pagination-buttons"><button data-page-key="${key}" data-page="${payload.page - 1}" ${payload.page <= 1 ? 'disabled' : ''}>‹</button><button data-page-key="${key}" data-page="${payload.page + 1}" ${payload.page >= pages ? 'disabled' : ''}>›</button></div>`;
  }

  async function loadPlayers() {
    const params = new URLSearchParams({ page: state.pages.players, limit: 25, search: $('playerSearch').value, status: $('playerStatus').value });
    const data = await api(`/api/admin/players?${params}`); state.lists.players = data.players;
    $('playersBody').innerHTML = data.players.length ? data.players.map((player) => `<tr><td><span class="cell-main">${escapeHtml(player.playerId)}</span><span class="cell-sub">${escapeHtml(player.telegramUserId || player.address || '—')}</span></td><td>${integer.format(player.level)}</td><td>${integer.format(player.dailyPoints)}</td><td>${integer.format(player.gameBalance)}</td><td>${number.format(player.tapcoBalance)}</td><td>${badge(player.botStatus)}</td><td>${formatDate(player.updatedAt)}</td><td><button class="row-action" data-player="${escapeHtml(player.playerId)}">تفاصيل</button></td></tr>`).join('') : '<tr><td colspan="8"><div class="empty-state">لا توجد نتائج مطابقة</div></td></tr>';
    renderPagination('playersPagination', 'players', data);
  }

  async function loadWithdrawals() {
    const params = new URLSearchParams({ page: state.pages.withdrawals, limit: 25, status: $('withdrawalStatus').value });
    const data = await api(`/api/admin/withdrawals?${params}`); state.lists.withdrawals = data.items;
    $('withdrawalsBody').innerHTML = data.items.length ? data.items.map((item) => `<tr><td>${escapeHtml(item.playerId)}</td><td>${number.format(item.amount)}</td><td><span class="cell-sub">${escapeHtml(item.walletAddress || '—')}</span></td><td>${badge(item.status)}</td><td>${integer.format(item.broadcastAttempts)}</td><td><span class="cell-sub" title="${escapeHtml(item.txHash)}">${escapeHtml(item.txHashShort || '—')}</span></td><td>${formatDate(item.createdAt)}</td></tr>`).join('') : '<tr><td colspan="7"><div class="empty-state">لا توجد طلبات سحب</div></td></tr>';
    renderPagination('withdrawalsPagination', 'withdrawals', data);
  }

  async function loadTransactions() {
    const params = new URLSearchParams({ page: state.pages.transactions, limit: 25, type: $('transactionType').value, status: $('transactionStatus').value });
    const data = await api(`/api/admin/wallet-transactions?${params}`); state.lists.transactions = data.items;
    $('transactionsBody').innerHTML = data.items.length ? data.items.map((item) => `<tr><td>${escapeHtml(typeLabels[item.type] || item.type)}</td><td>${escapeHtml(item.playerId || '—')}</td><td>${escapeHtml(item.toPlayer || item.walletAddress || '—')}</td><td>${number.format(item.amount)}</td><td>${badge(item.status)}</td><td>${escapeHtml(item.reason || '—')}</td><td>${formatDate(item.createdAt)}</td></tr>`).join('') : '<tr><td colspan="7"><div class="empty-state">لا توجد معاملات</div></td></tr>';
    renderPagination('transactionsPagination', 'transactions', data);
  }

  async function loadSecurity() {
    const params = new URLSearchParams({ page: state.pages.security, limit: 25, playerId: $('securityPlayer').value, action: $('securityAction').value });
    const data = await api(`/api/admin/security-events?${params}`); state.lists.security = data.items;
    $('securityBody').innerHTML = data.items.length ? data.items.map((item) => `<tr><td>${escapeHtml(item.action)}</td><td>${escapeHtml(item.playerId || '—')}</td><td>${escapeHtml(item.reason || '—')}</td><td>${escapeHtml(item.path || '—')}</td><td>${integer.format(item.evidenceScore || 0)}</td><td>${escapeHtml(item.banStatus || item.statusCode || '—')}</td><td>${formatDate(item.timestamp)}</td></tr>`).join('') : '<tr><td colspan="7"><div class="empty-state">لا توجد أحداث أمنية مطابقة</div></td></tr>';
    renderPagination('securityPagination', 'security', data);
  }

  async function loadCurrentView() {
    $('refreshButton').disabled = true;
    try {
      if (state.view === 'overview') await loadOverview();
      if (state.view === 'players') await loadPlayers();
      if (state.view === 'withdrawals') await loadWithdrawals();
      if (state.view === 'transactions') await loadTransactions();
      if (state.view === 'security') await loadSecurity();
      $('updatedAt').textContent = `آخر تحديث: ${dateTime.format(new Date())}`;
    } catch (error) {
      if (error.auth) { state.key = ''; showLogin(error.message); return; }
      showNotice(error.message);
    } finally { $('refreshButton').disabled = false; }
  }

  function switchView(view) {
    state.view = view;
    document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.view === view));
    document.querySelectorAll('.view').forEach((item) => item.classList.toggle('active', item.id === `${view}View`));
    $('viewEyebrow').textContent = titles[view][0]; $('viewTitle').textContent = titles[view][1];
    $('rangeSelect').classList.toggle('hidden', view !== 'overview'); $('sidebar').classList.remove('open');
    showNotice(''); loadCurrentView();
  }

  async function openPlayer(playerId) {
    $('drawerBackdrop').classList.remove('hidden'); $('playerDrawer').classList.add('open'); $('playerDrawer').setAttribute('aria-hidden', 'false');
    $('drawerTitle').textContent = playerId; $('drawerContent').innerHTML = '<div class="empty-state">جارٍ تحميل ملف اللاعب...</div>';
    try {
      const data = await api(`/api/admin/players/${encodeURIComponent(playerId)}`); const player = data.player;
      $('drawerContent').innerHTML = `<div class="detail-grid"><div class="detail-stat"><small>المستوى</small><strong>${integer.format(player.level)}</strong></div><div class="detail-stat"><small>الحالة</small><strong>${statusLabels[player.botStatus] || player.botStatus}</strong></div><div class="detail-stat"><small>نقاط اليوم</small><strong>${integer.format(player.dailyPoints)}</strong></div><div class="detail-stat"><small>الرصيد</small><strong>${integer.format(player.gameBalance)}</strong></div><div class="detail-stat"><small>TAPCO</small><strong>${number.format(player.tapcoBalance)}</strong></div><div class="detail-stat"><small>الإحالات</small><strong>${integer.format(player.referrals)}</strong></div></div><section class="drawer-section"><h3>آخر النشاطات اليومية</h3><div class="timeline">${data.activity.length ? data.activity.slice(0, 10).map((item) => `<div class="timeline-row"><i></i><span>${escapeHtml(item.day)} · ${integer.format(item.points)} نقطة · ${integer.format(item.clicks)} نقرة</span><time>${integer.format(item.sessionTime)} ث</time></div>`).join('') : '<div class="empty-state">لا يوجد سجل يومي بعد</div>'}</div></section><section class="drawer-section"><h3>آخر السحوبات</h3><div class="timeline">${data.withdrawals.length ? data.withdrawals.slice(0, 8).map((item) => `<div class="timeline-row"><i></i><span>${number.format(item.amount)} TAPCO · ${statusLabels[item.status] || item.status}</span><time>${formatDate(item.createdAt)}</time></div>`).join('') : '<div class="empty-state">لا توجد سحوبات</div>'}</div></section><section class="drawer-section"><h3>آخر الأحداث الأمنية</h3><div class="timeline">${data.securityEvents.length ? data.securityEvents.slice(0, 8).map((item) => `<div class="timeline-row"><i></i><span>${escapeHtml(item.action)} · ${escapeHtml(item.reason || 'دون سبب إضافي')}</span><time>${formatDate(item.timestamp)}</time></div>`).join('') : '<div class="empty-state">لا توجد أحداث أمنية</div>'}</div></section>`;
    } catch (error) { $('drawerContent').innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`; }
  }

  function closePlayer() { $('drawerBackdrop').classList.add('hidden'); $('playerDrawer').classList.remove('open'); $('playerDrawer').setAttribute('aria-hidden', 'true'); }

  function exportCsv(name, rows) {
    if (!rows.length) { showNotice('لا توجد بيانات في الصفحة الحالية لتصديرها.'); return; }
    const keys = Object.keys(rows[0]).filter((key) => !['id', 'txHash'].includes(key));
    const quote = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const csv = `\uFEFF${keys.map(quote).join(',')}\r\n${rows.map((row) => keys.map((key) => quote(Array.isArray(row[key]) ? row[key].join('|') : row[key])).join(',')).join('\r\n')}`;
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); link.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(link.href);
  }

  $('loginForm').addEventListener('submit', async (event) => {
    event.preventDefault(); state.key = $('adminKey').value.trim(); $('loginError').textContent = 'جارٍ التحقق...';
    try { await api('/api/admin/overview?days=7'); sessionStorage.setItem('tapcoAdminKey', state.key); showApp(); await loadCurrentView(); } catch (error) { $('loginError').textContent = error.message; }
  });
  $('toggleKey').addEventListener('click', () => { $('adminKey').type = $('adminKey').type === 'password' ? 'text' : 'password'; });
  $('logoutButton').addEventListener('click', () => { sessionStorage.removeItem('tapcoAdminKey'); state.key = ''; showLogin(); });
  $('menuButton').addEventListener('click', () => $('sidebar').classList.toggle('open'));
  $('refreshButton').addEventListener('click', loadCurrentView);
  $('rangeSelect').addEventListener('change', loadOverview);
  $('closeDrawer').addEventListener('click', closePlayer); $('drawerBackdrop').addEventListener('click', closePlayer);
  document.querySelectorAll('.nav-item').forEach((item) => item.addEventListener('click', () => switchView(item.dataset.view)));
  document.querySelectorAll('[data-go]').forEach((item) => item.addEventListener('click', () => switchView(item.dataset.go)));
  document.addEventListener('click', (event) => { const player = event.target.closest('[data-player]'); if (player) openPlayer(player.dataset.player); const page = event.target.closest('[data-page-key]'); if (page && !page.disabled) { state.pages[page.dataset.pageKey] = Number(page.dataset.page); loadCurrentView(); } });
  $('playerSearch').addEventListener('input', debounce(() => { state.pages.players = 1; loadPlayers(); }));
  $('playerStatus').addEventListener('change', () => { state.pages.players = 1; loadPlayers(); });
  $('withdrawalStatus').addEventListener('change', () => { state.pages.withdrawals = 1; loadWithdrawals(); });
  $('transactionType').addEventListener('change', () => { state.pages.transactions = 1; loadTransactions(); });
  $('transactionStatus').addEventListener('change', () => { state.pages.transactions = 1; loadTransactions(); });
  $('securityPlayer').addEventListener('input', debounce(() => { state.pages.security = 1; loadSecurity(); }));
  $('securityAction').addEventListener('input', debounce(() => { state.pages.security = 1; loadSecurity(); }));
  $('exportPlayers').addEventListener('click', () => exportCsv('tapco-players', state.lists.players));
  $('exportWithdrawals').addEventListener('click', () => exportCsv('tapco-withdrawals', state.lists.withdrawals));
  $('exportTransactions').addEventListener('click', () => exportCsv('tapco-transactions', state.lists.transactions));
  $('exportSecurity').addEventListener('click', () => exportCsv('tapco-security', state.lists.security));
  window.addEventListener('resize', debounce(() => { if (state.overview && state.view === 'overview') drawChart(state.overview.activity); }, 120));

  if (state.key) { showApp(); loadCurrentView(); } else showLogin();
})();