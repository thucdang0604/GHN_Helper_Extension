# Kế hoạch nâng cấp hiệu suất
### Mục tiêu: tool xử lý dữ liệu lớn mượt hơn Excel — không giật khi lọc/pivot/vẽ biểu đồ

---

## Nguyên tắc chỉ đạo

1. **Không viết lại từ đầu.** Nâng cấp từng lớp một, giữ giao diện và tính năng hiện tại chạy được xuyên suốt quá trình.
2. **Đo trước khi tối ưu, đo sau khi tối ưu.** Không tối ưu theo cảm giác — mỗi giai đoạn phải có con số chứng minh.
3. **Ưu tiên theo tác động cảm nhận được**, không theo độ khó kỹ thuật. Web Worker (giai đoạn 2) tác động đến trải nghiệm nhiều hơn columnar storage (giai đoạn 1), nhưng giai đoạn 1 là nền tảng bắt buộc phải làm trước.

---

## Giai đoạn 0 — Thiết lập bộ đo trước khi động vào code

Làm cái này **đầu tiên**, trước khi sửa bất cứ dòng nào. Không có bộ đo thì mọi optimization sau này chỉ là phỏng đoán.

**Việc cần làm:**
- Tạo 3 bộ dữ liệu test: 10.000 / 100.000 / 500.000 dòng, 10-15 cột (trộn số/chữ/ngày), có thể sinh bằng script nhỏ hoặc nhân bản dữ liệu thật lên
- Bọc các thao tác chính bằng `console.time()` / `console.timeEnd()`: parse file, tính pivot, tính filter, render bảng, vẽ biểu đồ
- Ghi lại baseline hiện tại cho cả 3 bộ dữ liệu vào 1 file `benchmark.md` — đây là số để so sánh mọi giai đoạn sau

**Công cụ nên tìm hiểu:**
- Chrome DevTools → tab **Performance** → record khi thao tác pivot/filter → xem chỗ nào "long task" (khối màu đỏ, >50ms)
- Chrome DevTools → tab **Memory** → chụp heap snapshot với từng cỡ dữ liệu để biết đang tốn bao nhiêu RAM

**Xong khi:** có bảng số liệu baseline rõ ràng, biết chính xác thao tác nào đang chậm nhất (thường sẽ là pivot và correlation matrix).

---

## Giai đoạn 1 — Chuyển từ Array-of-Objects sang Columnar Storage (Structure of Arrays)

### Vấn đề hiện tại
Dữ liệu đang lưu dạng:
```
rows = [
  { "Thiết bị": "IP11PRO", "Giá": 350000, "Ngày": "2026-01-05" },
  { "Thiết bị": "SAMSUNG", "Giá": 450000, "Ngày": "2026-01-06" },
  ...
]
```
Mỗi dòng là 1 object riêng biệt trong bộ nhớ, mỗi lần đọc `r["Giá"]` là 1 lượt tra cứu hash key. Với 100.000 dòng × 15 cột, đây là 1.5 triệu lượt tra cứu key mỗi lần quét toàn bộ dữ liệu.

### Thiết kế mới
```
table = {
  columns: ["Thiết bị", "Giá", "Ngày"],
  data: {
    "Thiết bị": ["IP11PRO", "SAMSUNG", ...]     // mảng string thường
    "Giá":      Float64Array([350000, 450000, ...])  // mảng số kiểu typed
    "Ngày":     Float64Array([epoch1, epoch2, ...])  // lưu timestamp, không lưu Date object
  },
  rowCount: 100000
}
```
Cột số dùng `Float64Array`/`Int32Array` thay vì mảng thường — CPU đọc liền một mạch trong bộ nhớ (memory locality) thay vì nhảy lung tung qua từng object.

### Việc cần nghiên cứu
- `TypedArray` (Float64Array, Int32Array) — cách khai báo, giới hạn, khi nào dùng loại nào
- Khái niệm **Structure of Arrays (SoA) vs Array of Structures (AoS)** — đây là tên chính thức của thay đổi này, tìm đọc để hiểu vì sao SoA nhanh hơn cho tác vụ aggregate
- Cách xử lý cột **text** — vẫn phải dùng mảng string thường, nhưng có thể cân nhắc **dictionary encoding** (map string → số nguyên) nếu cột có ít giá trị lặp lại nhiều (ví dụ cột "Dịch vụ" chỉ có 10-20 giá trị khác nhau lặp lại hàng nghìn lần) — tra thêm khái niệm này nếu muốn tối ưu sâu hơn

