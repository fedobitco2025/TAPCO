// TAPCO UI behavior module - phase 3 (contract-bound)
(function initTapcoMainUIModule() {
  if (typeof window === 'undefined') return;

  function byId(id) {
    return document.getElementById(id);
  }

  function clickById(id) {
    var el = byId(id);
    if (!el) return false;
    el.click();
    return true;
  }

  function getMenuTitle() {
    var settings = byId('settingsBtn');
    var t = (settings && settings.textContent ? settings.textContent.trim() : '');
    if (!t) return 'Menu';
    if (/Ayarlar|Ayar/.test(t)) return 'Menu';
    return 'Menu';
  }

  function registerActions(contract) {
    if (!contract) return;
    contract.registerAction('ui.openStats', function () { return clickById('statsBtn'); });
    contract.registerAction('ui.openAchievements', function () { return clickById('achievementsBtn'); });
    contract.registerAction('ui.openDailyMissions', function () { return clickById('dailyMissionsBtn'); });
    contract.registerAction('ui.openLeaderboard', function () { return clickById('leaderboardBtn'); });
    contract.registerAction('ui.openEvents', function () { return clickById('eventsBtn'); });
    contract.registerAction('ui.openSettings', function () { return clickById('settingsBtn'); });
    contract.registerAction('ui.openTierGuide', function () { return clickById('playerTierDisplay'); });
    contract.registerAction('ui.getMenuTitle', function () { return getMenuTitle(); });
    contract.registerStateGetter(function () {
      return {
        menuTitle: getMenuTitle(),
        sidebarReady: true
      };
    });
  }

  var contract = window.TAPCOContract || null;
  registerActions(contract);

  window.TapcoMainUI = window.TapcoMainUI || { version: 'phase-3', ready: true };
})();