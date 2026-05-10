using System;
using System.Globalization;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.Networking;
using UnityEngine.UI;

public class DepositUI : MonoBehaviour
{
    [Header("Core References")]
    public WalletManager walletManager;
    public PlayerWalletUI playerWalletUI;

    [Header("Inputs")]
    public InputField txHashInput;

    [Header("Buttons")]
    public Button confirmDepositButton;
    public Button refreshBalanceButton;
    public Button closeButton;
    public Text confirmButtonText;
    public string confirmButtonIdleLabel = "Confirm Deposit";
    public Image confirmButtonBackground;
    public Color confirmButtonIdleColor = new Color(0.16f, 0.45f, 0.86f, 1f);
    public Color confirmButtonGlowColor = new Color(0.29f, 0.69f, 1f, 1f);
    public Color confirmButtonBusyColor = new Color(0.15f, 0.32f, 0.57f, 1f);
    public float confirmGlowSpeed = 2.6f;

    [Header("Status")]
    public Text statusText;
    public Color statusNormalColor = new Color(0.91f, 0.94f, 1f, 1f);
    public Color statusErrorColor = new Color(1f, 0.42f, 0.42f, 1f);

    [Header("Popup")]
    public GameObject popupRoot;
    public Text popupText;
    public Image popupBackground;
    public CanvasGroup popupCanvasGroup;
    public RectTransform popupRect;
    public Color successPopupColor = new Color(0.13f, 0.58f, 0.31f, 0.95f);
    public Color errorPopupColor = new Color(0.74f, 0.16f, 0.16f, 0.95f);
    public float popupDurationSeconds = 2.2f;
    public float popupFadeDurationSeconds = 0.2f;
    public float popupSlideDistance = 16f;

    [Header("Audio")]
    public AudioSource audioSource;
    public AudioClip successClip;
    public AudioClip errorClip;
    public AudioClip clickClip;

    [Header("Mobile Haptics")]
    public bool enableMobileHaptics = true;
    public float hapticCooldownSeconds = 0.12f;

    [Header("Panel Motion")]
    public RectTransform panelRoot;
    public CanvasGroup panelCanvasGroup;
    public float panelIntroDurationSeconds = 0.2f;
    public float panelIntroStartScale = 0.96f;
    public float panelErrorShakeDistance = 10f;
    public float panelErrorShakeDuration = 0.18f;

    [Header("Player")]
    public string playerIdOverride = "";

    private bool isBusy;
    private Coroutine loadingAnimationRoutine;
    private Coroutine popupAnimationRoutine;
    private Coroutine panelIntroRoutine;
    private Coroutine errorShakeRoutine;
    private Coroutine confirmGlowRoutine;
    private Vector2 panelBaseAnchoredPos;
    private Vector2 popupBaseAnchoredPos;
    private bool isTxHashValid;
    private float lastHapticAt = -999f;

    private string CurrentPlayerId
    {
        get
        {
            if (!string.IsNullOrWhiteSpace(playerIdOverride))
            {
                return playerIdOverride.Trim();
            }

            if (playerWalletUI != null && !string.IsNullOrWhiteSpace(playerWalletUI.playerId))
            {
                return playerWalletUI.playerId.Trim();
            }

            return string.Empty;
        }
    }

    private void Awake()
    {
        EnsureAudioSource();
        CacheUiReferences();
        HidePopup();
        SetBusyUi(false);
        SetStatus("جاهز للإيداع. ألصق txHash ثم اضغط Confirm Deposit.", false);
    }

    private void OnEnable()
    {
        AttachInputListeners();
        RefreshConfirmButtonVisual();
        PlayPanelIntro();
    }

    private void OnDisable()
    {
        DetachInputListeners();
        StopConfirmGlow();
    }

