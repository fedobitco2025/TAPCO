# Deposit UI Pro Setup (Unity)

This setup applies the full premium look and feel for the deposit flow.
It also applies a unified theme between Deposit and Wallet panels.

## 1) Scene Hierarchy

Use this structure under Canvas:

- DepositPanel (with Image background)
- TitleText
- TxHashInput
- ConfirmDepositButton
- StatusText
- RefreshBalanceButton
- CloseButton
- PopupRoot
- PopupRoot/PopupBackground
- PopupRoot/PopupText

## 2) Attach Scripts

1. Attach DepositUI to DepositPanel.
2. Attach UIButtonFeedback to:
   - ConfirmDepositButton
   - RefreshBalanceButton
   - CloseButton
3. Attach WalletThemeController to both DepositPanel and WalletPanel.

## 3) DepositUI Inspector Wiring

- walletManager: object that contains WalletManager.
- playerWalletUI: object that contains PlayerWalletUI (optional but recommended).
- txHashInput: TxHashInput.
- confirmDepositButton: ConfirmDepositButton.
- refreshBalanceButton: RefreshBalanceButton.
- closeButton: CloseButton.
- confirmButtonText: the text child inside ConfirmDepositButton.
- confirmButtonBackground: same button Image used as target graphic.
- statusText: StatusText.
- popupRoot: PopupRoot.
- popupText: PopupRoot/PopupText.
- popupBackground: PopupRoot/PopupBackground (Image).
- popupCanvasGroup: add CanvasGroup on PopupRoot and assign it.
- popupRect: RectTransform of PopupRoot.
- panelRoot: RectTransform of DepositPanel.
- panelCanvasGroup: add CanvasGroup on DepositPanel and assign it.

Glow / pulse settings:

- confirmButtonIdleColor: base button color
- confirmButtonGlowColor: active glow color when txHash is valid
- confirmGlowSpeed: 2.6 (recommended)

Haptics settings:

- enableMobileHaptics: true
- hapticCooldownSeconds: 0.12

## 4) Audio Setup

On DepositPanel object:

- Add AudioSource (or let DepositUI auto-create it).
- Assign clips in DepositUI:
  - successClip: success chime
  - errorClip: short error beep
  - clickClip: soft UI click

On each button with UIButtonFeedback:

- audioSource: same AudioSource or local one.
- hoverClip: optional soft hover tick.
- clickClip: click sound.
- enableMobileHaptics: true for tap vibration on mobile.

## 5) Recommended Visual Values

DepositPanel image:

- Color: #0B1422CC
- Round corners via sliced sprite.

Popup background image:

- successPopupColor: RGBA(33, 148, 79, 242)
- errorPopupColor: RGBA(189, 41, 41, 242)

DepositUI values:

- panelIntroDurationSeconds: 0.20
- panelIntroStartScale: 0.96
- panelErrorShakeDistance: 10
- panelErrorShakeDuration: 0.18
- popupDurationSeconds: 2.2
- popupFadeDurationSeconds: 0.20
- popupSlideDistance: 16

UIButtonFeedback values:

- hoverScale: 1.03
- pressedScale: 0.97
- lerpSpeed: 14

WalletThemeController values:

- panelBackgroundColor: RGBA(15, 28, 46, 224)
- titleColor: RGBA(227, 242, 255, 255)
- bodyColor: RGBA(201, 219, 242, 255)
- inputBackgroundColor: RGBA(28, 43, 66, 242)
- inputTextColor: RGBA(237, 245, 255, 255)
- primaryNormal/highlighted/pressed: use your brand blue ramp
- secondaryNormal/highlighted/pressed: use your neutral slate ramp

## 6) Button OnClick bindings

- ConfirmDepositButton -> DepositUI.OnConfirmDeposit
- RefreshBalanceButton -> DepositUI.OnRefreshBalance
- CloseButton -> DepositUI.OnClose

## 7) UX Result

- Smooth panel intro motion on open.
- Loading text animation on Confirm button while awaiting API.
- Animated popup with fade and slide.
- Error shake when validation/API fails.
- Confirm button glow pulse only when txHash format is valid.
- Audio cues for click/success/error.
- Mobile haptic feedback on touch and result states.
- Auto wallet refresh after successful deposit.
