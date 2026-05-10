const { ethers } = require('ethers');
require('dotenv').config();

const rpcUrl = process.env.RPC_URL || '';
const privateKey = process.env.PRIVATE_KEY || '';
const contractAddress = process.env.CONTRACT_ADDRESS || '';

if (!rpcUrl) {
  throw new Error('RPC_URL is required');
}

if (!privateKey) {
  throw new Error('PRIVATE_KEY is required');
}

if (!contractAddress) {
  throw new Error('CONTRACT_ADDRESS is required');
}

const provider = new ethers.JsonRpcProvider(rpcUrl);
const wallet = new ethers.Wallet(privateKey, provider);
const DEPOSIT_RECEIVER_ADDRESS = (
  process.env.DEPOSIT_RECEIVER_ADDRESS ||
  process.env.GAME_WALLET_ADDRESS ||
  wallet.address
).toLowerCase();
const TRANSFER_TOPIC = ethers.id('Transfer(address,address,uint256)');

const contractAbi = require('./abi.json');
const contract = new ethers.Contract(contractAddress, contractAbi, wallet);

async function getBalance(address) {
  try {
    if (!ethers.isAddress(address)) {
      throw new Error('Invalid Ethereum address');
    }

    const balance = await contract.balanceOf(address);
    const formattedBalance = ethers.formatUnits(balance, 18);
    
    return {
      success: true,
      address: address.toLowerCase(),
      balance: formattedBalance,
      balanceRaw: balance.toString()
    };
  } catch (err) {
    console.error('Error reading balance:', err.message);
    return {
      success: false,
      error: err.message
    };
  }
}

async function sendTokens(toAddress, amount) {
  try {
    if (!ethers.isAddress(toAddress)) {
      throw new Error('Invalid recipient address');
    }

    const amountNum = Number(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      throw new Error('Invalid amount');
    }

    const amountInWei = ethers.parseUnits(amountNum.toString(), 18);

    console.log(`📤 Sending ${amountNum} TAPCO to ${toAddress}`);
    const tx = await contract.transfer(toAddress, amountInWei);
    console.log('✅ Withdraw TX sent:', tx.hash);

    const receipt = await tx.wait();
    const txHash = receipt.hash || tx.hash;
    console.log('✅ Withdraw TX confirmed:', txHash);

    return {
      success: true,
      txHash,
      toAddress: toAddress.toLowerCase(),
      amount: amountNum,
      blockNumber: receipt.blockNumber
    };
  } catch (err) {
    console.error('❌ Error sending tokens:', err.message);
    return {
      success: false,
      error: err.message || 'Failed to send tokens'
    };
  }
}

async function getPlayerBalance(playerAddress) {
  try {
    if (!ethers.isAddress(playerAddress)) {
      throw new Error('Invalid player address');
    }

    const balance = await contract.balanceOf(playerAddress);
    
    return {
      success: true,
      balance: ethers.formatUnits(balance, 18),
      balanceRaw: balance.toString()
    };
  } catch (err) {
    console.error('Error reading player balance:', err.message);
    return {
      success: false,
      error: err.message
    };
  }
}

async function getTransactionInfo(txHash) {
  try {
    const normalizedTxHash = String(txHash || '').trim().toLowerCase();
    if (!ethers.isHexString(normalizedTxHash, 32)) {
      throw new Error('Invalid tx hash');
    }

    const receipt = await provider.getTransactionReceipt(normalizedTxHash);
    if (!receipt) {
      return {
        success: false,
        error: 'transaction_not_found'
      };
    }

    if (receipt.status !== 1) {
      return {
        success: false,
        error: 'transaction_failed'
      };
    }

    let transferLog = null;
    for (const log of receipt.logs || []) {
      if (String(log.address || '').toLowerCase() !== contractAddress.toLowerCase()) {
        continue;
      }

      if (!Array.isArray(log.topics) || log.topics[0] !== TRANSFER_TOPIC) {
        continue;
      }

      try {
        const parsed = contract.interface.parseLog(log);
        if (parsed && parsed.name === 'Transfer') {
          transferLog = parsed;
          break;
        }
      } catch (_) {
        // Ignore unrelated logs from the same tx.
      }
    }

    if (!transferLog) {
      return {
        success: false,
        error: 'tapco_transfer_not_found'
      };
    }

    const from = String(transferLog.args.from || '').toLowerCase();
    const to = String(transferLog.args.to || '').toLowerCase();
    const value = transferLog.args.value;

    if (!value || value <= 0n) {
      return {
        success: false,
        error: 'invalid_tapco_amount'
      };
    }

    if (to !== DEPOSIT_RECEIVER_ADDRESS) {
      return {
        success: false,
        error: 'invalid_receiver'
      };
    }

    return {
      success: true,
      txHash: normalizedTxHash,
      from,
      to,
      amount: ethers.formatUnits(value, 18),
      amountRaw: value.toString(),
      blockNumber: receipt.blockNumber
    };
  } catch (err) {
    console.error('Error reading tx info:', err.message);
    return {
      success: false,
      error: err.message || 'failed_to_read_transaction'
    };
  }
}

module.exports = {
  provider,
  wallet,
  contract,
  contractAddress: contractAddress.toLowerCase(),
  depositReceiverAddress: DEPOSIT_RECEIVER_ADDRESS,
  getBalance,
  sendTokens,
  getPlayerBalance,
  getTransactionInfo
};
