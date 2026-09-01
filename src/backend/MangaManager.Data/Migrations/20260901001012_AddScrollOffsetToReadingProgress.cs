using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MangaManager.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddScrollOffsetToReadingProgress : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<double>(
                name: "ScrollOffset",
                table: "local_reading_progress",
                type: "REAL",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ScrollOffset",
                table: "local_reading_progress");
        }
    }
}
