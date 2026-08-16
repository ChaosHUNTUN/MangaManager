with open(r'd:\MangaManager\src\frontend\manga-ui\src\pages\LocalGallery.jsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# 1. Delete line 469: "+" button (0-based: 468)
# 2. Find and replace line 524: onConvertToAlbum (0-based: 523)
# 3. Delete convertGroupToAlbum function (474 to closing brace after setToast)
to_delete = set()
to_delete.add(468)  # "+" button line (0-based)

# Find onConvertToAlbum line
for i, l in enumerate(lines):
    if 'onConvertToAlbum={convertGroupToAlbum}' in l:
        lines[i] = '        }\n'
        break

# Delete convertGroupToAlbum function
start = -1
end = -1
for i, l in enumerate(lines):
    if 'const convertGroupToAlbum' in l:
        start = i
    if start >= 0 and 'setToast' in l and i > start:
        end = i
        break

if start >= 0 and end >= 0:
    for i in range(start, end + 1):
        to_delete.add(i)

new_lines = [l for i, l in enumerate(lines) if i not in to_delete]
print(f'Removed {len(lines) - len(new_lines)} lines')

with open(r'd:\MangaManager\src\frontend\manga-ui\src\pages\LocalGallery.jsx', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)
