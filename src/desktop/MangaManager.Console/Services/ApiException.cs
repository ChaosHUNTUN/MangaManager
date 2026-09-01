namespace MangaManager.Console.Services;

/// <summary>API 调用异常（非 2xx 响应）</summary>
public class ApiException : Exception
{
    public int StatusCode { get; }

    public ApiException(int statusCode, string message) : base(message) => StatusCode = statusCode;
}
