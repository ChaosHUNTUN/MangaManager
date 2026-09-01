using System.Net.Http;

namespace MangaManager.Console.Services;

public class HttpProbe : IHttpProbe
{
    private static readonly HttpClient _http = new(new SocketsHttpHandler
    {
        ConnectTimeout = TimeSpan.FromSeconds(2),
        PooledConnectionLifetime = TimeSpan.FromMinutes(2)
    })
    { Timeout = TimeSpan.FromSeconds(10) };

    public async Task<bool> IsReachableAsync(string baseUrl, string path, int timeoutSeconds = 3)
    {
        try
        {
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(timeoutSeconds));
            using var resp = await _http.GetAsync($"{baseUrl.TrimEnd('/')}{path}", cts.Token);
            return resp.IsSuccessStatusCode;
        }
        catch { return false; }
    }
}
