const { ethers } = require('ethers');
const axios = require('axios');
const { TonClient, WalletContractV4, internal, beginCell, toNano, Address, TupleBuilder } = require('@ton/ton');
const { mnemonicToPrivateKey } = require('@ton/crypto');

const {
  TAPCO_CONTRACT_ADDRESS,
  PRIVATE_KEY,
  RPC_URL,
  TOKEN_DECIMALS,
  TAPCO_BLOCKCHAIN_KIND,
  TAPCO_JETTON_MASTER,
  TAPCO_TON_DEPOSIT_WALLET,
  TAPCO_TON_API_BASE,
  TAPCO_TON_API_KEY,
  TAPCO_TON_RPC_URL,
  TAPCO_TON_RPC_API_KEY,
  TAPCO_TON_HOT_WALLET_MNEMONIC,
  TAPCO_TON_HOT_WALLET_WORKCHAIN,
  TAPCO_TON_SEND_VALUE,
  TAPCO_TON_FORWARD_VALUE,
  TAPCO_TON_SEND_TIMEOUT_MS,
  TAPCO_TON_HOT_WALLET_ADDRESS,
} = process.env;

const ERC20_ABI = [
  'function transfer(address to, uint256 value) public returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
];

const JETTON_TRANSFER_OP = 0x0f8a7ea5;

let provider;
let wallet;
let tokenContract;

let tonClient;
let tonKeyPairPromise;
let tonWalletContract;

function isTonMode() {
  return String(TAPCO_BLOCKCHAIN_KIND || '').toLowerCase() === 'ton';
}

function validateTonAddressInput(address) {
  return typeof address === 'string' && address.length >= 40 && address.length <= 80;
}

function normalizeTonAddress(address) {
  if (!validateTonAddressInput(address)) {
    throw new Error('Invalid TON address format');
  }

  const value = address.trim();
  const base64FriendlyRegex = /^[UEk0][A-Za-z0-9_-]{47}$/;
  const rawHexRegex = /^-?\d+:[0-9a-fA-F]{64}$/;

  if (base64FriendlyRegex.test(value) || rawHexRegex.test(value)) {
    return value;
  }

  throw new Error('Invalid TON address format');
}

function parseTonAddress(address) {
  const normalized = normalizeTonAddress(address);
  return Address.parse(normalized);
}

function getTonApiConfig() {
  if (!TAPCO_TON_API_BASE) {
    throw new Error('TAPCO_TON_API_BASE is required for TON mode');
  }

  const headers = {};
  if (TAPCO_TON_API_KEY) {
    headers.Authorization = `Bearer ${TAPCO_TON_API_KEY}`;
  }

  return {
    baseURL: TAPCO_TON_API_BASE.replace(/\/$/, ''),
    timeout: 20000,
    headers,
  };
}

function getTonClient() {
  if (!tonClient) {
    const endpoint = String(TAPCO_TON_RPC_URL || 'https://toncenter.com/api/v2/jsonRPC').trim();
    tonClient = new TonClient({ endpoint, apiKey: TAPCO_TON_RPC_API_KEY || undefined });
  }
  return tonClient;
}

async function getTonKeyPair() {
  if (!tonKeyPairPromise) {
    const mnemonic = String(TAPCO_TON_HOT_WALLET_MNEMONIC || '').trim();
    if (!mnemonic) {
      throw new Error('TAPCO_TON_HOT_WALLET_MNEMONIC is required for TON send');
    }

    const words = mnemonic.split(/\s+/).filter(Boolean);
    if (words.length < 12) {
      throw new Error('Invalid TON mnemonic words count');
    }

    tonKeyPairPromise = mnemonicToPrivateKey(words);
  }

  return tonKeyPairPromise;
}

async function getTonWalletContract() {
  if (!tonWalletContract) {
    const keyPair = await getTonKeyPair();
    const workchain = Number.parseInt(String(TAPCO_TON_HOT_WALLET_WORKCHAIN || '0'), 10);
    tonWalletContract = WalletContractV4.create({
      workchain: Number.isFinite(workchain) ? workchain : 0,
      publicKey: keyPair.publicKey,
    });
  }

  return tonWalletContract;
}

async function getDistributionWalletAddress() {
  if (isTonMode()) {
    const configuredAddress = String(TAPCO_TON_HOT_WALLET_ADDRESS || '').trim();
    if (configuredAddress) {
      return normalizeTonAddress(configuredAddress);
    }

    const walletContract = await getTonWalletContract();
    return walletContract.address.toString();
  }

  ensureEvmClient();
  return wallet.address;
}

