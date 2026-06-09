namespace MangaManager.Core.DTOs;

public record MangaListItem(
    int Id,
    string Title,
    string? CoverUrl,
    int FileCount,
    string Status,
    DateTime CreatedAt,
    List<TagDto> Tags
);

public record MangaDetail(
    int Id,
    string Title,
    string FolderName,
    string FolderPath,
    string? CoverUrl,
    int FileCount,
    long TotalSize,
    string? Description,
    string Status,
    List<string> Authors,
    List<TagDto> Tags,
    int? ProgressPage,
    DateTime CreatedAt,
    DateTime UpdatedAt
);

public record TagDto(int Id, string Name, string Color, string Category = "other");

public record ScanRequest(string Directory, string? ClientId = null);

public record OpenRequest(bool Fullscreen = true);

public record ApiResponse<T>(bool Success, T? Data, string? Message = null);