### Các hàm cần viết lại (theo thứ tự ưu tiên)
1. Hàm parse file (SheetJS → columnar) — điểm chuyển đổi trung tâm
2. Hàm aggregate cho pivot — đây là nơi hưởng lợi nhiều nhất từ TypedArray
3. Hàm filter — trả về mảng index (`Uint32Array` chứa các vị trí dòng thỏa điều kiện) thay vì mảng object mới, tránh copy dữ liệu không cần thiết
4. Hàm tính correlation matrix — vốn đang là chỗ chậm nhất, hưởng lợi trực tiếp từ Float64Array

### Chiến lược tương thích ngược
Không cần sửa toàn bộ 1 lúc. Viết 1 lớp "adapter" nhỏ: hàm `getRow(index)` trả về object `{col: value}` như cũ, để các phần UI cũ (bảng, xuất Excel) vẫn hoạt động trong lúc bạn dần chuyển các hàm tính toán nặng sang dùng trực tiếp columnar data.

**Xong khi:** benchmark giai đoạn 0 chạy lại trên cấu trúc mới, thời gian pivot/correlation giảm rõ rệt (kỳ vọng 3-8 lần tùy dữ liệu).

---

## Giai đoạn 2 — Đưa tính toán nặng ra Web Worker

### Vấn đề hiện tại
Toàn bộ tính toán chạy trên main thread — luồng duy nhất cũng đang vẽ giao diện. Khi pivot chạy 1-2 giây, cả trang **đứng hình**: không kéo được, không click được, không gõ được.

### Kiến trúc hướng tới
```
Main Thread (UI)              Web Worker (tính toán)
─────────────────             ───────────────────────
Người dùng bấm nút     ──►     Nhận lệnh + dữ liệu
Hiện loading spinner            Chạy pivot/filter/correlation
Vẫn kéo được, click được       (không đụng gì tới DOM)
Nhận kết quả          ◄──     Trả kết quả về
Vẽ lại bảng/biểu đồ
```

### Việc cần nghiên cứu
- `new Worker()` — cách tạo worker từ file JS riêng, hoặc tạo **inline worker** bằng `Blob` + `URL.createObjectURL` (hữu ích vì file này đang là single-file HTML, không có file `.js` riêng để trỏ tới)
- `postMessage()` / `onmessage` — cơ chế giao tiếp 2 chiều giữa main thread và worker
- **Transferable Objects** — đây là phần quan trọng nhất cần đọc kỹ: khi gửi `TypedArray` qua `postMessage()` với tham số transfer list, dữ liệu được **chuyển quyền sở hữu** thay vì copy — gần như tức thời dù dữ liệu lớn. Đây chính là lý do phải làm Giai đoạn 1 (columnar/TypedArray) trước Giai đoạn 2
- Giới hạn: Worker không truy cập được DOM — mọi thao tác vẽ giao diện vẫn phải ở main thread, worker chỉ tính toán thuần túy rồi trả số liệu về

### Xác định việc gì đưa vào worker
Đưa vào worker: parse file lớn, tính pivot, tính correlation, dedup, aggregate cho biểu đồ.
Giữ ở main thread: mọi thứ vẽ DOM/canvas (Chart.js render, cập nhật bảng HTML) — vì đây là việc bắt buộc phải chạy ở main thread.

**Xong khi:** thử nghiệm với bộ dữ liệu 500.000 dòng, trong lúc pivot đang tính, vẫn kéo được scrollbar, vẫn bấm được nút khác mà không bị "đứng".

---

## Giai đoạn 3 — Xử lý theo lô (chunking) + thanh tiến trình

### Vấn đề hiện tại
File lớn (vài chục MB) khi parse xong, cả trang trắng vài giây không có phản hồi gì, người dùng không biết đang chạy hay bị treo.

### Việc cần làm
- Sau khi có Worker (giai đoạn 2), worker gửi tin nhắn tiến trình định kỳ về main thread: `{type: "progress", percent: 42}` trong lúc đang parse/tính toán từng lô 10.000-50.000 dòng
- Main thread cập nhật thanh progress bar dựa trên tin nhắn nhận được
- Nếu chưa kịp làm Worker, có thể tạm dùng `setTimeout(fn, 0)` hoặc `requestIdleCallback()` để chia nhỏ vòng lặp xử lý thành từng lô, nhường thời gian cho trình duyệt vẽ lại UI giữa các lô — đây là giải pháp tạm, không mạnh bằng Worker nhưng dễ làm trước

### Việc cần nghiên cứu
- `requestIdleCallback()` — chạy code khi trình duyệt rảnh, tránh chặn frame vẽ
- Cách thiết kế "chunked loop": xử lý N dòng, `await` một nhịp nghỉ, xử lý tiếp N dòng kế — tìm từ khóa **"cooperative scheduling JavaScript"** hoặc **"yield to main thread"**

**Xong khi:** mở file 50MB+, người dùng luôn thấy phản hồi trực quan (progress bar chạy), không có khoảng trắng vô cảm nào quá 200-300ms.

---

