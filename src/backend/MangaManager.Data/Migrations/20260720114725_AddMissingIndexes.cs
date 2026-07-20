using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MangaManager.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddMissingIndexes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_scan_log_StartedAt",
                table: "scan_log",
                column: "StartedAt");

            migrationBuilder.CreateIndex(
                name: "IX_scan_log_Status",
                table: "scan_log",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_manga_FolderPath",
                table: "manga",
                column: "FolderPath");

            migrationBuilder.CreateIndex(
                name: "IX_manga_Title",
                table: "manga",
                column: "Title");

            migrationBuilder.CreateIndex(
                name: "IX_local_gallery_Title",
                table: "local_gallery",
                column: "Title");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_scan_log_StartedAt",
                table: "scan_log");

            migrationBuilder.DropIndex(
                name: "IX_scan_log_Status",
                table: "scan_log");

            migrationBuilder.DropIndex(
                name: "IX_manga_FolderPath",
                table: "manga");

            migrationBuilder.DropIndex(
                name: "IX_manga_Title",
                table: "manga");

            migrationBuilder.DropIndex(
                name: "IX_local_gallery_Title",
                table: "local_gallery");
        }
    }
}
