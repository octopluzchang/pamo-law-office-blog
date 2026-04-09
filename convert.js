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
const turndown = new TurndownService();

const items = Array.isArray(json?.rss?.channel?.item)
  ? json.rss.channel.item
  : [json?.rss?.channel?.item].filter(Boolean);

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

  // 1. 先抓精選圖片
  const thumbnailId = getThumbnailId(item);
  let cover = thumbnailId ? attachmentMap.get(thumbnailId) || '' : '';

  // 2. 沒有精選圖片才 fallback 第一張內文圖
  if (!cover) {
    cover = extractFirstImage(rawContent);
  }

  // 轉 markdown
  let markdown = turndown.turndown(rawContent);

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

  fs.writeFileSync(`./output/article-${index}.md`, file);
});

console.log('轉換完成');