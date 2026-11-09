// Mở link rút gọn (s.shopee.vn, shp.ee…) để biết link sản phẩm gốc.
// Không lưu gì, không ghi lại thông tin của khách.
const SHORT_HOSTS = ['shp.ee', 'vn.shp.ee', 's.shopee.vn', 'shope.ee'];

function isShopHost(host) {
  host = host.toLowerCase();
  return host === 'shopee.vn' || host.endsWith('.shopee.vn') || SHORT_HOSTS.includes(host);
}

function hasProduct(url) {
  return /-i\.\d+\.\d+/.test(url) || /\/(?:product|opaanlp)\/\d+\/\d+/.test(url) ||
    (/[?&]shopid=\d+/i.test(url) && /[?&]itemid=\d+/i.test(url));
}

export default async function handler(req, res) {
  const raw = (req.query && req.query.u) || '';
  let current;
  try { current = new URL(String(raw)); } catch { return res.status(400).json({ error: 'invalid' }); }
  if (!SHORT_HOSTS.includes(current.hostname.toLowerCase())) return res.status(400).json({ error: 'host' });

  try {
    for (let i = 0; i < 6; i++) {
      const r = await fetch(current.href, {
        redirect: 'manual',
        headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' }
      });
      const loc = r.headers.get('location');
      if (loc) {
        const next = new URL(loc, current.href);
        if (!isShopHost(next.hostname) && !next.hostname.endsWith('shp.ee')) break;
        current = next;
        if (hasProduct(current.href)) break;
        continue;
      }
      if (!hasProduct(current.href)) {
        // Một số trang chuyển hướng bằng nội dung HTML
        const body = (await r.text()).slice(0, 200000);
        const m = body.match(/https?:\\?\/\\?\/(?:[\w-]+\.)*shopee\.vn[^"'\s<>]*(?:-i\.\d+\.\d+|\/(?:product|opaanlp)\/\d+\/\d+)[^"'\s<>]*/i);
        if (m) current = new URL(m[0].replace(/\\\//g, '/'));
      }
      break;
    }
  } catch {
    return res.status(502).json({ error: 'fetch' });
  }

  if (!hasProduct(current.href)) return res.status(404).json({ error: 'notfound' });
  res.setHeader('Cache-Control', 's-maxage=86400');
  return res.status(200).json({ url: current.href });
}