    public async void OnConfirmDeposit()
    {
        if (isBusy)
        {
            return;
        }

        PlayClick();

        if (walletManager == null)
        {
            SetStatus("WalletManager غير مربوط", true);
            ShowPopup("خطأ إعداد: WalletManager", true);
            PlayErrorShake();
            TriggerHaptic(true);
            return;
        }

        string playerId = CurrentPlayerId;
        if (string.IsNullOrWhiteSpace(playerId))
        {
            SetStatus("playerId غير متوفر", true);
            ShowPopup("تعذر تحديد معرف اللاعب", true);
            PlayErrorShake();
            TriggerHaptic(true);
            return;
        }

        string txHash = txHashInput != null ? txHashInput.text.Trim() : string.Empty;
        if (!IsTxHashFormatValid(txHash))
        {
            SetStatus("يرجى إدخال txHash صحيح", true);
            ShowPopup("txHash غير صحيح", true);
            PlayErrorShake();
            TriggerHaptic(true);
            return;
        }

        await RunBusy(async () =>
        {
            SetStatus("جاري التحقق من المعاملة...", false);

            bool ok = await walletManager.DepositTapco(playerId, txHash);
            if (!ok)
            {
                string reason = walletManager.LastError ?? "deposit_failed";
                string friendly = MapDepositError(reason);
                SetStatus("فشل الإيداع: " + friendly, true);
                ShowPopup("فشل الإيداع\n" + friendly, true);
                PlayErrorShake();
                TriggerHaptic(true);
                return;
            }

            float pointsAdded = walletManager.LastPointsAdded;
            float newBalance = walletManager.LastGameBalance;

            await RefreshWalletUiIfAvailable();

            string message =
                "تم الإيداع بنجاح\n" +
                "Points Added: " + pointsAdded.ToString(CultureInfo.InvariantCulture) + "\n" +
                "New Balance: " + newBalance.ToString(CultureInfo.InvariantCulture);

            SetStatus(message, false);
            ShowPopup("Deposit Successful!\n+" + pointsAdded.ToString(CultureInfo.InvariantCulture) + " نقطة", false);
            TriggerHaptic(false);

            if (txHashInput != null)
            {
                txHashInput.text = string.Empty;
            }
        });
    }

    public async void OnRefreshBalance()
    {
        if (isBusy)
        {
            return;
        }

        PlayClick();

        string playerId = CurrentPlayerId;
        if (string.IsNullOrWhiteSpace(playerId))
        {
            SetStatus("playerId غير متوفر", true);
            ShowPopup("تعذر تحديث الرصيد", true);
            PlayErrorShake();
            TriggerHaptic(true);
            return;
        }

        await RunBusy(async () =>
        {
            SetStatus("جاري تحديث الرصيد...", false);

            float? gameBalance = await ReadGameBalance(playerId);
            if (!gameBalance.HasValue)
            {
                SetStatus("فشل تحديث الرصيد", true);
                ShowPopup("تعذر قراءة الرصيد", true);
                PlayErrorShake();
                TriggerHaptic(true);
                return;
            }

            await RefreshWalletUiIfAvailable();

            string msg = "Balance Updated: " + gameBalance.Value.ToString(CultureInfo.InvariantCulture);
            SetStatus(msg, false);
            ShowPopup(msg, false);
        });
    }

    public void OnClose()
    {
        PlayClick();

        if (txHashInput != null)
        {
            txHashInput.text = string.Empty;
        }

        HidePopup();
        gameObject.SetActive(false);
    }

    private async Task RunBusy(Func<Task> action)
    {
        if (action == null)
        {
            return;
        }

        isBusy = true;
        SetBusyUi(true);

        try
        {
            await action();
        }
        catch (Exception ex)
        {
            Debug.LogError("DepositUI exception: " + ex.Message);
            SetStatus("حدث خطأ غير متوقع", true);
            ShowPopup("Unexpected error", true);
            PlayErrorShake();
            TriggerHaptic(true);
        }
        finally
        {
            SetBusyUi(false);
            isBusy = false;
        }
    }

    private async Task RefreshWalletUiIfAvailable()
    {
        if (playerWalletUI == null)
        {
            return;
        }

        await playerWalletUI.RefreshWalletInfo();
    }

    private async Task<float?> ReadGameBalance(string playerId)
    {
        string url = "/player/wallet-info?playerId=" + UnityWebRequest.EscapeURL(playerId);
        string response = await ApiClient.Get(url);
        if (response == null)
        {
            return null;
        }

        JObject json = JObject.Parse(response);
        bool success = json["success"]?.ToObject<bool>() ?? false;
        if (!success)
        {
            return null;
        }

        JObject payload = json["data"] as JObject ?? json;
        return float.Parse(payload["gameBalance"]?.ToString() ?? "0", CultureInfo.InvariantCulture);
    }

