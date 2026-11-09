# Mã Ngon – mangonvn.vercel.app

Web app tìm mã giảm giá: khách dán link sản phẩm → hiện các mã dùng được → bấm "Lưu mã" là mở app mua sắm với mã đã lưu. Khách có thể thêm web ra màn hình chính như một app.

## Trong thư mục có gì

| File | Dùng để |
|---|---|
| `vouchers.json` | **Danh sách mã. Đây là file bạn sửa hằng ngày.** |
| `index.html`, `styles.css`, `app.js` | Giao diện và logic của web |
| `manifest.webmanifest`, `sw.js`, `icons/` | Phần "web app": biểu tượng, mở toàn màn hình, mở nhanh |
| `api/resolve.js` | Đọc link rút gọn (s.shopee.vn, shp.ee…) ra link sản phẩm |
| `api/go.js` | Đổi link sản phẩm thành link affiliate của bạn (khi có Open API) |
| `qr-mangon.png` | Mã QR mở web, dùng in ở shop hoặc chèn vào video |

## 1. Đưa web lên Vercel (làm 1 lần)

1. Tạo tài khoản **GitHub** (github.com) và **Vercel** (vercel.com), đăng nhập Vercel bằng GitHub.
2. Trên GitHub: tạo repository mới tên **mangon** → bấm "uploading an existing file" → kéo **toàn bộ file trong thư mục này** vào (giữ nguyên thư mục `api` và `icons`) → Commit.
3. Trên Vercel: **Add New → Project** → chọn repo `mangon` → **Deploy**. Không cần chỉnh gì thêm.
4. Nếu tên `mangon` còn trống, web sẽ ở **https://mangonvn.vercel.app**. Nếu đã có người dùng, vào Settings → Domains để đổi tên khác (ví dụ `mangon-vn.vercel.app`). Khi đó nhớ tạo lại mã QR với tên mới.

Từ đó, mỗi lần bạn sửa file trên GitHub, Vercel tự cập nhật web sau khoảng 1 phút.

## 2. Cập nhật mã mỗi ngày (sửa `vouchers.json`)

Mở `vouchers.json` trên GitHub → bấm biểu tượng bút chì để sửa → Commit.

Mỗi mã là một khối như sau:

```json
{
  "id": "toan-san-25",
  "loai": "toan-san",
  "tieuDe": "Giảm 25%",
  "dieuKien": "Tối đa 200K",
  "donToiThieu": 0,
  "khungGio": "Khung 12h",
  "ghiChu": "Số lượt có hạn",
  "ma": "",
  "link": "https://s.shopee.vn/xxxxx",
  "batDau": "2026-11-11T00:00:00+07:00",
  "ketThuc": "2026-11-11T23:59:00+07:00"
}
```

| Trường | Ý nghĩa |
|---|---|
| `id` | Tên riêng cho mã, viết không dấu, không trùng nhau |
| `loai` | Loại mã. Chọn 1 trong: `toan-san`, `freeship`, `shop`, `danh-sach`, `nganh-hang` |
| `tieuDe` | Dòng chữ to, ví dụ "Giảm 25%", "Freeship 50K" |
| `dieuKien` | Dòng mô tả, ví dụ "Tối đa 200K" |
| `donToiThieu` | Đơn tối thiểu, ghi số tiền (50000 = 50K). Bỏ trống thì không hiện |
| `khungGio` | Không bắt buộc. Ví dụ "Khung 0h" |
| `ghiChu` | Không bắt buộc. Dòng chữ nhỏ |
| `ma` | Nếu mã có chữ để nhập tay (ví dụ AFFNHSB), ghi vào đây. Mã dạng lưu banner thì để trống |
| `link` | **Link affiliate của bạn** cho mã đó (xem mục 3). Để trống thì nút hiện "Đang cập nhật link" |
| `batDau`, `ketThuc` | Thời gian mở và hết hạn. Hết hạn là web tự ẩn mã, không cần xoá |
| `shopIds` | Chỉ cho `loai: "shop"`. Danh sách mã số shop được áp, ví dụ `[123456789]` |
| `itemIds` | Chỉ cho `loai: "danh-sach"`. Danh sách mã số sản phẩm được áp |

**Mã số shop và mã số sản phẩm** nằm trong link sản phẩm: `shopee.vn/Ten-san-pham-i.123456789.987654321` thì shop là `123456789`, sản phẩm là `987654321`.

Phần `caiDat` ở đầu file:
- `capNhatLuc`: chữ "Cập nhật lúc…" hiện trên web.
- `nhomSanSale`: link nhóm Zalo hoặc Facebook. Điền vào thì menu hiện nút "Nhóm săn sale".
- `baoMaLoi`: link để khách báo mã lỗi (có thể dùng luôn link nhóm).

Lưu ý khi sửa JSON: chuỗi đặt trong ngoặc kép, các khối ngăn nhau bằng dấu phẩy, khối cuối cùng không có dấu phẩy. Nếu web không hiện mã sau khi sửa, gần như chắc chắn là thiếu hoặc thừa dấu phẩy.

## 3. Lấy link affiliate cho từng mã

1. Vào trang mã hoặc banner lưu mã trên sàn, sao chép link.
2. Vào **affiliate.shopee.vn** → công cụ tạo link (chuyển đổi link) → dán link vào → tạo link.
3. Dán link vừa tạo vào trường `link` của mã đó.

Khi khách bấm "Lưu mã" qua link của bạn, sàn ghi nhận khách đến từ bạn trong 7 ngày. Khách mua gì trong thời gian đó bạn đều có hoa hồng.

## 4. (Không bắt buộc) Tự đổi link sản phẩm sang link affiliate

Nút "Mở sản phẩm" đi qua `api/go`. Chưa cài gì thì nút mở link gốc. Khi có Open API:

1. Trong trang affiliate, vào mục **Open API**, lấy **App ID** và **Secret**.
2. Trên Vercel: Project → Settings → **Environment Variables**, thêm `SHOPEE_APP_ID` và `SHOPEE_SECRET` → Redeploy.

Phần gọi API được viết theo cách đăng nhập (chữ ký SHA256) mà Open API affiliate đang dùng. Nếu nút vẫn mở link gốc sau khi cài, có thể sàn đã đổi cách gọi, gửi lại cho Claude để sửa.

## Quyền riêng tư

Web không có đăng nhập, không gắn công cụ thống kê hay theo dõi nào, không lưu thông tin khách. Thứ duy nhất lưu trên máy khách là lần cuối khách bấm "Để sau" ở bảng gợi ý thêm lối tắt (để không hỏi lại liên tục). Nếu sau này muốn gắn công cụ thống kê, cần sửa lại các câu "không thu thập thông tin" trên web cho đúng.
