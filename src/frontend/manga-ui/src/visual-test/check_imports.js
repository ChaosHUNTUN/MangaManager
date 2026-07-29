// 检查 JSX 文件中是否有未导入的图标引用
const fs = require('fs');
const path = require('path');

const dir = path.resolve(__dirname);
const files = fs.readdirSync(dir).filter(f => f.endsWith('.jsx'));

let totalIssues = 0;

for (const file of files) {
  const src = fs.readFileSync(path.join(dir, file), 'utf8');

  // 提取 JSX 中使用的标识符 (PascalCase 开头)
  const used = new Set();
  const re = /<([A-Z][A-Za-z]+(?:Outlined|Filled|TwoTone)?)\b/g;
  let m;
  while ((m = re.exec(src))) used.add(m[1]);

  // 提取 import 语句中的标识符
  const imported = new Set();
  const importRegex = /import\s+\{([^}]+)\}\s+from[^;]+;?/g;
  let im;
  while ((im = importRegex.exec(src))) {
    im[1].split(',').forEach(s => {
      const trimmed = s.trim().split(' as ')[0].trim();
      if (trimmed) imported.add(trimmed);
    });
  }

  // 检查缺失的
  const missing = [...used].filter(u => !imported.has(u) && !src.includes(`function ${u}`) && !src.includes(`const ${u}`));

  if (missing.length) {
    console.log(`\n=== ${file} ===`);
    console.log('  MISSING:', missing.join(', '));
    totalIssues += missing.length;
  }
}

console.log(`\n=== Total: ${totalIssues} issues ===`);
process.exit(totalIssues > 0 ? 1 : 0);