// TAPCO sidebar module - phase 3 (contract-bound)
(function initTapcoSidebarModule() {
  if (typeof window === 'undefined') return;

  function byId(id) {
    return document.getElementById(id);
  }

  var sidebar = null;
  var backdrop = null;
  var menuBtn = null;
  var closeBtn = null;
  var linksRoot = null;

  var routes = [
    { id: 'statsBtn', action: 'ui.openStats' },
    { id: 'achievementsBtn', action: 'ui.openAchievements' },
    { id: 'dailyMissionsBtn', action: 'ui.openDailyMissions' },
    { id: 'leaderboardBtn', action: 'ui.openLeaderboard' },
    { id: 'eventsBtn', action: 'ui.openEvents' },
    { id: 'settingsBtn', action: 'ui.openSettings' },
    { id: 'playerTierDisplay', action: 'ui.openTierGuide' }
  ];

  function normalizeLabel(text) {
    return (text || '').replace(/\s+/g, ' ').trim();
  }

  function tierFallbackLabel() {
    var settingsText = normalizeLabel((byId('settingsBtn') || {}).textContent || '');
    if (/Ayarlar|Ayar/.test(settingsText)) return 'A-B-C Kategori Rehberi';
    return 'A-B-C Tier Guide';
  }

  function renderLinks() {
    var contract = window.TAPCOContract;
    if (!linksRoot || !contract) return;

    linksRoot.innerHTML = '';
    var titleNode = byId('tapcoSidebarTitle');
    if (titleNode) {
      titleNode.textContent = contract.callAction('ui.getMenuTitle') ? (contract.getState().menuTitle || 'Menu') : 'Menu';
    }

    routes.forEach(function (route) {
      var source = byId(route.id);
      var label = source ? normalizeLabel(source.textContent) : '';
      if (!label && route.id === 'playerTierDisplay') label = tierFallbackLabel();
      if (!label) return;

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tapco-sidebar-link';
      btn.textContent = label;
      btn.addEventListener('click', function () {
        contract.callAction(route.action);
        close();
      });
      linksRoot.appendChild(btn);
    });
  }

  function open() {
    if (!sidebar || !backdrop) return;
    renderLinks();
    sidebar.classList.add('open');
    backdrop.classList.add('open');
    sidebar.setAttribute('aria-hidden', 'false');
    document.body.classList.add('tapco-sidebar-open');
  }

  function close() {
    if (!sidebar || !backdrop) return;
    if (sidebar.contains(document.activeElement) && document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }
    sidebar.classList.remove('open');
    backdrop.classList.remove('open');
    sidebar.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('tapco-sidebar-open');
  }

  function attach() {
    sidebar = byId('tapcoSidebar');
    backdrop = byId('tapcoSidebarBackdrop');
    menuBtn = byId('mainMenuBtn');
    closeBtn = byId('tapcoSidebarClose');
    linksRoot = byId('tapcoSidebarLinks');

    if (!sidebar || !backdrop || !menuBtn || !closeBtn || !linksRoot) return;

    menuBtn.addEventListener('click', open);
    closeBtn.addEventListener('click', close);
    backdrop.addEventListener('click', close);

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') close();
    });

    if (sidebar) {
      sidebar.setAttribute('aria-hidden', 'true');
    }
    if (backdrop) {
      backdrop.classList.remove('open');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attach);
  } else {
    attach();
  }

  window.TapcoSidebar = {
    version: 'phase-3',
    ready: true,
    open: open,
    close: close,
    render: renderLinks
  };
})();