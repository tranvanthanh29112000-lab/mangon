// Lấy danh sách chương trình khuyến mãi từ Open API affiliate rồi ghi vào vouchers.json.
// Chạy tự động bằng GitHub Actions (.github/workflows/cap-nhat-ma.yml), không cần Claude.
// Chỉ chạy khi có 2 secret: SHOPEE_APP_ID và SHOPEE_SECRET. Chưa có thì tự bỏ qua.
// Mục do script này ghi có "nguon": "api". Mã bạn tự thêm hoặc do Claude thêm được giữ nguyên.
import crypto from 'node:crypto';
import fs from 'node:fs';

const APP_ID = process.env.SHOPEE_APP_ID;
const SECRET = process.env.SHOPEE_SECRET;
const FILE = new URL('../vouchers.json', import.meta.url);
const ENDPOINT = 'https://open-api.affiliate.shopee.vn/graphql';

if (!APP_ID || !SECRET) {
  console.log('Chưa có SHOPEE_APP_ID / SHOPEE_SECRET, bỏ qua.');
  process.exit(0);
}

async function gql(query) {
  const payload = JSON.stringify({ query });
  const ts = Math.floor(Date.now() / 1000);
  const sign = crypto.createHash('sha256').update(APP_ID + ts + payload + SECRET).digest('hex');
  const r = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `SHA256 Credential=${APP_ID}, Timestamp=${ts}, Signature=${sign}` },
    body: payload
  });
  const data = await r.json();
  if (data.errors) throw new Error(JSON.stringify(data.errors));
  return data.data;
}

const toIso = (sec) => (sec ? new Date(sec * 1000).toISOString() : undefined);
const slug = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

const data = await gql(`{
  shopeeOfferV2(sortType: 2, page: 1, limit: 30) {
    nodes { offerName offerLink originalLink commissionRate periodStartTime periodEndTime }
  }
}`);

const nodes = (data && data.shopeeOfferV2 && data.shopeeOfferV2.nodes) || [];
const fromApi = nodes
  .filter((n) => n.offerName && (n.offerLink || n.originalLink))
  .map((n) => ({
    id: 'api-' + slug(n.offerName),
    nguon: 'api',
    loai: 'toan-san',
    tieuDe: n.offerName.length > 40 ? n.offerName.slice(0, 38) + '…' : n.offerName,
    dieuKien: 'Chương trình khuyến mãi đang chạy',
    link: n.offerLink || n.originalLink,
    batDau: toIso(n.periodStartTime),
    ketThuc: toIso(n.periodEndTime)
  }));

const json = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const kept = (json.danhSachMa || []).filter((v) => v.nguon !== 'api');
json.danhSachMa = [...kept, ...fromApi];
json.caiDat = json.caiDat || {};
json.caiDat.capNhatLuc = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
fs.writeFileSync(FILE, JSON.stringify(json, null, 2) + '\n');
console.log(`Đã ghi ${fromApi.length} chương trình từ API, giữ ${kept.length} mã khác.`);
