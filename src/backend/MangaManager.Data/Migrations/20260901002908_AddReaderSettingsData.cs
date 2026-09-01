using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MangaManager.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddReaderSettingsData : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Data",
                table: "reader_settings",
                type: "TEXT",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Data",
                table: "reader_settings");
        }
    }
}
