const { contract } = require('./src/blockchain/client');

async function testBlockchainConnection() {
  try {
    console.log('🔗 Testing Blockchain Connection...\n');

    const name = await contract.name();
    console.log(`✅ Token Name: ${name}`);

    const symbol = await contract.symbol();
    console.log(`✅ Token Symbol: ${symbol}`);

    const decimals = await contract.decimals();
    console.log(`✅ Token Decimals: ${decimals}`);

    const totalSupply = await contract.totalSupply();
    console.log(`✅ Total Supply: ${totalSupply.toString()}`);

    console.log('\n✅ Blockchain Connection Successful!\n');
    process.exit(0);
  } catch (err) {
    console.error('❌ Blockchain Connection Error:', err.message);
    process.exit(1);
  }
}

testBlockchainConnection();
