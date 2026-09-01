using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MangaManager.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddWorkTagSystem : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_tag_Name",
                table: "tag");

            migrationBuilder.AddColumn<bool>(
                name: "IsBlocked",
                table: "tag",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "NameCn",
                table: "tag",
                type: "TEXT",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Namespace",
                table: "tag",
                type: "TEXT",
                maxLength: 50,
                nullable: false,
                defaultValue: "other");

            migrationBuilder.CreateTable(
                name: "work_tag",
                columns: table => new
                {
                    WorkId = table.Column<int>(type: "INTEGER", nullable: false),
                    TagId = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_work_tag", x => new { x.WorkId, x.TagId });
                    table.ForeignKey(
                        name: "FK_work_tag_tag_TagId",
                        column: x => x.TagId,
                        principalTable: "tag",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_tag_Namespace_Name",
                table: "tag",
                columns: new[] { "Namespace", "Name" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_work_tag_TagId",
                table: "work_tag",
                column: "TagId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "work_tag");

            migrationBuilder.DropIndex(
                name: "IX_tag_Namespace_Name",
                table: "tag");

            migrationBuilder.DropColumn(
                name: "IsBlocked",
                table: "tag");

            migrationBuilder.DropColumn(
                name: "NameCn",
                table: "tag");

            migrationBuilder.DropColumn(
                name: "Namespace",
                table: "tag");

            migrationBuilder.CreateIndex(
                name: "IX_tag_Name",
                table: "tag",
                column: "Name",
                unique: true);
        }
    }
}
