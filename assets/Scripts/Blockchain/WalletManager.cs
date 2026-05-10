using System.Globalization;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.Networking;

public class WalletManager : MonoBehaviour
{
    public string LastTxHash { get; private set; }
    public float LastPointsAdded { get; private set; }
    public float LastGameBalance { get; private set; }
    public string LastError { get; private set; }

    public async Task<float> GetPlayerBalance(string address)
    {
        LastError = null;

        string response = await ApiClient.Get("/wallet/player-balance?address=" + UnityWebRequest.EscapeURL(address));
        if (response == null)
        {
            LastError = "Failed to fetch balance";
            Debug.LogError(LastError);
            return 0f;
        }

        JObject json = JObject.Parse(response);
        bool success = json["success"]?.ToObject<bool>() ?? false;
        if (!success)
        {
            LastError = json["message"]?.ToString() ?? json["reason"]?.ToString() ?? "balance_request_failed";
            Debug.LogError("Balance error: " + LastError);
            return 0f;
        }

        return float.Parse(json["balance"]?.ToString() ?? "0", CultureInfo.InvariantCulture);
    }

    public async Task<bool> Withdraw(string toAddress, float amount)
    {
        LastTxHash = null;
        LastError = null;

        JObject body = new JObject
        {
            ["toAddress"] = toAddress,
            ["amount"] = amount
        };

        string response = await ApiClient.Post("/wallet/withdraw", body.ToString());
        if (response == null)
        {
            LastError = "Withdraw failed";
            Debug.LogError(LastError);
            return false;
        }

        JObject json = JObject.Parse(response);
        bool success = json["success"]?.ToObject<bool>() ?? false;
        if (success)
        {
            LastTxHash = json["txHash"]?.ToString() ?? json["txId"]?.ToString();
            Debug.Log("Withdraw TX: " + LastTxHash);
            return true;
        }

        LastError = json["error"]?.ToString() ?? json["message"]?.ToString() ?? json["reason"]?.ToString() ?? "withdraw_failed";
        Debug.LogError("Withdraw error: " + LastError);
        return false;
    }

    public async Task<bool> DepositTapco(string playerId, string txHash)
    {
        LastError = null;
        LastTxHash = null;
        LastPointsAdded = 0f;

        JObject body = new JObject
        {
            ["playerId"] = playerId,
            ["txHash"] = txHash
        };

        string response = await ApiClient.Post("/wallet/deposit", body.ToString());
        if (response == null)
        {
            LastError = "Deposit failed";
            Debug.LogError(LastError);
            return false;
        }

        JObject json = JObject.Parse(response);
        bool success = json["success"]?.ToObject<bool>() ?? false;
        if (!success)
        {
            LastError = json["error"]?.ToString() ?? json["message"]?.ToString() ?? json["reason"]?.ToString() ?? "deposit_failed";
            Debug.LogError("Deposit error: " + LastError);
            return false;
        }

        JObject payload = json["data"] as JObject ?? json;

        LastTxHash = payload["txHash"]?.ToString() ?? txHash;
        LastPointsAdded = float.Parse(payload["pointsAdded"]?.ToString() ?? "0", CultureInfo.InvariantCulture);
        LastGameBalance = float.Parse(payload["newGameBalance"]?.ToString() ?? "0", CultureInfo.InvariantCulture);

        Debug.Log("Deposit Success: " + LastPointsAdded.ToString(CultureInfo.InvariantCulture) + " points added");
        return true;
    }
}
