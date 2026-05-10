using UnityEngine;
using UnityEngine.UI;

public class WalletThemeController : MonoBehaviour
{
    [Header("Auto Apply")]
    public bool applyOnAwake = true;

    [Header("Panel")]
    public Image[] panelBackgrounds;
    public Color panelBackgroundColor = new Color(0.06f, 0.11f, 0.18f, 0.88f);

    [Header("Text")]
    public Text[] titleTexts;
    public Text[] bodyTexts;
    public Color titleColor = new Color(0.89f, 0.95f, 1f, 1f);
    public Color bodyColor = new Color(0.79f, 0.86f, 0.95f, 1f);

    [Header("Input")]
    public InputField[] inputFields;
    public Color inputTextColor = new Color(0.93f, 0.96f, 1f, 1f);
    public Color inputBackgroundColor = new Color(0.11f, 0.17f, 0.26f, 0.95f);

    [Header("Buttons")]
    public Button[] primaryButtons;
    public Button[] secondaryButtons;
    public Color primaryNormal = new Color(0.16f, 0.45f, 0.86f, 1f);
    public Color primaryHighlighted = new Color(0.21f, 0.53f, 0.96f, 1f);
    public Color primaryPressed = new Color(0.11f, 0.35f, 0.69f, 1f);
    public Color secondaryNormal = new Color(0.17f, 0.25f, 0.37f, 1f);
    public Color secondaryHighlighted = new Color(0.22f, 0.31f, 0.43f, 1f);
    public Color secondaryPressed = new Color(0.12f, 0.2f, 0.31f, 1f);

    private void Awake()
    {
        if (applyOnAwake)
        {
            ApplyTheme();
        }
    }

    public void ApplyTheme()
    {
        ApplyPanelTheme();
        ApplyTextTheme();
        ApplyInputTheme();
        ApplyButtonTheme(primaryButtons, primaryNormal, primaryHighlighted, primaryPressed);
        ApplyButtonTheme(secondaryButtons, secondaryNormal, secondaryHighlighted, secondaryPressed);
    }

    private void ApplyPanelTheme()
    {
        if (panelBackgrounds == null)
        {
            return;
        }

        for (int i = 0; i < panelBackgrounds.Length; i++)
        {
            if (panelBackgrounds[i] != null)
            {
                panelBackgrounds[i].color = panelBackgroundColor;
            }
        }
    }

    private void ApplyTextTheme()
    {
        ApplyTextColor(titleTexts, titleColor);
        ApplyTextColor(bodyTexts, bodyColor);
    }

    private void ApplyTextColor(Text[] texts, Color color)
    {
        if (texts == null)
        {
            return;
        }

        for (int i = 0; i < texts.Length; i++)
        {
            if (texts[i] != null)
            {
                texts[i].color = color;
            }
        }
    }

    private void ApplyInputTheme()
    {
        if (inputFields == null)
        {
            return;
        }

        for (int i = 0; i < inputFields.Length; i++)
        {
            InputField field = inputFields[i];
            if (field == null)
            {
                continue;
            }

            if (field.textComponent != null)
            {
                field.textComponent.color = inputTextColor;
            }

            if (field.targetGraphic is Graphic graphic)
            {
                graphic.color = inputBackgroundColor;
            }
        }
    }

    private void ApplyButtonTheme(Button[] buttons, Color normal, Color highlighted, Color pressed)
    {
        if (buttons == null)
        {
            return;
        }

        for (int i = 0; i < buttons.Length; i++)
        {
            Button button = buttons[i];
            if (button == null)
            {
                continue;
            }

            if (button.targetGraphic is Graphic targetGraphic)
            {
                targetGraphic.color = normal;
            }

            ColorBlock colors = button.colors;
            colors.normalColor = normal;
            colors.highlightedColor = highlighted;
            colors.pressedColor = pressed;
            colors.selectedColor = highlighted;
            colors.disabledColor = new Color(normal.r, normal.g, normal.b, 0.55f);
            colors.fadeDuration = 0.1f;
            button.colors = colors;
        }
    }
}
