(function (global) {
  'use strict';

  var providerInstance = null;
  var callbacks = {
    onAccountsChanged: null,
    onChainChanged: null,
    onDisconnect: null
  };

  function resolveFactory() {
    var candidate = global.WalletConnectEthereumProvider;
    if (!candidate && global.WalletConnectProvider) candidate = global.WalletConnectProvider;
    if (!candidate) return null;
    if (candidate.default) return candidate.default;
    return candidate;
  }

  function isHexChainId(chainId) {
    return typeof chainId === 'string' && /^0x[0-9a-fA-F]+$/.test(chainId);
  }

  function toHexChainId(chainId) {
    if (isHexChainId(chainId)) return chainId.toLowerCase();
    var numeric = Number(chainId || 0);
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    return '0x' + numeric.toString(16);
  }

  function toNumberChainId(chainId) {
    if (isHexChainId(chainId)) return parseInt(chainId, 16);
    var numeric = Number(chainId || 0);
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    return numeric;
  }

  function getAddress(provider) {
    if (!provider) return '';
    var accounts = Array.isArray(provider.accounts) ? provider.accounts : [];
    if (!accounts.length) return '';
    return String(accounts[0] || '').trim();
  }

  function getHexChain(provider) {
    if (!provider) return null;
    var chainId = provider.chainId;
    return toHexChainId(chainId);
  }

  function bindProviderEvents(provider) {
    if (!provider || typeof provider.on !== 'function') return;

    provider.on('accountsChanged', function (accounts) {
      if (typeof callbacks.onAccountsChanged === 'function') {
        callbacks.onAccountsChanged(Array.isArray(accounts) ? accounts : []);
      }
    });

    provider.on('chainChanged', function (chainId) {
      if (typeof callbacks.onChainChanged === 'function') {
        callbacks.onChainChanged(toHexChainId(chainId));
      }
    });

    provider.on('disconnect', function () {
      if (typeof callbacks.onDisconnect === 'function') {
        callbacks.onDisconnect();
      }
    });
  }

  async function initProvider(options) {
    if (providerInstance) return providerInstance;

    var factory = resolveFactory();
    if (!factory || typeof factory.init !== 'function') {
      throw new Error('WalletConnect SDK not loaded.');
    }

    var targetChainHex = toHexChainId(options.targetChainId) || '0x1';
    var targetChainNum = toNumberChainId(targetChainHex) || 1;
    var optionalChains = Array.isArray(options.optionalChains)
      ? options.optionalChains.map(toNumberChainId).filter(Boolean)
      : [];
    if (optionalChains.indexOf(targetChainNum) === -1) {
      optionalChains.unshift(targetChainNum);
    }

    providerInstance = await factory.init({
      projectId: options.projectId,
      chains: [targetChainNum],
      optionalChains: optionalChains,
      showQrModal: true,
      qrModalOptions: {
        themeMode: 'dark'
      },
      metadata: {
        name: options.appName || 'TAPCO',
        description: options.appDescription || 'TAPCO Tap-to-Earn game wallet connection',
        url: options.appUrl || (global.location ? global.location.origin : 'https://tapco.game'),
        icons: Array.isArray(options.appIcons) && options.appIcons.length
          ? options.appIcons
          : ['https://walletconnect.com/walletconnect-logo.png']
      }
    });

    bindProviderEvents(providerInstance);
    return providerInstance;
  }

  async function connect(options) {
    if (!options || !options.projectId) {
      throw new Error('WalletConnect projectId is required.');
    }

    var provider = await initProvider(options);
    await provider.enable();

    var address = getAddress(provider);
    var chainHex = getHexChain(provider);
    return {
      address: address,
      chainId: chainHex,
      provider: provider
    };
  }

  async function restoreSession(options) {
    if (!options || !options.projectId) {
      return null;
    }

    var provider = await initProvider(options);
    var address = getAddress(provider);
    if (!address) return null;

    return {
      address: address,
      chainId: getHexChain(provider),
      provider: provider
    };
  }

  async function disconnect() {
    if (!providerInstance) return;
    if (typeof providerInstance.disconnect === 'function') {
      await providerInstance.disconnect();
    }
    providerInstance = null;
  }

  global.TapcoWalletConnectBridge = {
    isLibraryReady: function () {
      return !!resolveFactory();
    },
    setCallbacks: function (nextCallbacks) {
      callbacks = Object.assign({}, callbacks, nextCallbacks || {});
    },
    connect: connect,
    restoreSession: restoreSession,
    disconnect: disconnect,
    getConnectedAddress: function () {
      return getAddress(providerInstance);
    },
    getChainId: function () {
      return getHexChain(providerInstance);
    }
  };
})(window);
