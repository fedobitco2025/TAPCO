using System.Globalization;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.Networking;
using UnityEngine.UI;

public class PlayerWalletUI : MonoBehaviour
{
    public Text gameBalanceText;
    public Text tapcoBalanceText;
    public Text earnPointsText;
    public Text statusText;
    public string playerId = "player1";
    public string deviceFingerprint = "phase3-device";

    private async void Start()
    {
        await RefreshWalletInfo();
    }

    public async Task RefreshWalletInfo()
    {
        string response = await ApiClient.Get("/player/wallet-info?playerId=" + UnityWebRequest.EscapeURL(playerId));
        if (response == null)
        {
            SetStatus("Failed to fetch wallet info", true);
            return;
        }

        JObject json = JObject.Parse(response);
        bool success = json["success"]?.ToObject<bool>() ?? false;
        if (!success)
        {
            string error = json["error"]?.ToString() ?? json["reason"]?.ToString() ?? "wallet_info_failed";
            SetStatus(error, true);
            return;
        }

        JObject payload = json["data"] as JObject ?? json;

        float gameBalance = float.Parse(payload["gameBalance"]?.ToString() ?? "0", CultureInfo.InvariantCulture);
        float tapcoBalance = float.Parse(payload["tapcoBalance"]?.ToString() ?? "0", CultureInfo.InvariantCulture);
        float earnPoints = float.Parse(payload["earnPoints"]?.ToString() ?? "0", CultureInfo.InvariantCulture);

        if (gameBalanceText != null)
        {
            gameBalanceText.text = gameBalance.ToString(CultureInfo.InvariantCulture) + " GAME";
        }

        if (tapcoBalanceText != null)
        {
            tapcoBalanceText.text = tapcoBalance.ToString(CultureInfo.InvariantCulture) + " TAPCO";
        }

        if (earnPointsText != null)
        {
            earnPointsText.text = earnPoints.ToString(CultureInfo.InvariantCulture) + " EARN";
        }

        SetStatus("Wallet info updated", false);
    }

    public async Task AddEarnPoints(int amount)
    {
        JObject body = new JObject
        {
            ["playerId"] = playerId,
            ["amount"] = amount
        };

        string response = await ApiClient.Post("/player/earn", body.ToString());
        if (response == null)
        {
            SetStatus("Failed to add earn points", true);
            return;
        }

        JObject json = JObject.Parse(response);
        bool success = json["success"]?.ToObject<bool>() ?? false;
        if (!success)
        {
            string error = json["error"]?.ToString() ?? json["reason"]?.ToString() ?? "earn_points_failed";
            SetStatus(error, true);
            return;
        }

        JObject payload = json["data"] as JObject ?? json;
        Debug.Log("Earn Points Updated: " + payload["earnPoints"]);
        await RefreshWalletInfo();
    }

    public async Task WithdrawGamePoints(int points)
    {
        JObject body = new JObject
        {
            ["playerId"] = playerId,
            ["points"] = points
        };

        if (!string.IsNullOrWhiteSpace(deviceFingerprint))
        {
            body["deviceFingerprint"] = deviceFingerprint;
        }

        string response = await ApiClient.Post("/wallet/withdraw-game", body.ToString());
        if (response == null)
        {
            SetStatus("Failed to withdraw game points", true);
            return;
        }

        JObject json = JObject.Parse(response);
        bool success = json["success"]?.ToObject<bool>() ?? false;
        if (!success)
        {
            JObject errorPayload = json["data"] as JObject ?? json;
            string error = errorPayload["error"]?.ToString() ?? errorPayload["reason"]?.ToString() ?? "withdraw_game_failed";
            SetStatus(error, true);
            return;
        }

        JObject payload = json["data"] as JObject ?? json;
        Debug.Log("Withdraw-Game TX: " + payload["txHash"]);
        await RefreshWalletInfo();
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
