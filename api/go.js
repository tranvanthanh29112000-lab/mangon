// Chuyển link sản phẩm thành link tiếp thị liên kết (affiliate) rồi mở cho khách.
// Cần 2 biến môi trường trên Vercel: SHOPEE_APP_ID và SHOPEE_SECRET
// (lấy ở mục Open API trong trang affiliate). Chưa có thì mở thẳng link gốc.
import crypto from 'node:crypto';

const ENDPOINT = 'https://open-api.affiliate.shopee.vn/graphql';
const cache = new Map();

function isShopHost(host) {
  host = host.toLowerCase();
  return host === 'shopee.vn' || host.endsWith('.shopee.vn') || host.endsWith('shp.ee');
}

async function toAffiliate(originUrl) {
  const appId = process.env.SHOPEE_APP_ID;
  const secret = process.env.SHOPEE_SECRET;
  if (!appId || !secret) return null;
  if (cache.has(originUrl)) return cache.get(originUrl);

  const payload = JSON.stringify({
    query: `mutation{generateShortLink(input:{originUrl:${JSON.stringify(originUrl)},subIds:["mangon"]}){shortLink}}`
  });
  const ts = Math.floor(Date.now() / 1000);
  const sign = crypto.createHash('sha256').update(appId + ts + payload + secret).digest('hex');

  const r = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `SHA256 Credential=${appId}, Timestamp=${ts}, Signature=${sign}`
    },
    body: payload
  });
  const data = await r.json();
  const link = data && data.data && data.data.generateShortLink && data.data.generateShortLink.shortLink;
  if (link) cache.set(originUrl, link);
  return link || null;
}

export default async function handler(req, res) {
  const raw = (req.query && req.query.u) || '';
  let u;
  try { u = new URL(String(raw)); } catch { return res.status(400).send('Link không hợp lệ'); }
  if (!isShopHost(u.hostname)) return res.status(400).send('Link không hợp lệ');

  let target = u.href;
  try {
    const aff = await toAffiliate(u.href);
    if (aff) target = aff;
  } catch { /* lỗi thì vẫn mở link gốc */ }

  res.setHeader('Cache-Control', 'no-store');
  res.writeHead(302, { Location: target });
  return res.end();
}
