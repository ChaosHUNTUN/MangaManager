using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json;
using MangaManager.Shared.Download;

namespace MangaManager.Console.Services;

/// <summary>后端 API HTTP 封装（HttpClient 单例，超时可配；非 2xx 抛 ApiException）</summary>
public class ApiClient : IApiClient
{
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    private readonly HttpClient _http;
    private readonly string _baseUrl;

    public ApiClient(string baseUrl, int timeoutSeconds = 5)
    {
        _baseUrl = baseUrl.TrimEnd('/');
        _http = new HttpClient(new SocketsHttpHandler
        {
            ConnectTimeout = TimeSpan.FromSeconds(2),
            PooledConnectionLifetime = TimeSpan.FromMinutes(2)
        })
        { Timeout = TimeSpan.FromSeconds(Math.Max(1, timeoutSeconds)) };
    }

    public async Task<bool> IsHealthyAsync(CancellationToken ct = default)
    {
        try
        {
            using var resp = await _http.GetAsync($"{_baseUrl}/health", ct);
            return resp.IsSuccessStatusCode;
        }
        catch { return false; }
    }

    public async Task<List<DownloadTaskDto>> GetDownloadTasksAsync(CancellationToken ct = default)
    {
        var json = await _http.GetFromJsonAsync<MangaManager.Shared.ApiResponse<List<DownloadTaskDto>>>(
            $"{_baseUrl}/api/download/tasks", JsonOpts, ct);
        return json?.Data ?? new List<DownloadTaskDto>();
    }

    public Task PauseTaskAsync(int gid) => PostAction($"/api/download/tasks/{gid}/pause");
    public Task ResumeTaskAsync(int gid) => PostAction($"/api/download/tasks/{gid}/resume");
    public Task RestartTaskAsync(int gid) => PostAction($"/api/download/tasks/{gid}/restart");
    public Task RestartAllFailedAsync() => PostAction("/api/download/tasks/restart-all-failed");

    public async Task RemoveTaskAsync(int gid)
    {
        using var resp = await _http.DeleteAsync($"{_baseUrl}/api/download/tasks/{gid}");
        if (!resp.IsSuccessStatusCode)
            throw new ApiException((int)resp.StatusCode, $"移除任务失败 (HTTP {(int)resp.StatusCode})");
    }

    private async Task PostAction(string path)
    {
        using var resp = await _http.PostAsync($"{_baseUrl}{path}", null);
        if (!resp.IsSuccessStatusCode)
            throw new ApiException((int)resp.StatusCode, $"操作失败 (HTTP {(int)resp.StatusCode})");
    }
}
