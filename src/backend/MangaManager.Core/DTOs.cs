namespace MangaManager.Core.DTOs;

public record TagDto(
    int Id,
    string Name,
    string Color,
    string Category = "other",
    string Namespace = "other",
    string? NameCn = null,
    bool IsBlocked = false);

public record ApiResponse<T>(bool Success, T? Data, string? Message = null);
