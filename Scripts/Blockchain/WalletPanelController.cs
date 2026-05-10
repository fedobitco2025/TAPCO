using System.Globalization;
using System.Threading.Tasks;
using UnityEngine;
using UnityEngine.UI;

public class WalletPanelController : MonoBehaviour
{
    [Header("Dependencies")]
    public WalletManager walletManager;

    [Header("Inputs")]
    public InputField addressInput;
    public InputField withdrawAmountInput;

    [Header("Outputs")]
    public Text balanceText;
    public Text statusText;
    public Text txHashText;

    private bool isBusy;

    public async void RefreshBalance()
    {
        if (isBusy)
        {
            return;
        }

        string address = addressInput != null ? addressInput.text.Trim() : string.Empty;
        if (string.IsNullOrWhiteSpace(address))
        {
            SetStatus("Address is required", true);
            return;
        }

        await RunBusy(async () =>
        {
            float balance = await walletManager.GetPlayerBalance(address);
            if (!string.IsNullOrEmpty(walletManager.LastError))
            {
                SetStatus(walletManager.LastError, true);
                return;
            }

            if (balanceText != null)
            {
                balanceText.text = balance.ToString(CultureInfo.InvariantCulture);
            }

            SetStatus("Balance updated", false);
        });
    }

    public async void SubmitWithdraw()
    {
        if (isBusy)
        {
            return;
        }

        string address = addressInput != null ? addressInput.text.Trim() : string.Empty;
        if (string.IsNullOrWhiteSpace(address))
        {
            SetStatus("Address is required", true);
            return;
        }

        if (withdrawAmountInput == null || !float.TryParse(withdrawAmountInput.text, NumberStyles.Float, CultureInfo.InvariantCulture, out float amount))
        {
            SetStatus("Valid amount is required", true);
            return;
        }

        await RunBusy(async () =>
        {
            bool success = await walletManager.Withdraw(address, amount);
            if (!success)
            {
                SetStatus(walletManager.LastError ?? "Withdraw failed", true);
                return;
            }

            if (txHashText != null)
            {
                txHashText.text = walletManager.LastTxHash ?? string.Empty;
            }

            SetStatus("Withdraw completed", false);
            await RefreshBalanceAfterWithdraw(address);
        });
    }

    private async Task RefreshBalanceAfterWithdraw(string address)
    {
        float balance = await walletManager.GetPlayerBalance(address);
        if (string.IsNullOrEmpty(walletManager.LastError) && balanceText != null)
        {
            balanceText.text = balance.ToString(CultureInfo.InvariantCulture);
        }
    }

    private async Task RunBusy(Task action)
    {
        if (walletManager == null)
        {
            SetStatus("WalletManager reference is missing", true);
            return;
        }

        isBusy = true;
        try
        {
            await action;
        }
        finally
        {
            isBusy = false;
        }
    }

    private void SetStatus(string message, bool isError)
    {
        if (statusText != null)
        {
            statusText.text = message;
            statusText.color = isError ? Color.red : Color.green;
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
}
