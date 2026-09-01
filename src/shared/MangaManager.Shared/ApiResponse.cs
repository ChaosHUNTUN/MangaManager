namespace MangaManager.Shared;

/// <summary>统一 API 响应包装（与后端 ApiResponse 结构一致，供客户端反序列化）</summary>
public class ApiResponse<T>
{
    public bool Success { get; set; }
    public T? Data { get; set; }
    public string? Message { get; set; }
}