async function getJettonWalletAddress(masterAddress, ownerAddress) {
  const client = getTonClient();
  const tuple = new TupleBuilder();
  tuple.writeAddress(ownerAddress);

  const response = await client.runMethod(masterAddress, 'get_wallet_address', tuple.build());
  return response.stack.readAddress();
}

function parseTokenAmountToRaw(amount) {
  const tokenAmount = Number(amount);
  if (!Number.isFinite(tokenAmount) || tokenAmount <= 0) {
    throw new Error('Invalid transfer amount');
  }

  const decimals = Number.parseInt(String(TOKEN_DECIMALS || '9'), 10);
  const safeDecimals = Number.isFinite(decimals) && decimals >= 0 ? decimals : 9;

  const normalized = tokenAmount.toFixed(safeDecimals);
  const [whole, fraction = ''] = normalized.split('.');
  const fractionPadded = (fraction + '0'.repeat(safeDecimals)).slice(0, safeDecimals);
  return BigInt(`${whole}${fractionPadded}`);
}

async function waitForTonSeqnoIncrement(walletProvider, currentSeqno) {
  const timeoutMs = Number.parseInt(String(TAPCO_TON_SEND_TIMEOUT_MS || '45000'), 10);
  const safeTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs >= 5000 ? timeoutMs : 45000;
  const startedAt = Date.now();

  while (Date.now() - startedAt < safeTimeoutMs) {
    const latestSeqno = await walletProvider.getSeqno();
    if (latestSeqno > currentSeqno) {
      return latestSeqno;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  throw new Error('TON transfer confirmation timeout');
}

async function tonSendJetton(toAddress, amount) {
  const client = getTonClient();
  const keyPair = await getTonKeyPair();
  const walletContract = await getTonWalletContract();
  const walletProvider = client.open(walletContract);

  const destination = parseTonAddress(toAddress);
  const master = parseTonAddress(TAPCO_JETTON_MASTER || '');
  const ownerWalletAddress = walletProvider.address;

  const senderJettonWallet = await getJettonWalletAddress(master, ownerWalletAddress);
  if (!senderJettonWallet) {
    throw new Error('Unable to resolve sender jetton wallet address');
  }

  const jettonRawAmount = parseTokenAmountToRaw(amount);
  const queryId = BigInt(Date.now());
  const sendValue = String(TAPCO_TON_SEND_VALUE || '0.08');
  const forwardValue = String(TAPCO_TON_FORWARD_VALUE || '0.02');

  const transferBody = beginCell()
    .storeUint(JETTON_TRANSFER_OP, 32)
    .storeUint(queryId, 64)
    .storeCoins(jettonRawAmount)
    .storeAddress(destination)
    .storeAddress(ownerWalletAddress)
    .storeBit(0)
    .storeCoins(toNano(forwardValue))
    .storeBit(0)
    .endCell();

  const seqno = await walletProvider.getSeqno();

  await walletProvider.sendTransfer({
    seqno,
    secretKey: keyPair.secretKey,
    messages: [
      internal({
        to: senderJettonWallet,
        value: toNano(sendValue),
        bounce: true,
        body: transferBody,
      }),
    ],
  });

  const nextSeqno = await waitForTonSeqnoIncrement(walletProvider, seqno);
  return `ton-seqno-${seqno}-next-${nextSeqno}`;
}

async function tonGetJettonBalance(address) {
  const normalizedAddress = normalizeTonAddress(address);
  const normalizedMaster = normalizeTonAddress(TAPCO_JETTON_MASTER || '');

  const client = axios.create(getTonApiConfig());
  const endpoint = `/v2/accounts/${encodeURIComponent(normalizedAddress)}/jettons/${encodeURIComponent(normalizedMaster)}`;

  const response = await client.get(endpoint);
  const balance = response?.data?.balance;

  if (balance === undefined || balance === null) {
    throw new Error('Unable to read TON jetton balance');
  }

  return BigInt(balance);
}

async function tonFindJettonTransferByReference({
  playerAddress,
  reference,
  expectedReceiver,
  minAmount,
}) {
  const normalizedPlayer = normalizeTonAddress(playerAddress);
  const normalizedReceiver = normalizeTonAddress(expectedReceiver || TAPCO_TON_DEPOSIT_WALLET || '');
  const normalizedMaster = normalizeTonAddress(TAPCO_JETTON_MASTER || '');

  if (!reference || typeof reference !== 'string') {
    throw new Error('TON transfer reference is required');
  }

  const client = axios.create(getTonApiConfig());
  const endpoint = `/v2/accounts/${encodeURIComponent(normalizedReceiver)}/events/${encodeURIComponent(reference)}`;

  const response = await client.get(endpoint);
  const actions = response?.data?.actions || [];

  const jettonAction = actions.find((action) => {
    if (!action || action.type !== 'JettonTransfer') {
      return false;
    }

    const jt = action.JettonTransfer || {};
    const sender = (jt.sender?.address || '').trim();
    const recipient = (jt.recipient?.address || '').trim();
    const jettonMaster = (jt.jetton?.address || '').trim();
    const amountRaw = BigInt(jt.amount || '0');

    return (
      sender === normalizedPlayer &&
      recipient === normalizedReceiver &&
      jettonMaster === normalizedMaster &&
      amountRaw >= BigInt(minAmount || 0)
    );
  });

  if (!jettonAction) {
    return null;
  }

  const amountRaw = BigInt(jettonAction?.JettonTransfer?.amount || '0');
  const txHash = response?.data?.event_id || reference;

  return {
    txHash,
    amountRaw,
    amount: amountRaw,
    from: normalizedPlayer,
    to: normalizedReceiver,
    tokenAddress: normalizedMaster,
    status: 'confirmed',
    blockNumber: undefined,
  };
}

function ensureEvmClient() {
  if (!provider || !wallet || !tokenContract) {
    if (!RPC_URL || !PRIVATE_KEY || !TAPCO_CONTRACT_ADDRESS) {
      throw new Error('Missing required blockchain configuration');
    }

    provider = new ethers.JsonRpcProvider(RPC_URL);
    wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    tokenContract = new ethers.Contract(TAPCO_CONTRACT_ADDRESS, ERC20_ABI, wallet);
  }
}

async function sendTapco(toAddress, amount) {
  if (isTonMode()) {
    parseTonAddress(toAddress);
    return tonSendJetton(toAddress, amount);
  }

  ensureEvmClient();

  const decimals = TOKEN_DECIMALS ? Number(TOKEN_DECIMALS) : 18;
  const parsedAmount = ethers.parseUnits(String(amount), decimals);

  const tx = await tokenContract.transfer(toAddress, parsedAmount);
  await tx.wait();
  return tx.hash;
}

async function getTapcoBalance(address) {
  if (isTonMode()) {
    const balance = await tonGetJettonBalance(address);
    const decimals = TOKEN_DECIMALS ? Number(TOKEN_DECIMALS) : 9;
    return Number(balance) / 10 ** decimals;
  }

  ensureEvmClient();

  const decimals = TOKEN_DECIMALS ? Number(TOKEN_DECIMALS) : Number(await tokenContract.decimals());
  const raw = await tokenContract.balanceOf(address);

  return Number(ethers.formatUnits(raw, decimals));
}

async function getBalance(address) {
  try {
    const normalized = isTonMode() ? normalizeTonAddress(address) : String(address || '').trim().toLowerCase();
    const balance = await getTapcoBalance(normalized);
    return {
      success: true,
      address: normalized,
      balance: String(balance),
      balanceRaw: ''
    };
  } catch (error) {
    return {
      success: false,
      error: error?.message || 'balance_read_failed'
    };
  }
}

async function sendTokens(toAddress, amount) {
  try {
    const txHash = await sendTapco(toAddress, amount);
    const normalized = isTonMode() ? normalizeTonAddress(toAddress) : String(toAddress || '').trim().toLowerCase();
    return {
      success: true,
      txHash,
      toAddress: normalized,
      amount: Number(amount)
    };
  } catch (error) {
    return {
      success: false,
      error: error?.message || 'send_failed'
    };
  }
}

async function getPlayerBalance(playerAddress) {
  return getBalance(playerAddress);
}

async function getTransactionInfo(txRef, options = {}) {
  if (isTonMode()) {
    const {
      playerAddress,
      expectedReceiver,
      minAmount,
    } = options;

    if (!playerAddress) {
      throw new Error('playerAddress is required for TON transfer verification');
    }

    return tonFindJettonTransferByReference({
      playerAddress,
      reference: txRef,
      expectedReceiver,
      minAmount,
    });
  }

  ensureEvmClient();

  const tx = await provider.getTransaction(txRef);
  if (!tx) {
    return null;
  }

  const receipt = await provider.getTransactionReceipt(txRef);

  return {
    txHash: tx.hash,
    from: tx.from,
    to: tx.to,
    amount: tx.value,
    status: receipt && receipt.status === 1 ? 'confirmed' : 'failed',
    blockNumber: tx.blockNumber,
  };
}

module.exports = {
  getBalance,
  sendTokens,
  getPlayerBalance,
  getDistributionWalletAddress,
  sendTapco,
  getTapcoBalance,
  getTransactionInfo,
  isTonMode,
  normalizeTonAddress,
};
