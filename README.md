# MỞ MANG V2 · Phương án C

Bản nâng cấp V3, quy tắc SM-2, migration IndexedDB, cấu hình Gemini và cách khôi phục nằm trong [tài liệu V3](V3.md).

PWA cá nhân dùng Active Recall và SM-2, viết bằng HTML, CSS và JavaScript. Trang **Hôm nay** ưu tiên bài đến hạn, gợi ý một bài khám phá và hiển thị bài sâu hoặc tổng hợp theo ngày. Trang **Chuyên đề** có bốn chương, 12 bài sâu theo thứ tự, 24 bài khám phá, bốn bài tổng hợp và một bài tổng kết. Có thể mở bất kỳ bài nào trong lộ trình. Mốc 28 ngày bắt đầu khi bạn mở bài được gợi ý, đổi câu hoặc lưu lựa chọn chỉ ôn lần đầu.

Trong 36 khái niệm của kế hoạch có 5 bài trong nghề (13,9%). Thư viện có đủ 66 chủ đề gốc. Đề xuất mới từ AI xuất hiện trong khu vực bản nháp riêng để bạn đọc và kiểm tra. Tài liệu cho từng chủ đề chưa được kiểm chứng nguồn. Màn hình đối chiếu ghi rõ trạng thái này.

## Mở app

Mở terminal tại thư mục chứa `index.html`, chạy:

```powershell
python -m http.server 8080 --bind 127.0.0.1
```

Mở [http://localhost:8080/](http://localhost:8080/). Bấm **Bắt đầu học** hoặc chọn một bài trong **Chuyên đề**. Viết câu trả lời, bấm **Tự đánh giá**, chọn điểm 1–5 rồi lưu. Chọn **Tôi chưa biết** để đọc phần tham khảo. Lượt đọc này không tạo lịch ôn. Sau khi lưu, màn hình hoàn thành cho biết ngày ôn hoặc xác nhận đã lưu tổng hợp.

Có thể học và tự chấm offline sau lần tải đầu tiên. **Cài đặt → AI phản biện** dùng khóa Gemini/OpenAI của bạn nếu muốn AI góp ý. Điểm AI là đề xuất, điểm bạn chốt mới được ghi. Mặc định khóa lưu theo phiên trình duyệt. Chế độ ghi nhớ lưu khóa dạng đọc được trong localStorage. DevTools và tiện ích có quyền phù hợp có thể thấy khóa khi gọi API trực tiếp.

## Chuyển dữ liệu V1

Nếu V1 và V2 chạy trên cùng origin, dùng cùng trình duyệt và hồ sơ, V2 đọc tiến trình, lịch cũ, chủ đề tự tạo, thống kê và các mục nháp V1. Lần ghi đầu tiên chuyển sang bản ghi V2. Nếu đổi origin hoặc thiết bị, xuất backup ở bản cũ và nhập ở **Cài đặt** của V2. Backup do V1 xuất không có nháp. Trước khi đổi origin, có thể mở V2 lần đầu ngay tại origin cũ, rồi xuất backup V2 để chuyển cả nháp.

Backup V2 chứa tiến trình, nháp và tổng hợp. Xuất một bản riêng trước khi nhập thay thế. Nếu gặp cảnh báo hết dung lượng hay xung đột tab, giữ tab đang mở và xuất backup phần dữ liệu trong phiên. Mỗi bản ghi được ghi trong một lần và có revision để phát hiện tab cũ. LocalStorage vẫn không khóa hai tab cùng ghi đúng một thời điểm.

## Kiểm thử

```powershell
npm test
python -m pip install playwright
python -m playwright install chromium webkit
python tests/browser.py
python tests/browser.py https://doquoctan-514.github.io/mo-mang-app/
```

Bộ unit cần Node.js 18+. Bộ trình duyệt dùng localhost dưới đường dẫn `/mo-mang-app/` mặc định, hoặc URL HTTPS truyền ở cuối lệnh. Cả hai dùng hồ sơ trình duyệt tạm và API mock. Đặt `MO_MANG_SCREENSHOTS` trỏ tới thư mục đầu ra để lưu ảnh giao diện.

### Kết quả bàn giao

| Kiểm thử | Kết quả |
| --- | --- |
| Node.js | **20/20 PASS.** Giữ 16 ca kiểm thử V1 và thêm các ca dữ liệu lộ trình, nhịp 28 ngày, chọn bài, chế độ học, migration và backup. |
| Playwright giao diện | **10/10 PASS.** Chromium và WebKit ở 320×568, 360×780, 390×844, 430×932 và 1366×768. Mô phỏng vùng nhìn thu nhỏ khi textarea đang được focus. |
| Playwright luồng học | **PASS.** Khám phá ổn định qua reload; đọc đáp án, tự chấm, nộp lặp, học bài sâu ngoài thứ tự, tổng hợp, backup round-trip, offline và GitHub Pages subpath. |
| AI mock | **PASS.** 401, 429, 503, JSON sai, mất mạng, timeout 22 giây giữ bài viết; nhấp đúp gửi một request; chốt điểm thủ công và lưu đề xuất AI ở dạng nháp. |
| API thật và Android/iOS thật | Chưa xác minh. |

File runtime thay đổi gồm `index.html`, `styles.css`, `src/app.js`, `src/storage.js`, `src/scheduler.js`, `src/ai.js`, `sw.js`, `package.json` và trường trạng thái trong JSON lộ trình. Module mới là `src/curriculum.js`. Bộ kiểm thử thêm `tests/curriculum.test.js` và `tests/browser.py`, cập nhật `tests/storage.test.js`. Hai file cấu hình phát hành là `.nojekyll` và `.gitignore`. Xem thêm `READ_ME_FIRST_V2.md` để định vị bản bàn giao.

## GitHub Pages

[Mở website MỞ MANG](https://doquoctan-514.github.io/mo-mang-app/#home). Repo dùng **Settings → Pages → Source → GitHub Actions**. Workflow `.github/workflows/pages.yml` chạy unit test khi push lên `main` và chỉ xuất bản HTML, CSS, JavaScript, icon, manifest, service worker và JSON lộ trình. Giữ file backup và khóa API ngoài repo.

Khi cập nhật bằng Codex, mở thư mục chứa `index.html`, mô tả thay đổi và yêu cầu chạy `npm test`, kiểm tra diff, commit, push lên `main` rồi theo dõi workflow **Publish MỞ MANG**. Tăng phiên bản cache trong `sw.js` mỗi lần sửa một file trong app shell. Khi có bản mới, đóng các tab app cũ rồi mở lại để worker mới kích hoạt.

Trên Android Chrome, chọn **Install app** hoặc **Thêm vào màn hình chính**. Trên iOS Safari, dùng **Chia sẻ → Thêm vào màn hình chính**. Để chuyển tiến trình từ localhost, tự xuất backup từ localhost và nhập vào website HTTPS. Nhập API key trực tiếp trong **Cài đặt** nếu muốn dùng AI. [Hướng dẫn GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
