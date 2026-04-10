import fs from 'fs';
import { XMLParser } from 'fast-xml-parser';
import TurndownService from 'turndown';

// 建 output 資料夾
if (!fs.existsSync('./output')) {
  fs.mkdirSync('./output');
}

const xml = fs.readFileSync('./pamo.WordPress.2026-04-09.xml', 'utf-8');

const parser = new XMLParser({
  ignoreAttributes: false,
  allowBooleanAttributes: true,
  parseTagValue: true,
  trimValues: true,
});

const json = parser.parse(xml);
const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
});

const items = Array.isArray(json?.rss?.channel?.item)
  ? json.rss.channel.item
  : [json?.rss?.channel?.item].filter(Boolean);

// 保留有 id 的標題，讓舊錨點還能跳
turndown.addRule('headingWithId', {
  filter: function (node) {
    return (
      ['H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(node.nodeName) &&
      node.getAttribute &&
      node.getAttribute('id')
    );
  },
  replacement: function (content, node) {
    const id = node.getAttribute('id');
    const tag = node.nodeName.toLowerCase();
    return `\n<${tag} id="${id}">${content}</${tag}>\n`;
  }
});

// 工具：確保值一定是陣列
function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

// 工具：分類判斷
function detectCategory(text) {
  const t = String(text || '').toLowerCase();

  if (t.includes('車禍') || t.includes('事故') || t.includes('肇事')) {
    return { slug: 'chehuo', label: '車禍' };
  }

  if (t.includes('房') || t.includes('土地') || t.includes('不動產')) {
    return { slug: 'budongchan', label: '不動產' };
  }

  if (t.includes('遺產') || t.includes('繼承') || t.includes('遺囑')) {
    return { slug: 'yichan', label: '遺產' };
  }

  return { slug: 'chehuo', label: '車禍' };
}

// 工具：fallback 抓內文第一張圖
function extractFirstImage(html) {
  const match = String(html || '').match(/<img[^>]+src="([^">]+)"/i);
  return match ? match[1] : '';
}

// 工具：取 featured image 對應 attachment id
function getThumbnailId(item) {
  const metas = toArray(item['wp:postmeta']);

  for (const meta of metas) {
    if (meta['wp:meta_key'] === '_thumbnail_id') {
      return String(meta['wp:meta_value'] || '').trim();
    }
  }

  return '';
}

// 工具：做安全檔名
function sanitizeFilename(filename) {
  return String(filename || '')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

// 工具：用 title fallback slug
function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// 工具：避免同名覆蓋
function getUniqueFilePath(baseName) {
  let candidate = `./output/${baseName}.md`;
  let counter = 2;

  while (fs.existsSync(candidate)) {
    candidate = `./output/${baseName}-${counter}.md`;
    counter += 1;
  }

  return candidate;
}

// 先建立 attachment 對照表：attachment post_id -> attachment_url
const attachmentMap = new Map();

for (const item of items) {
  if (item['wp:post_type'] === 'attachment') {
    const attachmentId = String(item['wp:post_id'] || '').trim();
    const attachmentUrl = String(item['wp:attachment_url'] || '').trim();

    if (attachmentId && attachmentUrl) {
      attachmentMap.set(attachmentId, attachmentUrl);
    }
  }
}

// 開始轉文章
items.forEach((item, index) => {
  if (item['wp:post_type'] !== 'post') return;
  if (item['wp:status'] !== 'publish') return;

  const rawTitle = item.title || '未命名';
  const rawContent = item['content:encoded'] || '';
  const rawDate = item.pubDate;
  const rawPostName = String(item['wp:post_name'] || '').trim();

  // 1. 先抓精選圖片
  const thumbnailId = getThumbnailId(item);
  let cover = thumbnailId ? attachmentMap.get(thumbnailId) || '' : '';

  // 2. 沒有精選圖片才 fallback 第一張內文圖
  if (!cover) {
    cover = extractFirstImage(rawContent);
  }

  // 3. 清掉常見目錄區塊，避免搬過去變髒
  const cleanedContent = String(rawContent)
    .replace(/<div[^>]*class="[^"]*ez-toc[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '')
    .replace(/<nav[^>]*class="[^"]*toc[^"]*"[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<div[^>]*id="ez-toc-container"[^>]*>[\s\S]*?<\/div>/gi, '');

  // 轉 markdown
  let markdown = turndown.turndown(cleanedContent);

  // 避免 frontmatter 被內文的 --- 破壞
  markdown = markdown.replace(/^---$/gm, '');

  const safeTitle = String(rawTitle).replace(/"/g, '\\"');

  const plainText = markdown
    .replace(/[#>*_[\]()`~-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const safeDescription = plainText.slice(0, 80).replace(/"/g, '\\"');
  const safeDate = new Date(rawDate).toISOString().slice(0, 10);

  const { slug, label } = detectCategory(`${rawTitle} ${plainText}`);
  const safeCover = String(cover || '').replace(/"/g, '\\"');

  // 4. 檔名優先用 WP 原本 slug
  const baseName = sanitizeFilename(
    rawPostName || slugify(rawTitle) || `article-${index}`
  );

  const file = `---
title: "${safeTitle}"
description: "${safeDescription}"
date: ${safeDate}
cover: "${safeCover}"
category: ${slug}
categoryLabel: "${label}"
draft: false
---

${markdown}
`;

  const outputPath = getUniqueFilePath(baseName);
  fs.writeFileSync(outputPath, file);
});

console.log('轉換完成');