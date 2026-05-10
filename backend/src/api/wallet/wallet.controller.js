const express = require('express');
const router = express.Router();
const walletService = require('./wallet.service');
const { validateWithdrawPayload, validateTransferPayload } = require('./wallet.validation');

// طلب السحب
router.post('/withdraw', async (req, res) => {
	try {
		const validation = validateWithdrawPayload(req.body);
		if (!validation.valid) {
			return res.status(400).json({ success: false, reason: validation.reason });
		}

		const result = await walletService.handleWithdraw(req);
		return res.json(result);
	} catch (err) {
		console.error('Withdraw Error:', err);
		return res.status(500).json({ success: false, reason: 'server_error' });
	}
});

// التحويل بين اللاعبين
router.post('/transfer', async (req, res) => {
	try {
		const validation = validateTransferPayload(req.body);
		if (!validation.valid) {
			return res.status(400).json({ success: false, reason: validation.reason });
		}

		const result = await walletService.handleTransfer(req);
		return res.json(result);
	} catch (err) {
		console.error('Transfer Error:', err);
		return res.status(500).json({ success: false, reason: 'server_error' });
	}
});

// قراءة الرصيد
router.get('/balance/:playerId', async (req, res) => {
	try {
		const result = await walletService.getBalance(req.params.playerId);
		return res.json(result);
	} catch (err) {
		console.error('Balance Error:', err);
		return res.status(500).json({ success: false, reason: 'server_error' });
	}
});

module.exports = router;
