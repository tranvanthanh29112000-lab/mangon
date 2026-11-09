/* Mã Ngon – logic chính
 * - Đọc link sản phẩm khách dán, tìm shopId / itemId
 * - Lọc mã trong vouchers.json theo sản phẩm, loại mã, thời hạn
 * - Bảng hướng dẫn tạo lối tắt ra màn hình chính theo từng loại máy
 * Không gắn công cụ theo dõi nào, không gửi thông tin khách đi đâu.
 */
(function () {
  'use strict';

  var LABELS = {
    'toan-san': 'Toàn sàn',
    'freeship': 'Freeship',
    'shop': 'Mã shop',
    'danh-sach': 'Theo danh sách',
    'nganh-hang': 'Ngành hàng'
  };
  var ORDER = { 'shop': 0, 'danh-sach': 1, 'toan-san': 2, 'nganh-hang': 3, 'freeship': 4 };
  var SHORT_HOSTS = ['shp.ee', 'vn.shp.ee', 's.shopee.vn', 'shope.ee'];
  var DISMISS_KEY = 'mangon-an-goi-y';
  var DISMISS_DAYS = 3;

  var state = { vouchers: [], settings: {}, filter: 'all', product: null };
  var $ = function (id) { return document.getElementById(id); };

  /* ---------- Tiện ích ---------- */
  function store(key, val) {
    try {
      if (val === undefined) return window.localStorage.getItem(key);
      window.localStorage.setItem(key, val);
    } catch (e) { return null; }
  }

  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.hidden = true; }, 2600);
  }

  function fmtMoney(n) {
    if (!n) return '0Đ';
    if (n >= 1000000) return (n / 1000000).toString().replace('.', ',') + ' triệu';
    if (n >= 1000) return Math.round(n / 1000) + 'K';
    return n + 'Đ';
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function hhmm(d) { return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function sameDay(a, b) { return a.toDateString() === b.toDateString(); }

  /* ---------- Đọc link sản phẩm ---------- */
  function extractUrl(text) {
    var m = String(text || '').match(/https?:\/\/[^\s"'<>]+/i);
    if (m) return m[0];
    m = String(text || '').match(/(?:[\w-]+\.)*(?:shopee\.vn|shp\.ee|shope\.ee)\/[^\s"'<>]*/i);
    return m ? 'https://' + m[0] : null;
  }

  function isShopHost(host) {
    host = host.toLowerCase();
    return host === 'shopee.vn' || /\.shopee\.vn$/.test(host) || SHORT_HOSTS.indexOf(host) !== -1;
  }

  function parseProduct(text) {
    var raw = extractUrl(text);
    if (!raw) return { error: 'empty' };
    var u;
    try { u = new URL(raw); } catch (e) { return { error: 'invalid' }; }
    if (!isShopHost(u.hostname)) return { error: 'host' };

    var path;
    try { path = decodeURIComponent(u.pathname); } catch (e) { path = u.pathname; }
    var m = path.match(/-i\.(\d+)\.(\d+)/) ||
            path.match(/\/product\/(\d+)\/(\d+)/) ||
            path.match(/\/opaanlp\/(\d+)\/(\d+)/) ||
            path.match(/^\/[^/]+\/(\d+)\/(\d+)\/?$/);
    var qs = u.searchParams;
    if (!m && qs.get('shopid') && qs.get('itemid')) m = [null, qs.get('shopid'), qs.get('itemid')];
    if (m) {
      // Dùng link sản phẩm dạng chuẩn: app Shopee trên iPhone mở được chắc chắn
      return { url: 'https://shopee.vn/product/' + m[1] + '/' + m[2], shopId: m[1], itemId: m[2] };
    }
    var host = u.hostname.toLowerCase();
    if (SHORT_HOSTS.indexOf(host) !== -1) return { url: u.href, short: true };
    var shopOnly = path.match(/^\/shop\/(\d+)/);
    if (shopOnly) return { url: u.href, shopId: shopOnly[1] };
    return { error: 'notproduct', url: u.href };
  }

  function resolveShort(url) {
    return fetch('/api/resolve?u=' + encodeURIComponent(url))
      .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
      .then(function (data) { return data && data.url ? parseProduct(data.url) : Promise.reject(); });
  }

  /* ---------- Trạng thái mã ---------- */
  function statusOf(v, now) {
    var start = v.batDau ? new Date(v.batDau) : null;
    var end = v.ketThuc ? new Date(v.ketThuc) : null;
    if (end && !isNaN(end) && end < now) return { state: 'het' };
    if (start && !isNaN(start) && start > now) {
      return { state: 'sap', label: sameDay(start, now) ? 'Mở lúc ' + hhmm(start) : 'Mở ngày ' + pad(start.getDate()) + '/' + pad(start.getMonth() + 1), soon: true };
    }
    if (v.khungGio) return { state: 'chay', label: v.khungGio };
    if (end && !isNaN(end)) {
      var ms = end - now;
      if (ms < 3 * 3600 * 1000) return { state: 'chay', label: 'Hết hạn ' + hhmm(end), soon: true };
      if (sameDay(end, now)) return { state: 'chay', label: 'Hết hạn ' + hhmm(end) };
      var days = Math.ceil(ms / 86400000);
      return { state: 'chay', label: days >= 7 ? 'Còn ' + Math.round(days / 7) + ' tuần' : 'Còn ' + days + ' ngày' };
    }
    return { state: 'chay', label: 'Đang chạy' };
  }

  function matchesProduct(v, p) {
    if (!p) return true;
    var t = v.loai;
    if (t === 'toan-san' || t === 'freeship' || t === 'nganh-hang') return true;
    if (t === 'shop') return !!(p.shopId && (v.shopIds || []).map(String).indexOf(String(p.shopId)) !== -1);
    if (t === 'danh-sach') return !!(p.itemId && (v.itemIds || []).map(String).indexOf(String(p.itemId)) !== -1);
    return false;
  }

  /* ---------- Hiển thị ---------- */
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function safeLink(href) {
    try {
      var u = new URL(href);
      return (u.protocol === 'https:' || u.protocol === 'http:') ? u.href : null;
    } catch (e) { return null; }
  }

  /* ---------- Bọc link affiliate ----------
   * Mọi link Shopee trên web được bọc bằng ID affiliate (caiDat.affiliateId),
   * theo dạng link affiliate Shopee hướng dẫn:
   * https://s.shopee.vn/an_redir?origin_link=...&affiliate_id=...&sub_id=...
   */
  function cleanSub(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40) || 'web';
  }

  function isAffLink(u) {
    var h = u.hostname.toLowerCase();
    if (u.pathname.indexOf('/an_redir') === 0) return true;
    // Link rút gọn đã tạo sẵn trong trang affiliate (s.shopee.vn/xxxx, shope.ee/xxxx)
    return (h === 's.shopee.vn' || h === 'shope.ee') && /^\/[A-Za-z0-9]+\/?$/.test(u.pathname);
  }

  function affLink(href, sub, forceWrap) {
    var safe = safeLink(href);
    if (!safe) return null;
    var id = state.settings && state.settings.affiliateId;
    var u = new URL(safe);
    if (!id || !isShopHost(u.hostname)) return safe;
    if (!forceWrap && isAffLink(u)) return safe;
    if (u.pathname.indexOf('/an_redir') === 0) return safe;
    return 'https://s.shopee.vn/an_redir?origin_link=' + encodeURIComponent(safe) +
      '&affiliate_id=' + encodeURIComponent(String(id)) +
      '&sub_id=mangon-' + cleanSub(sub);
  }

  function cardFor(v, st, isMatch) {
    var card = el('article', 'card' + (isMatch ? ' is-match' : ''));
    var top = el('div', 'card__top');
    top.appendChild(el('span', 'tag', LABELS[v.loai] || 'Mã giảm'));
    top.appendChild(el('span', 'card__time' + (st.soon ? ' is-soon' : ''), st.label || ''));
    card.appendChild(top);

    card.appendChild(el('p', 'card__title', v.tieuDe || 'Mã giảm giá'));
    var cond = v.dieuKien || '';
    if (v.donToiThieu != null) cond = (cond ? cond + ' · ' : '') + 'Đơn từ ' + fmtMoney(Number(v.donToiThieu));
    if (cond) card.appendChild(el('p', 'card__cond', cond));
    if (v.ghiChu) card.appendChild(el('p', 'card__note', v.ghiChu));

    if (v.ma) {
      var codeRow = el('div', 'card__code');
      codeRow.appendChild(el('span', null, v.ma));
      var copy = el('button', null, 'Sao chép');
      copy.type = 'button';
      copy.setAttribute('aria-label', 'Sao chép mã ' + v.ma);
      copy.addEventListener('click', function () { copyText(v.ma); });
      codeRow.appendChild(copy);
      card.appendChild(codeRow);
    }

    var actions = el('div', 'card__actions');
    var href = null;
    var label = st.state === 'sap' ? 'Lưu trước' : 'Lưu mã';
    var fallback = state.settings.linkNutCoDinh || state.settings.linkMacDinh;
    if (v.link) {
      href = affLink(v.link, v.id);
    } else if (v.ma && fallback) {
      // Mã nhập tay: sao chép mã rồi mở app qua link affiliate
      href = affLink(fallback, v.id);
      label = 'Sao chép mã & mở app';
    } else if (fallback) {
      // Mã dạng banner chưa có link riêng: mở app qua link affiliate để khách lưu mã
      href = affLink(fallback, v.id);
      label = 'Mở app lưu mã';
    }
    var btn;
    if (href) {
      btn = el('a', 'btn btn--primary', label);
      btn.href = href;
      btn.target = '_blank';
      btn.rel = 'noopener';
      btn.addEventListener('click', function () {
        if (v.ma) copyText(v.ma, true);
        markSaved();
      });
    } else {
      btn = el('span', 'btn', 'Đang cập nhật link');
      btn.setAttribute('aria-disabled', 'true');
    }
    actions.appendChild(btn);
    actions.appendChild(shareRow(v));
    card.appendChild(actions);
    card.id = 'ma-' + cleanSub(v.id);
    return card;
  }

  /* ---------- Chia sẻ qua Messenger / Zalo ----------
   * Chia sẻ link của Mã Ngon (kèm ?ma=...), bạn bè mở ra sẽ thấy đúng mã đó
   * và bấm "Lưu mã" vẫn đi qua link affiliate của chủ web.
   */
  var SITE = 'https://mangonvn.vercel.app/';
  function shareUrlFor(v) { return SITE + (v ? '?ma=' + encodeURIComponent(v.id) : ''); }
  function shareTextFor(v) {
    if (!v) return 'Mã Ngon: dán link sản phẩm là có mã giảm giá, lưu mã 1 chạm';
    var t = 'Mã ' + (v.tieuDe || 'giảm giá');
    if (v.dieuKien) t += ' ' + v.dieuKien.toLowerCase();
    return t + ' – lưu mã tại Mã Ngon';
  }

  function shareMessenger(v) {
    var url = shareUrlFor(v);
    if (isMobile) {
      window.location.href = 'fb-messenger://share/?link=' + encodeURIComponent(url);
    } else {
      window.open('https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(url), '_blank', 'noopener');
    }
  }

  function shareSheet(v, appName) {
    var url = shareUrlFor(v);
    var text = shareTextFor(v);
    if (navigator.share) {
      navigator.share({ title: 'Mã Ngon', text: text, url: url }).catch(function () {});
    } else {
      copyLink(text + ' ' + url, appName);
    }
  }

  function copyLink(text, appName) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        toast('Đã sao chép link' + (appName ? ', mở ' + appName + ' và dán để gửi' : ''));
      }, function () {});
    }
  }

  function iconSvg(path) {
    var s = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + path + '</svg>';
    var span = document.createElement('span');
    span.innerHTML = s; // chuỗi cố định trong code, không có dữ liệu bên ngoài
    return span.firstChild;
  }

  function shareRow(v) {
    var row = el('div', 'share');
    row.appendChild(el('span', 'share__label', 'Gửi bạn bè:'));
    var mess = el('button', 'share__btn share__btn--mess');
    mess.type = 'button';
    mess.setAttribute('aria-label', 'Gửi mã ' + (v.tieuDe || '') + ' qua Messenger');
    mess.appendChild(iconSvg('<path d="M12 3C7 3 3 6.7 3 11.3c0 2.5 1.2 4.7 3.1 6.2V21l2.9-1.6c.9.3 1.9.4 3 .4 5 0 9-3.7 9-8.3S17 3 12 3z"/><path d="m7.5 13.5 3-3 2.5 2 3.5-3.5"/>'));
    mess.appendChild(el('span', null, 'Messenger'));
    mess.addEventListener('click', function () { shareMessenger(v); });
    var zalo = el('button', 'share__btn share__btn--zalo');
    zalo.type = 'button';
    zalo.setAttribute('aria-label', 'Gửi mã ' + (v.tieuDe || '') + ' qua Zalo');
    zalo.appendChild(iconSvg('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 8h6l-6 6h6"/>'));
    zalo.appendChild(el('span', null, 'Zalo'));
    zalo.addEventListener('click', function () { shareSheet(v, 'Zalo'); });
    row.appendChild(mess);
    row.appendChild(zalo);
    return row;
  }

  function highlightShared() {
    var id;
    try { id = new URLSearchParams(location.search).get('ma'); } catch (e) { id = null; }
    if (!id) return;
    var card = document.getElementById('ma-' + cleanSub(id));
    if (!card) return;
    card.classList.add('is-shared');
    setTimeout(function () { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 300);
  }

  function render() {
    var grid = $('voucher-grid');
    var now = new Date();
    var p = state.product;
    var list = state.vouchers
      .map(function (v) { return { v: v, st: statusOf(v, now) }; })
      .filter(function (x) { return x.st.state !== 'het'; })
      .filter(function (x) { return state.filter === 'all' || x.v.loai === state.filter; })
      .filter(function (x) { return matchesProduct(x.v, p); });

    list.sort(function (a, b) {
      if ((a.st.state === 'sap') !== (b.st.state === 'sap')) return a.st.state === 'sap' ? 1 : -1;
      return (ORDER[a.v.loai] || 9) - (ORDER[b.v.loai] || 9);
    });

    grid.textContent = '';
    list.forEach(function (x) {
      var exact = !!p && (x.v.loai === 'shop' || x.v.loai === 'danh-sach');
      grid.appendChild(cardFor(x.v, x.st, exact));
    });
    $('empty-msg').hidden = list.length > 0;
    $('list-title').textContent = p ? 'Mã dùng được cho món này' : 'Mã đang chạy hôm nay';

    if (p) {
      var exactCount = list.filter(function (x) { return x.v.loai === 'shop' || x.v.loai === 'danh-sach'; }).length;
      var txt = 'Tìm thấy ' + list.length + ' mã có thể dùng';
      if (exactCount) txt += ', trong đó ' + exactCount + ' mã riêng của shop hoặc sản phẩm này';
      txt += '. Có thể dùng cùng lúc 1 mã sàn, 1 mã shop và 1 mã freeship.';
      if (p.unknown) txt += ' Bấm “Lưu mã” ở dưới trước, rồi quay lại sản phẩm để mua.';
      $('product-summary').textContent = txt;
    }
  }

  /* ---------- Tìm theo link ---------- */
  function showMsg(text, isError) {
    var m = $('search-msg');
    m.textContent = text || '';
    m.classList.toggle('is-error', !!isError);
  }

  function applyProduct(p) {
    state.product = p;
    var box = $('product-result');
    box.hidden = false;
    $('product-title').textContent = p.itemId ? 'Sản phẩm mã số ' + p.itemId : 'Sản phẩm của shop mã số ' + p.shopId;
    $('buy-link').href = affLink(p.url, 'sanpham', true) || p.url;
    showMsg('');
    render();
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function onSearch(e) {
    e.preventDefault();
    var text = $('link-input').value;
    var p = parseProduct(text);
    if (p.error === 'empty') return showMsg('Bạn dán link sản phẩm vào ô trên nhé.', true);
    if (p.error === 'invalid' || p.error === 'host') return showMsg('Link này không đúng. Hãy dán link sản phẩm sao chép từ app mua sắm.', true);
    if (p.error === 'notproduct') return showMsg('Đây chưa phải link của một sản phẩm. Mở đúng món cần mua rồi sao chép lại link nhé.', true);

    if (p.short) {
      showMsg('Đang đọc link…');
      resolveShort(p.url).then(function (r) {
        if (r && !r.error && (r.itemId || r.shopId)) applyProduct(r);
        else fallbackShort(p.url);
      }).catch(function () { fallbackShort(p.url); });
      return;
    }
    applyProduct(p);
  }

  function submitSearch() { onSearch({ preventDefault: function () {} }); }

  function fallbackShort(url) {
    // Không đọc được link rút gọn: vẫn hiện mã chung. Nút mở sản phẩm dùng nguyên link khách dán,
    // vì bọc link rút gọn vào affiliate làm app Shopee trên iPhone báo "không tìm thấy trang".
    // Khách bấm "Lưu mã" (link affiliate) trước khi mua thì vẫn được tính.
    state.product = { url: url, shopId: null, itemId: null, unknown: true };
    $('product-result').hidden = false;
    $('product-title').textContent = 'Đã nhận link sản phẩm';
    $('buy-link').href = safeLink(url) || '#';
    showMsg('');
    render();
    $('product-result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function clearProduct() {
    state.product = null;
    $('product-result').hidden = true;
    $('link-input').value = '';
    showMsg('');
    render();
    $('link-input').focus();
  }

  function copyText(text, quiet) {
    var done = function () { if (!quiet) toast('Đã sao chép mã ' + text); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () {});
    }
  }

  /* ---------- Lọc ---------- */
  function setFilter(f) {
    state.filter = f;
    document.querySelectorAll('.chip').forEach(function (c) {
      var on = c.getAttribute('data-filter') === f;
      c.classList.toggle('is-on', on);
      c.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    render();
  }

  /* ---------- Lối tắt ra màn hình chính ---------- */
  var deferredPrompt = null;
  var ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
  var isIOS = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  var isAndroid = /Android/i.test(ua);
  var isInApp = /FBAN|FBAV|FB_IAB|Instagram|Zalo|TikTok|musical_ly|Bytedance|BytedanceWebview|Line\//i.test(ua);
  var isMobile = isIOS || isAndroid;

  function isStandalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  }

  function fillSteps() {
    var box = $('sheet-steps');
    var primary = $('install-primary');
    var id;
    if (isInApp) id = 'tpl-inapp';
    else if (isIOS) id = 'tpl-ios';
    else if (deferredPrompt) id = 'tpl-android';
    else if (isAndroid) id = 'tpl-android-manual';
    else id = 'tpl-desktop';

    box.textContent = '';
    box.appendChild(document.getElementById(id).content.cloneNode(true));
    if (deferredPrompt && !isInApp) {
      primary.hidden = false;
      primary.textContent = 'Thêm lối tắt';
    } else {
      primary.hidden = false;
      primary.textContent = 'Đã hiểu';
    }
  }

  var lastFocus = null;
  function openSheet() {
    if (isStandalone()) return;
    fillSteps();
    lastFocus = document.activeElement;
    $('install-sheet').hidden = false;
    document.body.style.overflow = 'hidden';
    setTimeout(function () { $('install-primary').focus(); }, 50);
  }

  function closeSheet(remember) {
    $('install-sheet').hidden = true;
    document.body.style.overflow = '';
    if (remember) store(DISMISS_KEY, String(Date.now()));
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function recentlyDismissed() {
    var t = Number(store(DISMISS_KEY) || 0);
    return t && (Date.now() - t) < DISMISS_DAYS * 86400000;
  }

  function maybeAutoOpen() {
    if (!isMobile || isStandalone() || recentlyDismissed()) return;
    openSheet();
  }

  var savedOnce = false;
  function markSaved() {
    if (savedOnce) return;
    savedOnce = true;
    // Khi khách quay lại trang sau khi lưu mã, gợi ý thêm lối tắt
    document.addEventListener('visibilitychange', function onVis() {
      if (document.visibilityState === 'visible') {
        document.removeEventListener('visibilitychange', onVis);
        setTimeout(maybeAutoOpen, 600);
      }
    });
  }

  function onPrimary() {
    if (deferredPrompt && !isInApp) {
      var p = deferredPrompt;
      deferredPrompt = null;
      p.prompt();
      p.userChoice.then(function (c) {
        closeSheet(c && c.outcome !== 'accepted');
        if (c && c.outcome === 'accepted') toast('Đã thêm Mã Ngon ra màn hình chính');
      }).catch(function () { closeSheet(false); });
    } else {
      closeSheet(true);
    }
  }

  /* ---------- Khởi động ---------- */
  function loadVouchers() {
    return fetch('/vouchers.json', { cache: 'no-cache' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        state.settings = data.caiDat || {};
        state.vouchers = Array.isArray(data.danhSachMa) ? data.danhSachMa : [];
        var s = state.settings;
        if (s.capNhatLuc) $('updated-at').textContent = 'Cập nhật lúc ' + s.capNhatLuc;
        var group = s.nhomSanSale && safeLink(s.nhomSanSale);
        if (group) { $('group-link').href = group; $('group-link').hidden = false; }
        var report = (s.baoMaLoi && safeLink(s.baoMaLoi)) || group;
        if (report) $('report-link').href = report;
        else $('report-link').parentElement.hidden = true;
        var fixedHref = affLink(s.linkNutCoDinh || s.linkMacDinh || 'https://shopee.vn/', 'nutcodinh');
        if (fixedHref) $('open-shopee').href = fixedHref;
        render();
        highlightShared();
      })
      .catch(function () {
        $('empty-msg').hidden = false;
        $('empty-msg').textContent = 'Chưa tải được danh sách mã. Kiểm tra mạng rồi tải lại trang nhé.';
      });
  }

  function init() {
    $('search-form').addEventListener('submit', onSearch);
    $('clear-product').addEventListener('click', clearProduct);

    document.querySelectorAll('.chip').forEach(function (c) {
      c.addEventListener('click', function () { setFilter(c.getAttribute('data-filter')); });
    });
    document.querySelectorAll('[data-filter-link]').forEach(function (a) {
      a.addEventListener('click', function () { setFilter(a.getAttribute('data-filter-link')); closeMenu(); });
    });

    var menuBtn = document.querySelector('.menu-btn');
    var nav = $('main-nav');
    function closeMenu() { nav.classList.remove('is-open'); menuBtn.setAttribute('aria-expanded', 'false'); }
    menuBtn.addEventListener('click', function () {
      var open = !nav.classList.contains('is-open');
      nav.classList.toggle('is-open', open);
      menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    nav.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', closeMenu); });

    if (navigator.clipboard && navigator.clipboard.readText) {
      var paste = $('paste-btn');
      paste.hidden = false;
      paste.addEventListener('click', function () {
        var manual = function () {
          $('link-input').focus();
          toast('Chạm giữ vào ô trống rồi chọn “Dán”');
        };
        try {
          navigator.clipboard.readText().then(function (t) {
            if (t && t.trim()) { $('link-input').value = t.trim(); submitSearch(); }
            else manual();
          }).catch(manual);
        } catch (e) { manual(); }
      });
    }
    // Dán bằng tay (chạm giữ → Dán, hay gặp trên iPhone) thì tự tìm luôn, không cần bấm "Tìm mã"
    $('link-input').addEventListener('paste', function () {
      setTimeout(function () { if ($('link-input').value.trim()) submitSearch(); }, 60);
    });

    var fixed = $('open-shopee');
    if (fixed) {
      fixed.addEventListener('click', function () { markSaved(); });
    }
    var shareSite = $('share-site');
    if (shareSite) shareSite.addEventListener('click', function () { shareSheet(null, 'Zalo'); });

    // Lối tắt
    if (!isStandalone()) {
      var openBtn = $('install-open');
      openBtn.hidden = false;
      openBtn.addEventListener('click', function () { closeMenu(); openSheet(); });
    }
    document.querySelectorAll('[data-close-sheet]').forEach(function (b) {
      b.addEventListener('click', function () { closeSheet(true); });
    });
    $('install-later').addEventListener('click', function () { closeSheet(true); });
    $('install-primary').addEventListener('click', onPrimary);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !$('install-sheet').hidden) closeSheet(true);
    });

    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferredPrompt = e;
    });
    window.addEventListener('appinstalled', function () {
      $('install-open').hidden = true;
      closeSheet(false);
    });

    // Tự gợi ý sau 20 giây trên điện thoại (tối đa 3 ngày một lần)
    setTimeout(maybeAutoOpen, 20000);

    // Mở web kèm ?link=... (ví dụ chia sẻ từ app khác) thì tự tìm luôn
    try {
      var params = new URLSearchParams(location.search);
      var shared = params.get('link') || params.get('text') || params.get('url');
      if (shared) {
        $('link-input').value = shared;
        loadVouchers().then(function () { onSearch(new Event('submit')); });
      } else {
        loadVouchers();
      }
    } catch (e) { loadVouchers(); }

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('/sw.js').catch(function () {});
      });
    }
  }

  // Cho phép chạy thử phần đọc link bằng Node
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { parseProduct: parseProduct, statusOf: statusOf, matchesProduct: matchesProduct };
    return;
  }
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
})();
