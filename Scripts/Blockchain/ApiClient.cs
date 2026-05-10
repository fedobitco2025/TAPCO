using System.Text;
using System.Threading.Tasks;
using UnityEngine;
using UnityEngine.Networking;

public static class ApiClient
{
    public static string BaseUrl { get; private set; } = "http://localhost:4000";

    public static void SetBaseUrl(string baseUrl)
    {
        if (!string.IsNullOrWhiteSpace(baseUrl))
        {
            BaseUrl = baseUrl.TrimEnd('/');
        }
    }

    public static async Task<string> Get(string endpoint)
    {
        using (UnityWebRequest req = UnityWebRequest.Get(BuildUrl(endpoint)))
        {
            var op = req.SendWebRequest();
            while (!op.isDone)
            {
                await Task.Yield();
            }

            if (req.result != UnityWebRequest.Result.Success)
            {
                Debug.LogError("GET failed: " + req.error);
                return null;
            }

            return req.downloadHandler.text;
        }
    }

    public static async Task<string> Post(string endpoint, string json)
    {
        using (UnityWebRequest req = new UnityWebRequest(BuildUrl(endpoint), UnityWebRequest.kHttpVerbPOST))
        {
            byte[] body = Encoding.UTF8.GetBytes(json ?? "{}");
            req.uploadHandler = new UploadHandlerRaw(body);
            req.downloadHandler = new DownloadHandlerBuffer();
            req.SetRequestHeader("Content-Type", "application/json");

            var op = req.SendWebRequest();
            while (!op.isDone)
            {
                await Task.Yield();
            }

            if (req.result != UnityWebRequest.Result.Success)
            {
                Debug.LogError("POST failed: " + req.error);
                return null;
            }

            return req.downloadHandler.text;
        }
    }

    private static string BuildUrl(string endpoint)
    {
        if (string.IsNullOrWhiteSpace(endpoint))
        {
            return BaseUrl;
        }

        return endpoint.StartsWith("/") ? BaseUrl + endpoint : BaseUrl + "/" + endpoint;
    }
}
