using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

[RequireComponent(typeof(Button))]
public class UIButtonFeedback : MonoBehaviour, IPointerEnterHandler, IPointerExitHandler, IPointerDownHandler, IPointerUpHandler
{
    [Header("Scale")]
    public float hoverScale = 1.03f;
    public float pressedScale = 0.97f;
    public float lerpSpeed = 14f;

    [Header("Audio")]
    public AudioSource audioSource;
    public AudioClip hoverClip;
    public AudioClip clickClip;

    [Header("Haptics")]
    public bool enableMobileHaptics = true;
    public float hapticCooldownSeconds = 0.08f;

    [Header("Tint")]
    public Graphic targetGraphic;
    public Color normalColor = new Color(1f, 1f, 1f, 1f);
    public Color hoverColor = new Color(0.92f, 0.97f, 1f, 1f);
    public Color pressedColor = new Color(0.85f, 0.93f, 1f, 1f);

    private Vector3 baseScale;
    private Vector3 targetScale;
    private bool isPointerInside;
    private bool isPressed;
    private float lastHapticAt = -999f;

    private void Awake()
    {
        baseScale = transform.localScale;
        targetScale = baseScale;

        if (targetGraphic == null)
        {
            targetGraphic = GetComponent<Graphic>();
        }

        if (audioSource == null)
        {
            audioSource = GetComponent<AudioSource>();
        }

        if (audioSource == null)
        {
            audioSource = gameObject.AddComponent<AudioSource>();
        }

        audioSource.playOnAwake = false;

        ApplyVisualState();
    }

    private void Update()
    {
        transform.localScale = Vector3.Lerp(transform.localScale, targetScale, Time.unscaledDeltaTime * Mathf.Max(1f, lerpSpeed));
    }

    public void OnPointerEnter(PointerEventData eventData)
    {
        isPointerInside = true;
        if (!isPressed)
        {
            PlayClip(hoverClip);
        }

        ApplyVisualState();
    }

    public void OnPointerExit(PointerEventData eventData)
    {
        isPointerInside = false;
        isPressed = false;
        ApplyVisualState();
    }

    public void OnPointerDown(PointerEventData eventData)
    {
        isPressed = true;
        PlayClip(clickClip);
        TriggerHaptic();
        ApplyVisualState();
    }

    public void OnPointerUp(PointerEventData eventData)
    {
        isPressed = false;
        ApplyVisualState();
    }

    private void ApplyVisualState()
    {
        if (isPressed)
        {
            targetScale = baseScale * Mathf.Clamp(pressedScale, 0.85f, 1f);
            ApplyColor(pressedColor);
            return;
        }

        if (isPointerInside)
        {
            targetScale = baseScale * Mathf.Max(1f, hoverScale);
            ApplyColor(hoverColor);
            return;
        }

        targetScale = baseScale;
        ApplyColor(normalColor);
    }

    private void ApplyColor(Color color)
    {
        if (targetGraphic != null)
        {
            targetGraphic.color = color;
        }
    }

    private void PlayClip(AudioClip clip)
    {
        if (audioSource == null || clip == null)
        {
            return;
        }

        audioSource.PlayOneShot(clip);
    }

    private void TriggerHaptic()
    {
        if (!enableMobileHaptics)
        {
            return;
        }

        if (Time.unscaledTime - lastHapticAt < Mathf.Max(0.04f, hapticCooldownSeconds))
        {
            return;
        }

        lastHapticAt = Time.unscaledTime;

#if UNITY_ANDROID || UNITY_IOS
        Handheld.Vibrate();
#endif
    }
}