## Giai đoạn 4 — Virtual scrolling cho bảng dữ liệu

### Vấn đề hiện tại
Bảng dữ liệu hiện phân trang (15-20 dòng/trang) nên phần này thực ra **đã ổn**. Nhưng nếu sau này muốn cho phép cuộn liên tục (infinite scroll) thay vì bấm "trang sau", cần kỹ thuật này để tránh render hàng chục nghìn `<tr>` cùng lúc — vì DOM là thứ chậm nhất trong toàn bộ hệ thống, chậm hơn cả JavaScript tính toán thuần túy.

### Khái niệm cốt lõi
Chỉ render các dòng **đang nằm trong khung nhìn** (viewport) + một khoảng đệm nhỏ phía trên/dưới. Khi cuộn, tính lại dòng nào cần hiện, xóa dòng cũ không còn trong khung nhìn, chèn dòng mới — DOM luôn chỉ giữ vài chục phần tử bất kể bảng có bao nhiêu dòng.

### Việc cần nghiên cứu
- Từ khóa: **"virtual scrolling"**, **"windowing"** — đây là kỹ thuật đứng sau các thư viện như `react-window`, `TanStack Virtual` (không nhất thiết phải dùng thư viện, có thể tự viết bản đơn giản bằng vanilla JS vì file đang không dùng framework)
- Cách tính: `scrollTop`, chiều cao mỗi dòng cố định → suy ra index dòng đầu/cuối cần hiện

**Xong khi (nếu triển khai):** cuộn mượt 60fps qua bảng 500.000 dòng mà không giật, RAM không tăng theo số dòng cuộn qua.

*Lưu ý: giai đoạn này có thể bỏ qua nếu giữ nguyên cơ chế phân trang hiện tại — phân trang vốn đã giải quyết được vấn đề DOM, chỉ cần thiết nếu muốn nâng cấp UX sang dạng cuộn liên tục.*

---

## Giai đoạn 5 — Đo lại và xác nhận

Chạy lại đúng bộ benchmark từ Giai đoạn 0 trên 3 cỡ dữ liệu (10k/100k/500k), so sánh:

| Thao tác | Baseline (trước) | Sau giai đoạn 1+2 | Mục tiêu |
|---|---|---|---|
| Parse file 100k dòng | ghi số đo được | | giảm ≥50% |
| Tính pivot 100k dòng | ghi số đo được | | giảm ≥70% |
| Correlation matrix | ghi số đo được | | giảm ≥70% |
| UI có bị đứng khi tính? | Có | | Không |
| RAM dùng cho 500k dòng | ghi số đo được | | giảm ≥30% |

Không có con số ở cột "Baseline" thì không thể điền cột "Sau" — quay lại nhắc Giai đoạn 0 là bắt buộc làm trước tiên.

---

## Lộ trình gợi ý

```
Giai đoạn 0  (đo lường)                    → làm trước tiên, bắt buộc
Giai đoạn 1  (columnar storage)            → nền tảng, làm trước Giai đoạn 2
Giai đoạn 2  (Web Worker)                  → tác động cảm nhận được rõ nhất
Giai đoạn 3  (chunking + progress)         → làm song song hoặc sau Giai đoạn 2
Giai đoạn 4  (virtual scroll)              → tùy chọn, chỉ cần nếu đổi sang cuộn liên tục
Giai đoạn 5  (đo lại, xác nhận)            → làm sau mỗi giai đoạn lớn, không chỉ ở cuối
```

---

## Giới hạn cần chấp nhận, dù tối ưu hết mức

- Bộ nhớ 1 tab trình duyệt vẫn hữu hạn (thường 2-4GB tùy máy/trình duyệt) — vài triệu dòng vẫn có thể chạm trần
- Đây vẫn không phải database — không index, không lưu ổ cứng, mỗi lần mở lại phải parse lại từ đầu (có thể cân nhắc cache bằng IndexedDB nếu muốn xử lý luôn vấn đề này, nhưng đó là một đề xuất tách riêng ngoài phạm vi kế hoạch hiệu suất này)
- So với engine chuyên dụng (Power BI's VertiPaq, DuckDB-WASM) viết tối ưu ở tầng thấp hơn nhiều — tool này sau khi nâng cấp sẽ mượt hơn Excel rõ rệt ở quy mô vài trăm nghìn dòng, nhưng khó đuổi kịp các engine đó ở quy mô hàng chục triệu dòng

---

## Từ khóa tra cứu tổng hợp (để tiện tìm tài liệu)

`TypedArray` · `Structure of Arrays vs Array of Structures` · `Web Worker transferable objects` · `postMessage zero-copy` · `requestIdleCallback` · `cooperative scheduling JavaScript main thread` · `virtual scrolling windowing technique` · `Chrome DevTools Performance long tasks` · `dictionary encoding columnar data`
