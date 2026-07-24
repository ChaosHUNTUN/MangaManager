"""
AI 作品标题完整分析 — 提取所有可能的创作者/模型名称
使用多种策略：圆括号、方括号、破折号前缀、首词
"""
import sqlite3, os, re, json
from collections import Counter

db = os.path.join(os.path.dirname(__file__), '..', 'src', 'backend', 'MangaManager.Api', 'manga.db')
conn = sqlite3.connect(db)

# === 获取所有 AI 作品 ===
rows = conn.execute("""
    SELECT Gid, Title, AllTags, DirPath FROM local_gallery 
    WHERE AllTags LIKE '%ai_generated%'
    ORDER BY Title
""").fetchall()

out_path = os.path.join(os.path.dirname(__file__), 'ai_analysis_result.txt')
out = open(out_path, 'w', encoding='utf-8')

def w(s=''):
    out.write(str(s) + '\n')
    print(s)

w(f'总 AI 作品数: {len(rows)}')
w()

# === 噪声黑名单 ===
noise_exact = {
    'patreon', 'pixiv', 'fanbox', 'fantia', 'skeb', 'twitter',
    'deviantart', 'dlsite', 'commission', 'sample', 'digital',
    'r-18', 'r18', 'r18g', 'mosaic', 'censored', 'mosaics',
    'nsfw', 'sfw', 'hd', 'highres', '4k', '8k',
    'chinese', 'english', 'japanese', 'translated', 'ongoing', 'completed',
    'uncensored', 'decensored', '無修正', '机翻',
    'original', 'fanart', 'gift', 'present',
    'illustration', 'illust', 'illustrations',
    'part i', 'part ii', 'part iii', 'part iv', 'part v',
    'vol 1', 'vol 2', 'vol 3',
    'ep 1', 'ep 2', 'ep 3',
    'chapter 1', 'chapter 2', 'chapter 3',
}

noise_contains = {
    'pixiv', 'patreon', 'fanbox', 'fantia', 'skeb',
    'commission', '$10', '10$', '$5', '5$',
    'images', 'image', 'pages', 'page', 'pics', 'pic',
    'request', '中文', '漢化', '汉化', '翻译', '翻譯',
    '個人', '个人',
}

# 已知系列/作品名（不是创作者）
known_series = {
    'fgo', 'fate', 'fate grand order', 'fate_grand order',
    'blue archive', 'ba',
    'nikke', 'nikke goddess of victory',
    'k-on', 'konosuba', 'sao', 'code geass', 'naruto',
    'touhou project', 'touhou', 'azur lane',
    'genshin', 'genshin impact',
    'honkai', 'honkai impact', 'honkai star rail',
    'umamusume', 'uma musume',
    'resident evil',
    'dragon ball',
    'one piece',
}

# === 提取策略 ===
all_candidates = []
    
