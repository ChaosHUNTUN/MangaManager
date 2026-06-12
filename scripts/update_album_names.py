import sqlite3

conn = sqlite3.connect(r'src\backend\MangaManager.Api\manga.db')

# 获取所有专辑的完整数据
rows = conn.execute('SELECT Key, Name, Gids, [Order] FROM album_config').fetchall()

# 需要更新的映射
name_map = {
    'muneshiro': '宗城',
    'kikiga': '饥饥饿',
    'tsubaki aruo': '椿有堂',
    'fan no hitori': '煌野一人',
    'heco inu': '平股戌',
    'rinderon': '凛然论',
    'tamada heijun': '玉田平準',
    'naze': '为何',
    'komusou': '虚无僧',
    'agu': '阿古',
    'chirumakuro': '奇留真黑',
    'muchipan': '丰满面包',
    'ahemaru': '阿黑丸',
    'armadillo daiji': '大慈',
    'diisuke': '大辅',
    'shuuhen kouichi': '周辺康一',
    'minikoara': '瑞稀樱花',
    'sadagorou': '贞五郎',
}

updated = 0
not_found = []
for r in rows:
    key, name, gids, order = r
    if key in name_map:
        new_name = name_map[key]
        conn.execute('UPDATE album_config SET Name = ?, UpdatedAt = datetime("now") WHERE Key = ?', (new_name, key))
        print(f'  {key}: "{name}" -> "{new_name}"')
        updated += 1

# 检查未找到的key
for k in name_map:
    if k not in [r[0] for r in rows]:
        not_found.append(k)

conn.commit()

print(f'\n更新了 {updated} 条记录')
if not_found:
    print(f'未找到的key: {not_found}')

# 显示更新后的结果
placeholders = ','.join(['?'] * len(name_map))
print('\n=== 更新后结果 ===')
for r in conn.execute(f'SELECT Key, Name, json_array_length(Gids) FROM album_config WHERE Key IN ({placeholders}) ORDER BY Name', list(name_map.keys())).fetchall():
    print(f'  {r[0]} | {r[1]} | {r[2]}部')

conn.close()
