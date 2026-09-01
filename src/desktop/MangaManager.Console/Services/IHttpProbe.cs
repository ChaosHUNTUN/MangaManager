namespace MangaManager.Console.Services;

/// <summary>HTTP 可达性探测（健康检查）</summary>
public interface IHttpProbe
{
    Task<bool> IsReachableAsync(string baseUrl, string path, int timeoutSeconds = 3);
}
