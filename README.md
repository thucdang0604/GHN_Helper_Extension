# GHN Helper Pro

Hướng dẫn cài đặt tiện ích mở rộng — chỉ mất khoảng **2 phút**.

> 💡 Tiện ích này **chưa được đăng lên Chrome Web Store** nên cần bật chế độ Developer để cài. Đây là cách cài phổ biến cho các công cụ nội bộ và hoàn toàn an toàn.

## Các bước thực hiện

### 1. 📁 Giải nén thư mục tiện ích
Giải nén file `.zip` bạn nhận được ra một thư mục cố định trên máy tính. **Không xóa thư mục này sau khi cài** — Chrome cần nó để chạy tiện ích.

📂 `GHN-Helper-Pro/`
- `manifest.json`
- `popup.html`
- `popup.js`
- `content.js`
- `inject.js`
- `README.md` ← (file này)

### 2. 🔧 Mở trang quản lý Extension của Chrome
Mở Chrome, copy đường dẫn dưới đây dán vào thanh địa chỉ rồi nhấn `Enter`:
```text
chrome://extensions
```

### 3. 🛠️ Bật chế độ Developer
Ở góc trên bên phải trang Extensions, bật toggle **"Developer mode"** lên.
*(Sau khi bật, sẽ xuất hiện thêm 3 nút mới ở phía trên trang)*

### 4. 📂 Nhấn "Load unpacked" và chọn thư mục
Nhấn nút `Load unpacked` (vừa xuất hiện), sau đó chọn thư mục **GHN-Helper-Pro** mà bạn đã giải nén ở Bước 1.
> ⚠️ Chọn đúng thư mục chứa file `manifest.json`, không chọn file đơn lẻ.

### 5. ✅ Cài đặt hoàn tất!
Tiện ích **GHN Helper Pro** sẽ xuất hiện trong danh sách. Ghim nó vào thanh công cụ bằng cách nhấn icon 🧩 trên Chrome và ghim.

Mở trang **nhanh.ghn.vn**, click vào icon tiện ích và bật toggle **Đang BẬT** để bắt đầu sử dụng.

---

## 🚀 Tính năng của tiện ích

Dưới đây là các tính năng chính đã được tích hợp (hoạt động hoàn toàn tự động dưới nền):

- 📦 **Tự động đóng kiện (Auto Packing):** Phát hiện lỗi mã "innhom" (in từng nhóm) hoặc "inall" (in tự động toàn bộ theo thứ tự từ nhóm 1 đến hết), tự động cuộn đến đơn hàng tương ứng, hoàn tất đóng kiện, phát âm thanh báo hiệu và tự động bấm "In tem".
- 🗑️ **Xóa hàng loạt (Bulk Delete):** Thêm nút "Xóa Tất Cả" để thao tác xóa nhanh nhiều đơn hàng cùng lúc thông qua hộp kiểm (checkbox), đồng thời tự động mở khóa các hộp kiểm bị vô hiệu hóa.
- 👁️ **Ẩn nút tạo phiếu thu (Hide Receipt):** Tự động ẩn các nút "Tạo phiếu thu" trong danh sách giúp giao diện gọn gàng hơn và tránh bấm nhầm.
- 🔍 **Kiểm tra đơn hàng (Order Checker):** Hỗ trợ kiểm đếm kiện hàng "ĐH Chờ Trả" thông qua thao tác quét mã vạch, tự động đếm và phát âm thanh báo hiệu theo tiến độ quét.
- 🏷️ **Hiển thị kích thước & Phân loại đơn (Order Info):**
  - **Kích thước**: Hiển thị trực tiếp Size kiện hàng (DxRxC) ngay trên bảng danh sách.
  - **Phân loại**: Tự động gắn nhãn màu (Badge) phân biệt rõ: **Tiktok hoàn hàng** (Đỏ) / **Shopee hàng hoàn** (Cam) / **Shop** (Xám).