    private static bool IsTxHashFormatValid(string txHash)
    {
        if (string.IsNullOrWhiteSpace(txHash))
        {
            return false;
        }

        if (!txHash.StartsWith("0x", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        if (txHash.Length != 66)
        {
            return false;
        }

        for (int i = 2; i < txHash.Length; i++)
        {
            char c = txHash[i];
            bool isHex =
                (c >= '0' && c <= '9') ||
                (c >= 'a' && c <= 'f') ||
                (c >= 'A' && c <= 'F');

            if (!isHex)
            {
                return false;
            }
        }

        return true;
    }

    private string MapDepositError(string reason)
    {
        switch (reason)
        {
            case "tx_already_used":
                return "هذه المعاملة مستخدمة سابقا";
            case "transaction_sender_mismatch":
                return "عنوان المرسل لا يطابق محفظة اللاعب";
            case "invalid_transaction":
                return "المعاملة غير صالحة أو غير مؤكدة";
            case "invalid_tapco_amount":
                return "قيمة TAPCO غير صحيحة";
            case "missing_wallet_address":
                return "لم يتم ربط عنوان محفظة للاعب";
            case "player_not_found":
                return "اللاعب غير موجود";
            default:
                return reason;
        }
    }

    private void SetButtonsInteractable(bool value)
    {
        if (confirmDepositButton != null)
        {
            confirmDepositButton.interactable = value;
        }

        if (refreshBalanceButton != null)
        {
            refreshBalanceButton.interactable = value;
        }

        if (closeButton != null)
        {
            closeButton.interactable = value;
        }
    }

    private void SetStatus(string message, bool isError)
    {
        if (statusText != null)
        {
            statusText.text = "Deposit Result:\n" + message;
            statusText.color = isError ? statusErrorColor : statusNormalColor;
        }

        if (isError)
        {
            Debug.LogError(message);
        }
        else
        {
            Debug.Log(message);
        }
    }

    private void ShowPopup(string message, bool isError)
    {
        if (popupRoot == null || popupText == null)
        {
            PlayAlert(isError);
            return;
        }

        if (popupAnimationRoutine != null)
        {
            StopCoroutine(popupAnimationRoutine);
            popupAnimationRoutine = null;
        }

        popupAnimationRoutine = StartCoroutine(AnimatePopup(message, isError));
    }

    private System.Collections.IEnumerator AnimatePopup(string message, bool isError)
    {
        popupRoot.SetActive(true);
        popupText.text = message;

        if (popupBackground != null)
        {
            popupBackground.color = isError ? errorPopupColor : successPopupColor;
        }

        if (popupCanvasGroup != null)
        {
            popupCanvasGroup.alpha = 0f;
            popupCanvasGroup.blocksRaycasts = false;
        }

        if (popupRect != null)
        {
            popupRect.anchoredPosition = popupBaseAnchoredPos + new Vector2(0f, popupSlideDistance);
        }

        PlayAlert(isError);

        float fadeDuration = Mathf.Max(0.08f, popupFadeDurationSeconds);
        float tIn = 0f;
        while (tIn < 1f)
        {
            tIn += Time.unscaledDeltaTime / fadeDuration;
            float eased = EaseOutCubic(Mathf.Clamp01(tIn));

            if (popupCanvasGroup != null)
            {
                popupCanvasGroup.alpha = eased;
            }

            if (popupRect != null)
            {
                popupRect.anchoredPosition = Vector2.Lerp(
                    popupBaseAnchoredPos + new Vector2(0f, popupSlideDistance),
                    popupBaseAnchoredPos,
                    eased
                );
            }

            yield return null;
        }

        yield return new WaitForSecondsRealtime(Mathf.Max(0.5f, popupDurationSeconds));

        float tOut = 0f;
        while (tOut < 1f)
        {
            tOut += Time.unscaledDeltaTime / fadeDuration;
            float eased = EaseInCubic(Mathf.Clamp01(tOut));

            if (popupCanvasGroup != null)
            {
                popupCanvasGroup.alpha = 1f - eased;
            }

            if (popupRect != null)
            {
                popupRect.anchoredPosition = Vector2.Lerp(
                    popupBaseAnchoredPos,
                    popupBaseAnchoredPos + new Vector2(0f, popupSlideDistance),
                    eased
                );
            }

            yield return null;
        }

        if (popupRoot != null)
        {
            popupRoot.SetActive(false);
        }

        popupAnimationRoutine = null;
    }

    private void HidePopup()
    {
        if (popupAnimationRoutine != null)
        {
            StopCoroutine(popupAnimationRoutine);
            popupAnimationRoutine = null;
        }

        if (popupRoot != null)
        {
            popupRoot.SetActive(false);
        }

        if (popupCanvasGroup != null)
        {
            popupCanvasGroup.alpha = 0f;
            popupCanvasGroup.blocksRaycasts = false;
        }

        if (popupRect != null)
        {
            popupRect.anchoredPosition = popupBaseAnchoredPos + new Vector2(0f, popupSlideDistance);
        }
    }

    private void EnsureAudioSource()
    {
        if (audioSource != null)
        {
            return;
        }

        audioSource = GetComponent<AudioSource>();
        if (audioSource == null)
        {
            audioSource = gameObject.AddComponent<AudioSource>();
        }

        audioSource.playOnAwake = false;
    }

    private void CacheUiReferences()
    {
        if (panelRoot == null)
        {
            panelRoot = transform as RectTransform;
        }

        if (panelRoot != null)
        {
            panelBaseAnchoredPos = panelRoot.anchoredPosition;
        }

        if (panelCanvasGroup == null && panelRoot != null)
        {
            panelCanvasGroup = panelRoot.GetComponent<CanvasGroup>();
            if (panelCanvasGroup == null)
            {
                panelCanvasGroup = panelRoot.gameObject.AddComponent<CanvasGroup>();
            }
        }

        if (popupRoot != null && popupRect == null)
        {
            popupRect = popupRoot.transform as RectTransform;
        }

        if (popupRoot != null && popupCanvasGroup == null)
        {
            popupCanvasGroup = popupRoot.GetComponent<CanvasGroup>();
            if (popupCanvasGroup == null)
            {
                popupCanvasGroup = popupRoot.AddComponent<CanvasGroup>();
            }
        }

        if (popupRect != null)
        {
            popupBaseAnchoredPos = popupRect.anchoredPosition;
        }

        if (confirmButtonText == null && confirmDepositButton != null)
        {
            confirmButtonText = confirmDepositButton.GetComponentInChildren<Text>();
        }

        if (confirmButtonBackground == null && confirmDepositButton != null)
        {
            confirmButtonBackground = confirmDepositButton.targetGraphic as Image;
        }
    }

    private void SetBusyUi(bool busy)
    {
        SetButtonsInteractable(!busy);

        if (loadingAnimationRoutine != null)
        {
            StopCoroutine(loadingAnimationRoutine);
            loadingAnimationRoutine = null;
        }

        if (busy)
        {
            loadingAnimationRoutine = StartCoroutine(AnimateConfirmButtonLoading());
        }
        else if (confirmButtonText != null)
        {
            confirmButtonText.text = string.IsNullOrWhiteSpace(confirmButtonIdleLabel)
                ? "Confirm Deposit"
                : confirmButtonIdleLabel;
        }

        RefreshConfirmButtonVisual();
    }

    private System.Collections.IEnumerator AnimateConfirmButtonLoading()
    {
        if (confirmButtonText == null)
        {
            yield break;
        }

        string baseLabel = "Processing";
        float tick = 0f;
        int dotCount = 0;

        while (isBusy)
        {
            tick += Time.unscaledDeltaTime;
            if (tick >= 0.35f)
            {
                tick = 0f;
                dotCount = (dotCount + 1) % 4;
                confirmButtonText.text = baseLabel + new string('.', dotCount);
            }

            yield return null;
        }
    }

    private void PlayPanelIntro()
    {
        if (panelRoot == null || panelCanvasGroup == null)
        {
            return;
        }

        if (panelIntroRoutine != null)
        {
            StopCoroutine(panelIntroRoutine);
        }

        panelIntroRoutine = StartCoroutine(AnimatePanelIntro());
    }

    private System.Collections.IEnumerator AnimatePanelIntro()
    {
        float duration = Mathf.Max(0.08f, panelIntroDurationSeconds);
        float t = 0f;

        panelCanvasGroup.alpha = 0f;
        panelRoot.localScale = Vector3.one * Mathf.Clamp(panelIntroStartScale, 0.85f, 1f);
        panelRoot.anchoredPosition = panelBaseAnchoredPos + new Vector2(0f, 10f);

        while (t < 1f)
        {
            t += Time.unscaledDeltaTime / duration;
            float eased = EaseOutCubic(Mathf.Clamp01(t));

            panelCanvasGroup.alpha = eased;
            panelRoot.localScale = Vector3.Lerp(
                Vector3.one * Mathf.Clamp(panelIntroStartScale, 0.85f, 1f),
                Vector3.one,
                eased
            );
            panelRoot.anchoredPosition = Vector2.Lerp(
                panelBaseAnchoredPos + new Vector2(0f, 10f),
                panelBaseAnchoredPos,
                eased
            );

            yield return null;
        }

        panelCanvasGroup.alpha = 1f;
        panelRoot.localScale = Vector3.one;
        panelRoot.anchoredPosition = panelBaseAnchoredPos;
        panelIntroRoutine = null;
    }

    private void PlayErrorShake()
    {
        if (panelRoot == null)
        {
            return;
        }

        if (errorShakeRoutine != null)
        {
            StopCoroutine(errorShakeRoutine);
        }

        errorShakeRoutine = StartCoroutine(AnimateErrorShake());
    }

    private System.Collections.IEnumerator AnimateErrorShake()
    {
        float duration = Mathf.Max(0.08f, panelErrorShakeDuration);
        float amplitude = Mathf.Max(2f, panelErrorShakeDistance);
        float t = 0f;

        while (t < 1f)
        {
            t += Time.unscaledDeltaTime / duration;
            float progress = Mathf.Clamp01(t);
            float damper = 1f - progress;
            float x = Mathf.Sin(progress * Mathf.PI * 5f) * amplitude * damper;

            panelRoot.anchoredPosition = panelBaseAnchoredPos + new Vector2(x, 0f);
            yield return null;
        }

        panelRoot.anchoredPosition = panelBaseAnchoredPos;
        errorShakeRoutine = null;
    }

    private void PlayClick()
    {
        if (audioSource == null || clickClip == null)
        {
            return;
        }

        audioSource.PlayOneShot(clickClip);
    }

    private void AttachInputListeners()
    {
        if (txHashInput == null)
        {
            return;
        }

        txHashInput.onValueChanged.RemoveListener(OnTxHashChanged);
        txHashInput.onValueChanged.AddListener(OnTxHashChanged);
        OnTxHashChanged(txHashInput.text);
    }

    private void DetachInputListeners()
    {
        if (txHashInput == null)
        {
            return;
        }

        txHashInput.onValueChanged.RemoveListener(OnTxHashChanged);
    }

    private void OnTxHashChanged(string value)
    {
        isTxHashValid = IsTxHashFormatValid(value?.Trim() ?? string.Empty);
        RefreshConfirmButtonVisual();
    }

    private void RefreshConfirmButtonVisual()
    {
        if (confirmButtonBackground == null)
        {
            return;
        }

        if (isBusy)
        {
            StopConfirmGlow();
            confirmButtonBackground.color = confirmButtonBusyColor;
            return;
        }

        if (isTxHashValid)
        {
            StartConfirmGlow();
            return;
        }

        StopConfirmGlow();
        confirmButtonBackground.color = confirmButtonIdleColor;
    }

    private void StartConfirmGlow()
    {
        if (confirmGlowRoutine != null)
        {
            return;
        }

        confirmGlowRoutine = StartCoroutine(AnimateConfirmGlow());
    }

    private void StopConfirmGlow()
    {
        if (confirmGlowRoutine != null)
        {
            StopCoroutine(confirmGlowRoutine);
            confirmGlowRoutine = null;
        }
    }

    private System.Collections.IEnumerator AnimateConfirmGlow()
    {
        while (!isBusy && isTxHashValid)
        {
            if (confirmButtonBackground != null)
            {
                float t = 0.5f + 0.5f * Mathf.Sin(Time.unscaledTime * Mathf.Max(0.5f, confirmGlowSpeed));
                confirmButtonBackground.color = Color.Lerp(confirmButtonIdleColor, confirmButtonGlowColor, t);
            }

            yield return null;
        }

        confirmGlowRoutine = null;
        if (confirmButtonBackground != null && !isBusy)
        {
            confirmButtonBackground.color = isTxHashValid ? confirmButtonGlowColor : confirmButtonIdleColor;
        }
    }

    private void TriggerHaptic(bool isError)
    {
        if (!enableMobileHaptics)
        {
            return;
        }

        if (Time.unscaledTime - lastHapticAt < Mathf.Max(0.05f, hapticCooldownSeconds))
        {
            return;
        }

        lastHapticAt = Time.unscaledTime;

#if UNITY_ANDROID || UNITY_IOS
        Handheld.Vibrate();
#endif
    }

    private static float EaseOutCubic(float t)
    {
        float inv = 1f - t;
        return 1f - inv * inv * inv;
    }

    private static float EaseInCubic(float t)
    {
        return t * t * t;
    }

    private void PlayAlert(bool isError)
    {
        if (audioSource == null)
        {
            return;
        }

        AudioClip clip = isError ? errorClip : successClip;
        if (clip != null)
        {
            audioSource.PlayOneShot(clip);
        }
    }
}
