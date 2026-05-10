/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 2FA/OTP INTEGRATION GUIDE FOR GAME.HTML
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This file documents how to integrate OTP verification into Game.html
 * for 2FA (Two-Factor Authentication) on large withdrawals (>10,000 TAPCO).
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * STEP 1: ADD OTP MODAL HTML
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Add this HTML block to Game.html (after other modals):
 * 
 * ```html
 * <!-- 🔒 OTP Verification Modal -->
 * <div id="otpVerificationModal" class="modal" style="display: none; z-index: 10000;">
 *   <div class="modal-content" style="max-width: 400px;">
 *     <div class="modal-header">
 *       <h3 id="otpTitle">تحقق من حسابك</h3>
 *       <button class="close-btn" onclick="closeOtpModal()">&times;</button>
 *     </div>
 *     
 *     <div class="modal-body">
 *       <p id="otpMessage" style="margin-bottom: 20px; color: #666;">
 *         تم إرسال رمز التحقق إلى بريدك الإلكتروني. أدخل الرمز أدناه.
 *       </p>
 *       
 *       <!-- OTP Code Input -->
 *       <div class="form-group">
 *         <label for="otpCode">رمز التحقق (6 أرقام)</label>
 *         <input 
 *           type="text" 
 *           id="otpCode" 
 *           class="form-control" 
 *           placeholder="000000"
 *           maxlength="6"
 *           inputmode="numeric"
 *           pattern="[0-9]{6}"
 *           autofocus
 *         />
 *         <small id="otpError" style="color: red; display: none;"></small>
 *       </div>
 *       
 *       <!-- Timer and Attempt Counter -->
 *       <div style="display: flex; justify-content: space-between; margin-top: 15px; font-size: 12px; color: #999;">
 *         <span id="otpTimer">الوقت المتبقي: <span id="otpCountdown">5:00</span></span>
 *         <span id="otpAttempts">المحاولات: <span id="otpAttemptCounter">3</span>/3</span>
 *       </div>
 *       
 *       <!-- Resend OTP -->
 *       <div style="margin-top: 15px; text-align: center;">
 *         <button 
 *           id="resendOtpBtn" 
 *           class="btn btn-link" 
 *           onclick="resendOtp()"
 *           disabled
 *           style="color: #0066cc; cursor: pointer;"
 *         >
 *           إعادة إرسال الرمز
 *         </button>
 *       </div>
 *     </div>
 *     
 *     <div class="modal-footer" style="display: flex; gap: 10px;">
 *       <button class="btn btn-secondary" onclick="closeOtpModal()">إلغاء</button>
 *       <button class="btn btn-primary" onclick="verifyOtp()" id="verifyOtpBtn">تحقق</button>
 *     </div>
 *   </div>
 * </div>
 * ```
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * STEP 2: ADD JAVASCRIPT FUNCTIONS TO GAME.HTML
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Add these functions to your main JavaScript section:
 * 
 * ```javascript
 * 
 * // ════════════════════════════════════════════════════════════════════════
 * // 2FA/OTP MANAGEMENT
 * // ════════════════════════════════════════════════════════════════════════
 * 
 * let otpState = {
 *   active: false,
 *   code: null,
 *   attempts: 3,
 *   expiresAt: null,
 *   withdrawalPayload: null, // Store withdrawal request while waiting for OTP
 *   countdownInterval: null
 * };
 * 
 * /**
 *  * Show OTP verification modal (called by backend)
 *  * @param {Object} options - { otpRequired: true, expiresIn: 300000 }
 *  */
 * function showOtpModal(options = {}) {
 *   console.log('[2FA] OTP required. Showing modal...');
 *   
 *   const modal = document.getElementById('otpVerificationModal');
 *   const otpCodeInput = document.getElementById('otpCode');
 *   
 *   otpState.active = true;
 *   otpState.attempts = 3;
 *   otpState.expiresAt = Date.now() + (options.expiresIn || 300000); // 5 min default
 *   
 *   // Reset UI
 *   otpCodeInput.value = '';
 *   document.getElementById('otpError').style.display = 'none';
 *   document.getElementById('otpAttemptCounter').textContent = '3';
 *   document.getElementById('resendOtpBtn').disabled = true;
 *   
 *   // Start countdown timer
 *   startOtpCountdown();
 *   
 *   // Show modal
 *   modal.style.display = 'flex';
 *   otpCodeInput.focus();
 * }
 * 
 * /**
 *  * Start countdown timer for OTP expiry
 *  */
 * function startOtpCountdown() {
 *   if (otpState.countdownInterval) clearInterval(otpState.countdownInterval);
 *   
 *   const updateTimer = () => {
 *     const now = Date.now();
 *     const remaining = Math.max(0, otpState.expiresAt - now);
 *     
 *     if (remaining <= 0) {
 *       clearInterval(otpState.countdownInterval);
 *       document.getElementById('otpTimer').style.display = 'none';
 *       document.getElementById('otpError').style.display = 'block';
 *       document.getElementById('otpError').textContent = 'انتهت صلاحية الرمز. اطلب واحد جديد.';
 *       document.getElementById('resendOtpBtn').disabled = false;
 *       return;
 *     }
 *     
 *     const minutes = Math.floor(remaining / 60000);
 *     const seconds = Math.floor((remaining % 60000) / 1000);
 *     document.getElementById('otpCountdown').textContent = 
 *       `${minutes}:${String(seconds).padStart(2, '0')}`;
 *   };
 *   
 *   updateTimer(); // Initial call
 *   otpState.countdownInterval = setInterval(updateTimer, 1000);
 * }
 * 
 * /**
 *  * Verify OTP code
 *  */
 * async function verifyOtp() {
 *   const otpCode = document.getElementById('otpCode').value.trim();
 *   const errorDiv = document.getElementById('otpError');
 *   const verifyBtn = document.getElementById('verifyOtpBtn');
 *   
 *   if (!otpCode || otpCode.length !== 6 || !/^\d+$/.test(otpCode)) {
 *     errorDiv.style.display = 'block';
 *     errorDiv.textContent = 'أدخل رمز صحيح من 6 أرقام';
 *     return;
 *   }
 *   
 *   // Check expiry
 *   if (Date.now() > otpState.expiresAt) {
 *     errorDiv.style.display = 'block';
 *     errorDiv.textContent = 'انتهت صلاحية الرمز';
 *     return;
 *   }
 *   
 *   verifyBtn.disabled = true;
 *   verifyBtn.textContent = 'جاري التحقق...';
 *   
 *   try {
 *     // Call backend to verify OTP
 *     const response = await fetch(getTapcoApiBase() + '/api/withdraw-tapco', {
 *       method: 'POST',
 *       headers: { 'Content-Type': 'application/json' },
 *       body: JSON.stringify({
 *         ...otpState.withdrawalPayload,
 *         otp: otpCode
 *       })
 *     });
 *     
 *     const result = await response.json();
 *     
 *     if (!response.ok) {
 *       otpState.attempts--;
 *       document.getElementById('otpAttemptCounter').textContent = otpState.attempts;
 *       
 *       if (otpState.attempts === 0) {
 *         errorDiv.style.display = 'block';
 *         errorDiv.textContent = 'انتهت محاولات التحقق. جرب لاحقاً.';
 *         verifyBtn.disabled = true;
 *       } else {
 *         errorDiv.style.display = 'block';
 *         errorDiv.textContent = `الرمز غير صحيح. ${otpState.attempts} محاولات متبقية.`;
 *       }
 *       return;
 *     }
 *     
 *     // Success!
 *     console.log('[2FA] OTP verified successfully');
 *     errorDiv.style.display = 'none';
 *     closeOtpModal();
 *     
 *     // Show success message
 *     showNotification('تم التحقق بنجاح. جاري معالجة السحب...', 'success');
 *     
 *     // Continue with withdrawal
 *     handleWithdrawalSuccess(result);
 *     
 *   } catch (err) {
 *     console.error('[2FA] OTP verification error:', err);
 *     errorDiv.style.display = 'block';
 *     errorDiv.textContent = 'خطأ في الاتصال. حاول مجدداً.';
 *   } finally {
 *     verifyBtn.disabled = false;
 *     verifyBtn.textContent = 'تحقق';
 *   }
 * }
 * 
 * /**
 *  * Resend OTP
 *  */
 * async function resendOtp() {
 *   console.log('[2FA] Requesting new OTP...');
 *   
 *   try {
 *     const response = await fetch(getTapcoApiBase() + '/api/generate-otp', {
 *       method: 'POST',
 *       headers: { 'Content-Type': 'application/json' },
 *       body: JSON.stringify({
 *         playerId: localStorage.getItem('playerId')
 *       })
 *     });
 *     
 *     if (response.ok) {
 *       // Reset timer
 *       otpState.expiresAt = Date.now() + 300000; // 5 min
 *       otpState.attempts = 3;
 *       document.getElementById('otpCode').value = '';
 *       document.getElementById('otpError').style.display = 'none';
 *       document.getElementById('otpAttemptCounter').textContent = '3';
 *       document.getElementById('resendOtpBtn').disabled = true;
 *       
 *       startOtpCountdown();
 *       
 *       showNotification('تم إرسال رمز جديد إلى بريدك', 'info');
 *     }
 *   } catch (err) {
 *     console.error('[2FA] Resend error:', err);
 *     showNotification('خطأ في إعادة الإرسال', 'error');
 *   }
 * }
 * 
 * /**
 *  * Close OTP modal
 *  */
 * function closeOtpModal() {
 *   const modal = document.getElementById('otpVerificationModal');
 *   modal.style.display = 'none';
 *   
 *   if (otpState.countdownInterval) {
 *     clearInterval(otpState.countdownInterval);
 *   }
 *   
 *   otpState.active = false;
 * }
 * 
 * /**
 *  * Handle withdrawal with OTP requirement
 *  */
 * function handleWithdrawalWithOtp(withdrawalPayload) {
 *   otpState.withdrawalPayload = withdrawalPayload;
 *   showOtpModal();
 * }
 * 
 * /**
 *  * Handle withdrawal success
 *  */
 * function handleWithdrawalSuccess(result) {
 *   console.log('[Withdrawal] Success:', result);
 *   
 *   // Update UI
 *   const balanceEl = document.getElementById('playerTapcoBalance');
 *   if (balanceEl) {
 *     const currentBalance = parseInt(balanceEl.textContent) || 0;
 *     const newBalance = currentBalance - (otpState.withdrawalPayload?.tapcoAmount || 0);
 *     balanceEl.textContent = newBalance;
 *   }
 *   
 *   // Show withdrawal request
 *   showNotification(`تم تسجيل طلب السحب: ${result.requestId}`, 'success');
 * }
 * 
 * // Allow Enter key to verify OTP
 * document.addEventListener('DOMContentLoaded', () => {
 *   const otpCodeInput = document.getElementById('otpCode');
 *   if (otpCodeInput) {
 *     otpCodeInput.addEventListener('keypress', (e) => {
 *       if (e.key === 'Enter') verifyOtp();
 *     });
 *   }
 * });
 * ```
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * STEP 3: UPDATE WITHDRAWAL FLOW IN GAME.HTML
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * When user initiates a withdrawal (typically in a withdraw button handler):
 * 
 * ```javascript
 * async function registerWithdrawalRequest() {
 *   const tapcoAmount = getTapcoWithdrawalAmount(); // Your function
 *   
 *   if (!tapcoAmount || tapcoAmount < 25) {
 *     showNotification('الحد الأدنى للسحب هو 25 TAPCO', 'error');
 *     return;
 *   }
 *   
 *   // Check if 2FA required (>10,000)
 *   if (tapcoAmount > 10000) {
 *     console.log('[Withdrawal] Large amount, 2FA required');
 *     
 *     const payload = {
 *       playerId: localStorage.getItem('playerId'),
 *       tapcoAmount: tapcoAmount,
 *       walletAddress: getWalletAddress(),
 *       timestamp: Date.now(),
 *       chainId: '0x61' // BNB Testnet
 *     };
 *     
 *     // Add signature
 *     payload.clientSignature = computeWithdrawalSignature(payload);
 *     
 *     // Store payload and show OTP modal
 *     handleWithdrawalWithOtp(payload);
 *     
 *     return;
 *   }
 *   
 *   // Normal withdrawal (≤10,000)
 *   try {
 *     const response = await submitWithdrawalRequest();
 *     if (response.ok) {
 *       handleWithdrawalSuccess(await response.json());
 *     }
 *   } catch (err) {
 *     console.error('Withdrawal error:', err);
 *     showNotification('خطأ في السحب', 'error');
 *   }
 * }
 * ```
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * STEP 4: ADD CSS STYLING (Optional)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Add this to your CSS file (main-ui.css):
 * 
 * ```css
 * /* OTP Modal Styling */
 * #otpVerificationModal {
 *   display: none;
 *   position: fixed;
 *   top: 0;
 *   left: 0;
 *   width: 100%;
 *   height: 100%;
 *   background-color: rgba(0, 0, 0, 0.5);
 *   z-index: 10000;
 *   align-items: center;
 *   justify-content: center;
 * }
 * 
 * #otpVerificationModal .modal-content {
 *   background: white;
 *   border-radius: 8px;
 *   box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
 *   overflow: hidden;
 *   animation: slideInUp 0.3s ease-out;
 * }
 * 
 * #otpVerificationModal .modal-header {
 *   padding: 20px;
 *   border-bottom: 1px solid #e0e0e0;
 *   display: flex;
 *   justify-content: space-between;
 *   align-items: center;
 * }
 * 
 * #otpVerificationModal .modal-body {
 *   padding: 20px;
 * }
 * 
 * #otpVerificationModal .modal-footer {
 *   padding: 15px 20px;
 *   border-top: 1px solid #e0e0e0;
 *   justify-content: flex-end;
 * }
 * 
 * #otpCode {
 *   font-size: 24px;
 *   letter-spacing: 8px;
 *   text-align: center;
 *   font-weight: bold;
 *   padding: 12px;
 *   border: 2px solid #ddd;
 *   border-radius: 4px;
 *   width: 100%;
 * }
 * 
 * #otpCode:focus {
 *   outline: none;
 *   border-color: #0066cc;
 *   box-shadow: 0 0 0 3px rgba(0, 102, 204, 0.1);
 * }
 * ```
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * TESTING THE INTEGRATION
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * 1. Test small withdrawal (≤10,000):
 *    - Should NOT show OTP modal
 *    - Should process immediately
 * 
 * 2. Test large withdrawal (>10,000):
 *    - SHOULD show OTP modal
 *    - Enter 6-digit code
 *    - Should succeed or show error based on code
 * 
 * 3. Test OTP timeout:
 *    - Request OTP
 *    - Wait 5 minutes
 *    - Try to verify
 *    - Should show "Code expired" error
 * 
 * 4. Test wrong OTP:
 *    - Request OTP
 *    - Enter wrong code 3 times
 *    - Should lock out after 3rd attempt
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * BACKEND ENDPOINT REFERENCE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * POST /api/generate-otp
 *   Request: { playerId: "user123" }
 *   Response: { ok: true, otpExpiry: 300000 }
 * 
 * POST /api/withdraw-tapco (WITH OTP)
 *   Request: {
 *     playerId: "user123",
 *     tapcoAmount: 15000,
 *     walletAddress: "0x...",
 *     timestamp: 1234567890,
 *     clientSignature: "...",
 *     otp: "123456"  // <-- New field
 *   }
 *   Response: { ok: true, requestId: "...", status: "pending" }
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

module.exports = { PLACEHOLDER: 'This is a documentation file' };