- 🔔 **Cảnh báo đủ kiện hàng (Package Alert):** Liên tục theo dõi tiến độ quét đơn. Tự động phát âm thanh thông báo "Thành công" khi hệ thống ghi nhận đã thu thập đủ tất cả các kiện hàng.
- ⚡ **Gán tất cả đơn (Bulk Assign):** Tự động thêm nút "Gán Tất Cả" vào popup phân bổ đơn lỗi giúp gán hàng loạt nhanh chóng.
- ⚡ **Auto Hoàn Tất Rã Kiện (Auto Unpack Complete):** Tự động so sánh số lượng đơn đã rã và tự động click "Hoàn tất rã kiện" kèm âm thanh Pikachu.
- 🛑 **Tự động đóng bảng thông báo (Auto Close Modal):** Chỉ áp dụng trên trang Rã kiện (`/lastmile/unpack`), tự động phát hiện và click nút "Đóng" khi bảng popup thông báo (như "Đơn hàng đã được rã...") xuất hiện, đồng thời tự động focus lại ô quét mã để không gián đoạn quá trình thao tác.
- ⚡ **Quét đơn tự động theo trạng thái (Auto Scan Status):** Áp dụng trên trang Kiểm ĐH về kho (`/lastmile/check-scan`), tự động quét và nhập hàng loạt các mã đơn theo nhóm trạng thái đã chọn (ĐH Đang Giao, ĐH Đang Trả, ĐH Chờ Trả,...). Có modal chọn trực quan, phím tắt `Alt + S`, nút nổi thao tác nhanh và thanh tiến trình quét thời gian thực kèm nút dừng lại bất cứ lúc nào.
- 💰 **Lấy giá đơn hàng Trip-Detail (Trip Price Collector):** Tự động cào cột "Phải thu" và "GTB-thu" trên trang chi tiết chuyến đi (`/lastmile/trip-detail/`) và gửi cập nhật sang Google Sheet.
- 📱 **Tra cứu Tên & SĐT Hàng Loạt (Bulk Receiver Info):** Tích hợp công cụ cho phép dán danh sách nhiều mã vận đơn cùng lúc, tự động gọi API `https://nhanh-api.ghn.vn/api/lastmile/order/search/receiver-info` để lấy Tên và SĐT người nhận, sau đó tự động điền vào đúng dòng tương ứng trên Google Sheet (hỗ trợ copy kết quả, xuất CSV, kiểm soát giãn cách request chống chặn IP).
- 🔄 **Tự động kiểm tra cập nhật:** Nút bấm tích hợp ngay trong Popup, tự động so sánh phiên bản với GitHub Releases và cung cấp link tải bản mới nhất (.zip).
- ⚙️ **Quản lý dạng Module:** Tất cả tính năng đều có thể bật/tắt (Toggle) độc lập theo ý muốn từ giao diện (Popup) của tiện ích.

---

## 🔄 Cách cập nhật khi có bản mới

1. **Cách 1 (Từ giao diện Extension)**: Mở icon extension trên thanh công cụ ➔ Bấm **🔄 Kiểm tra cập nhật** ➔ Nếu có bản mới, bấm **⚡ Tải bản cập nhật (.zip)** ➔ Giải nén đè vào thư mục extension ➔ Vào `edge://extensions` hoặc `chrome://extensions` bấm **Reload**.
2. **Cách 2 (File update.bat)**: Nhấp đúp chuột vào file `update.bat` trong thư mục extension để tự động kéo code mới nhất từ GitHub qua git.
3. **Cách 3 (Trực tiếp từ GitHub)**: Truy cập [GHN_Helper_Extension Releases](https://github.com/thucdang0604/GHN_Helper_Extension/releases/latest) để tải bản phát hành mới nhất.

---

## ❓ Câu hỏi thường gặp

- **LỖI**: Nếu tiện ích không chạy sau khi bật, hãy **F5 lại trang GHN** một lần để kết nối lại.
- **XÓA**: Muốn gỡ: vào `chrome://extensions` hoặc `edge://extensions`, nhấn Remove trên thẻ tiện ích.

---
*GHN Helper Pro · Phiên bản 1.2 · Kho mã nguồn: [thucdang0604/GHN_Helper_Extension](https://github.com/thucdang0604/GHN_Helper_Extension)*
