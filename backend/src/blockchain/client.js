const { ethers } = require('ethers');
const axios = require('axios');

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
} = process.env;

const ERC20_ABI = [
  'function transfer(address to, uint256 value) public returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
];

let provider;
let wallet;
let tokenContract;

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
    const amount = BigInt(jt.amount || '0');

    return (
      sender === normalizedPlayer &&
      recipient === normalizedReceiver &&
      jettonMaster === normalizedMaster &&
      amount >= BigInt(minAmount || 0)
    );
  });

  if (!jettonAction) {
    return null;
  }

  const amount = BigInt(jettonAction?.JettonTransfer?.amount || '0');
  const txHash = response?.data?.event_id || reference;

  return {
    txHash,
    amount,
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
    if (!PRIVATE_KEY) {
      throw new Error('TON send is disabled until signer secret is configured');
    }

    normalizeTonAddress(toAddress);

    throw new Error('TON send is not fully configured yet');
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
  sendTapco,
  getTapcoBalance,
  getTransactionInfo,
  isTonMode,
  normalizeTonAddress,
};