for gid, title, tags_str, dirpath in rows:
    if not title: continue
    title_orig = title
    title = title.strip()
    
    candidates_for_this = []
    
    # 策略1: 圆括号开头的 (Name)
    m = re.match(r'^\(([^\)]+?)\)', title)
    if m:
        name = m.group(1).strip()
        if name.lower() not in noise_exact and len(name) >= 2:
            candidates_for_this.append(('括号开头()', name))
    
    # 策略2: 方括号开头的 [Name]
    m = re.match(r'^\[([^\]]+?)\]', title)
    if m:
        name = m.group(1).strip()
        if name.lower() not in noise_exact and len(name) >= 2:
            candidates_for_this.append(('方括号开头[]', name))
    
    # 策略3: "Name - Title" 格式 (Name在中括号/圆括号外部)
    # 先去掉前面的 (Patreon) (Pixiv) 等
    cleaned = title
    cleaned = re.sub(r'^\([Pp]atreon\)\s*', '', cleaned)
    cleaned = re.sub(r'^\([Pp]ixiv\)\s*', '', cleaned)
    cleaned = re.sub(r'^\([Ff]anbox\)\s*', '', cleaned)
    cleaned = re.sub(r'^\([Ss]keb\)\s*', '', cleaned)
    
    m = re.match(r'^([^\(\[]+?)\s*-\s+', cleaned)
    if m:
        name = m.group(1).strip()
        # 过滤掉纯数字
        name = re.sub(r'\s*\[\d+P?\]|\s*\(\d+P?\)', '', name).strip()
        name = re.sub(r'\]\s*$|\)\s*$', '', name).strip()
        if (name.lower() not in noise_exact 
            and not any(n in name.lower() for n in noise_contains)
            and len(name) >= 3
            and not re.match(r'^[\d\s\.\-]+$', name)):
            candidates_for_this.append(('破折号前缀', name))
    
    # 策略4: 第一个方括号中的内容
    brackets = re.findall(r'\[([^\]]+)\]', title)
    for i, b in enumerate(brackets):
        b = b.strip()
        if len(b) > 50: continue
        if b.lower() in noise_exact: continue
        if any(n in b.lower() for n in noise_contains): continue
        if b.lower() in known_series: continue
        if re.match(r'^[\d\s\.\-,\$]+$', b): continue
        if len(b) >= 2 and b not in [c[1] for c in candidates_for_this]:
            candidates_for_this.append(('第{}个[]'.format(i+1), b))
    
    # 策略5: 第一个圆括号中的内容
    parens = re.findall(r'\(([^\)]+)\)', title)
    for i, p in enumerate(parens):
        p = p.strip()
        if len(p) > 50: continue
        if p.lower() in noise_exact: continue
        if any(n in p.lower() for n in noise_contains): continue
        if p.lower() in known_series: continue
        if re.match(r'^[\d\s\.\-,\$]+$', p): continue
        if len(p) >= 2 and p not in [c[1] for c in candidates_for_this]:
            candidates_for_this.append(('第{}个()'.format(i+1), p))
    
    # 策略6: 去掉所有括号后的第一个单词/词组
    bare = re.sub(r'[\[\(].*?[\]\)]', '', cleaned).strip()
    first_word = bare.split()[0] if bare else ''
    first_word = re.sub(r'[^\w\-\.]', '', first_word).strip()
    if (len(first_word) >= 3 
        and first_word.lower() not in noise_exact
        and not any(n in first_word.lower() for n in noise_contains)):
        # 检查是否跟已有候选不同
        if first_word not in [c[1] for c in candidates_for_this]:
            candidates_for_this.append(('首词', first_word))
    
    all_candidates.append((gid, title_orig, dirpath, candidates_for_this))

# === 统计 ===
all_names = Counter()
for gid, title, dirpath, cands in all_candidates:
    seen = set()
    for strategy, name in cands:
        # 规范化：去末尾空格，统一大小写比较
        key = name.strip().lower()
        if key not in seen:
            seen.add(key)
            all_names[name] += 1

# === 输出 ===
w('=== 所有提取到的标识 Top 80 ===')
noise_check = {'patreon', 'pixiv', 'ai generated', 'chinese', 'decensored', 'digital', 
               'fgo', 'ba', 'nikke', 'sao', 'k-on'}
for name, cnt in all_names.most_common(80):
    is_noise = name.lower() in noise_check or any(n in name.lower() for n in noise_check)
    noise_flag = ' [NOISE]' if is_noise else ''
    w(f'  {cnt:4d}x  {name}{noise_flag}')

# === 看看各策略贡献 ===
strategy_stats = Counter()
for gid, title, dirpath, cands in all_candidates:
    for strategy, name in cands:
        strategy_stats[strategy] += 1

w()
w('=== 各策略命中数 ===')
for s, c in strategy_stats.most_common():
    w(f'  {c:4d}x  {s}')

# === 无法提取名称的作品 ===
no_name = [(gid, title) for gid, title, dp, cands in all_candidates if not cands]
w()
w(f'=== 无法提取任何标识的作品: {len(no_name)} 个 ===')
for gid, title in no_name[:20]:
    w(f'  GID={gid}: {title[:130]}')
if len(no_name) > 20:
    w(f'  ... 还有 {len(no_name) - 20} 个')

# === 同名不同写法的合并建议 ===
w()
w('=== 可能的大小写/命名变体 ===')
name_variants = {}
for name, cnt in all_names.items():
    key = name.lower().strip()
    if key not in name_variants:
        name_variants[key] = []
    name_variants[key].append((name, cnt))

for key, variants in name_variants.items():
    if len(variants) > 1:
        total = sum(v for _, v in variants)
        w(f'  {key}: {variants} (total {total}x)')

# === 导出完整数据到 JSON ===
export = {
    'total_ai_works': len(rows),
    'total_unique_names': len(all_names),
    'no_name_count': len(no_name),
    'top_names': [{'name': n, 'count': c} for n, c in all_names.most_common(100)],
    'no_name_examples': [{'gid': g, 'title': t} for g, t in no_name[:30]],
}
with open(os.path.join(os.path.dirname(__file__), 'ai_names_analysis.json'), 'w', encoding='utf-8') as f:
    json.dump(export, f, ensure_ascii=False, indent=2)

w()
w('Written to ai_analysis_result.txt and ai_names_analysis.json')
out.close()
conn.close()
