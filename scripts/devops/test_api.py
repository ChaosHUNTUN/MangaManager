import urllib.request, json

BASE = 'http://localhost:5000/api'
results = []

def test(name, url, method='GET', body=None, expected_status=200):
    try:
        req = urllib.request.Request(url, method=method,
            data=json.dumps(body).encode() if body else None,
            headers={'Content-Type': 'application/json'} if body else {})
        r = urllib.request.urlopen(req, timeout=15)
        d = json.loads(r.read())
        ok = r.status == expected_status
        status = 'PASS' if ok else 'FAIL'
        print(f'  [{status}] {name} -> {r.status} | success={d.get("success")} | data={str(d.get("data",""))[:80]}')
        results.append((status, name))
        return d
    except urllib.error.HTTPError as e:
        ok = e.code == expected_status
        status = 'PASS' if ok else 'FAIL'
        print(f'  [{status}] {name} -> {e.code} (expected {expected_status})')
        results.append((status, name))
    except Exception as e:
        print(f'  [FAIL] {name} -> {str(e)[:80]}')
        results.append(('FAIL', name))

print('=' * 60)
print('  MangaManager API 功能测试')
print('=' * 60)

# 1. 漫画接口
print('\n--- 1. 漫画接口 ---')
d = test('GET /manga', f'{BASE}/manga')
mid = d['data'][0]['id'] if d and d.get('data') else 1

test('GET /manga/{id}', f'{BASE}/manga/{mid}')
test('GET /manga/{id} 不存在', f'{BASE}/manga/99999', expected_status=404)
test('GET /cover/{id}', f'{BASE}/cover/{mid}')
test('GET /cover/{id} 不存在', f'{BASE}/cover/99999', expected_status=404)

# 2. 搜索
print('\n--- 2. 搜索接口 ---')
test('标题搜索', f'{BASE}/manga?search=Sakura')
test('标签筛选', f'{BASE}/manga?tags=1,2,3')
test('混合搜索', f'{BASE}/manga?search=Sakura&tags=1')
test('空搜索', f'{BASE}/manga?search=')

# 3. 标签
print('\n--- 3. 标签 CRUD ---')
d = test('POST 创建标签', f'{BASE}/tag', 'POST', {'name':'__TEST_TAG__','color':'#ff0000'})
tid = d['data']['id'] if d and d.get('data') else None

test('GET 标签列表', f'{BASE}/tag')
test('GET 漫画标签', f'{BASE}/manga/{mid}/tags')
if tid:
    test('PUT 设置标签', f'{BASE}/manga/{mid}/tags', 'PUT', [tid])
    test('POST 批量标签', f'{BASE}/manga/batch/tags', 'POST', {'mangaIds':[mid],'tagIds':[tid]})
    test('DELETE 删除标签', f'{BASE}/tag/{tid}', 'DELETE')
test('POST 创建重复标签', f'{BASE}/tag', 'POST', {'name':'__TEST_TAG__','color':'#ff0000'}, expected_status=400)

# 4. 阅读器
print('\n--- 4. 阅读器接口 ---')
d = test('GET /reader/manga/{mid}/pages', f'{BASE}/reader/manga/{mid}/pages')
test('GET /reader/manga/{mid}/page/0', f'{BASE}/reader/manga/{mid}/page/0')
test('GET 无效漫画页', f'{BASE}/reader/manga/99999/page/0', expected_status=404)
test('GET 越界页码', f'{BASE}/reader/manga/{mid}/page/99999', expected_status=404)

# 5. 扫描（空目录/无效目录）
print('\n--- 5. 扫描接口 ---')
test('POST 无效目录', f'{BASE}/manga/scan', 'POST', {'directory':'X:\\不存在的路径'}, expected_status=400)
test('POST 空目录', f'{BASE}/manga/scan', 'POST', {'directory':'D:\\MangaManager\\docs'}, expected_status=400)

# 6. 边界条件
print('\n--- 6. 边界条件 ---')
test('标签设置超过100个', f'{BASE}/manga/{mid}/tags', 'PUT', list(range(1,102)), expected_status=400)
test('空标签名创建', f'{BASE}/tag', 'POST', {'name':'', 'color':'#000'}, expected_status=400)

# 汇总
print('\n' + '=' * 60)
passed = sum(1 for s,_ in results if s == 'PASS')
failed = sum(1 for s,_ in results if s == 'FAIL')
print(f'  总计: {len(results)} 项 | 通过: {passed} | 失败: {failed}')
if failed > 0:
    print('  失败项:')
    for s,n in results:
        if s == 'FAIL':
            print(f'    - {n}')
print('=' * 60)
