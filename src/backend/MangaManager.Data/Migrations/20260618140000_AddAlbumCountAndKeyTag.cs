using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MangaManager.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddAlbumCountAndKeyTag : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // 添加 Count 列（整数，默认 0）
            migrationBuilder.AddColumn<int>(
                name: "Count",
                table: "album_config",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            // 添加 KeyTag 列（EH 标准标签，如 "artist:haiboku"）
            migrationBuilder.AddColumn<string>(
                name: "KeyTag",
                table: "album_config",
                type: "TEXT",
                maxLength: 500,
                nullable: true);

            // 为已有记录更新 Count = json_array_length(Gids)
            migrationBuilder.Sql(
                "UPDATE album_config SET Count = json_array_length(Gids) WHERE Count = 0 AND Gids IS NOT NULL AND Gids != '[]'");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "KeyTag",
                table: "album_config");

            migrationBuilder.DropColumn(
                name: "Count",
                table: "album_config");
        }
    }
}
