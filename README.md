# Baodroid v0.8.0 — Một nút khởi tạo Android thật

Baodroid là ứng dụng Windows để chọn tối đa ba thư mục dự án, chạy bản xem trước và dùng ChatGPT/Codex hỗ trợ sửa mã nguồn trong từng dự án. Phiên bản này bổ sung nút **Khởi tạo Android SDK & AVD** trực tiếp trên từng màn hình.

## Quy trình

1. Mở Baodroid trên Windows → Thêm dự án / Chọn thư mục dự án → trỏ vào thư mục có package.json, pubspec.yaml hoặc Gradle settings.
2. Sau khi chọn dự án, Baodroid có thể mở **Web Preview** ngay với Vite/Expo. Đây **không phải Android native**.
3. Nhấn **Khởi tạo Android SDK & AVD** dưới thông tin dự án. Baodroid hiển thị hộp thoại xác nhận tải SDK/system image và **nếu cần** điều chỉnh thư mục dự án. Nên commit Git hoặc sao lưu trước khi chấp nhận.
4. Sau khi bạn chấp nhận, Baodroid tìm Android SDK/JDK hiện có, lấy **Android Command-line Tools từ Google**, cài platform-tools, emulator, Android API 35/36, system image Google APIs x86_64, chấp nhận SDK licenses theo lựa chọn đã xác nhận và tạo AVD `Baodroid_Preview_1` / `_2` / `_3` (tùy slot).
5. Với React/Vite, Baodroid dùng Capacitor để tạo Android WebView APK; với Expo như **CHƯƠNG**, sử dụng Expo prebuild để sinh thư mục Android native và build APK; với dự án Gradle/React Native/Flutter native sẵn có, dùng build tương ứng.
6. AVD được gán vào slot, Baodroid khởi động emulator, build + deploy APK và truyền ảnh màn hình Android thật qua ADB lên khung preview. Tương tác chạm/vuốt trực tiếp trên preview.
7. Với dự án có Web Preview, nhấn **Xem Web** để quay về kiểm thử nhanh bằng Vite/Expo.

## Các dự án đã đối chiếu từ GitHub

- **ReelTara** là dự án React + Vite. Nhấn nút sẽ thêm Capacitor và tạo thư mục `android/`. Bản Android dùng WebView của Capacitor và vẫn là ứng dụng Android có APK chạy trên emulator, **không trở thành React Native**.
- **CHƯƠNG** là Expo + React Native, chưa có thư mục Android trong repository. Expo prebuild tạo native Android; các plugin như IAP/ads có thể yêu cầu cấu hình riêng và có thể phát sinh lỗi build — lỗi sẽ được báo trong Nhật ký.
- **MiniZap** là Vite + Capacitor, Baodroid sử dụng cấu hình Capacitor hiện có và bổ sung Android platform nếu cần.

## Dung lượng & điều kiện bắt buộc

- **SDK cài dùng chung** cho tất cả dự án (ưu tiên SDK hiện có, nếu thiếu cài vào LocalAppData/Baodroid/Android/Sdk).
- **AVD riêng từng slot** để không đè cấu hình lẫn nhau.
- Cần Windows 10/11 x64; có Node.js/npm (Vite/Expo/Capacitor) và Java/JDK tương thích với SDK/Gradle. Nếu Android Studio đã được cài, Baodroid tự tìm JBR đi kèm. Nếu thiếu Java hoặc không bật ảo hóa phần cứng, quá trình có thể cần bạn bổ sung JDK/bật virtualization.
- Tải SDK và system image có thể tốn nhiều GB và mất thời gian theo mạng. Lần đầu build Gradle/Expo cũng có thể mất vài phút. **Không cam kết Android native cập nhật trong 0,5 giây**, đặc biệt với Gradle/Capacitor.
- Các bước cài npm có thể chạy script do dự án khai báo, nên chỉ dùng dự án bạn tin tưởng. Chỉnh sửa `android/`, `package.json`, `package-lock.json` và `capacitor.config.json` chỉ xảy ra sau khi xác nhận trong ứng dụng.
- Bản Expo có module native phải được kiểm thử thực tế trong Android Emulator; không thể đánh giá IAP, notifications, SDK quảng cáo bằng iframe Web Preview.

## AI Coding

ChatGPT/Codex vẫn có phần chat, model và undo riêng cho 3 dự án. Baodroid không điều khiển tab chatgpt.com; dùng Codex CLI có đăng nhập trình duyệt hoặc mã thiết bị, và chỉ chạy tác vụ trong workspace đã gắn. Việc chỉnh mã bằng AI vẫn phải được kiểm tra kỹ trước khi phát hành.

## Build source

```bash
npm install
npm test
npm run check
npm run dist:win
```

GitHub Actions build Windows x64, xuất bản release và `latest.yml` để nút **Kiểm tra bản vá** sử dụng.


## Bản vá v0.8.1 — Android chạy nhưng chưa tự mở ứng dụng

Trong v0.8.0, sau khi ReelTara/CHƯƠNG đã bật chế độ Android native, bước khởi động emulator nhận đúng dạng ứng dụng Capacitor/React Native, nhưng **build loop** lại lấy loại dự án gốc (web/expo-web). Điều này có thể khiến Gradle tìm sai thư mục và màn hình chỉ dừng ở Android launcher.

v0.8.1 dùng duy nhất `projectForSlot(slot)` cho cả khởi động và build: ReelTara web → Capacitor; CHƯƠNG Expo Web → React Native sau prebuild. Khi Android boot xong, Baodroid sẽ tự chạy Gradle, tìm APK, cài vào AVD và gửi lệnh mở ứng dụng. Giao diện hiển thị rõ **đang build APK / đang cài APK / build lỗi**. Khi build lỗi, bấm **Thử build & mở lại** (không cần cài SDK hoặc tạo AVD lần nữa). Nhật ký kỹ thuật lưu bước build/đường dẫn dự án chính xác.

Bản vá sửa workflow build/deploy nhưng vẫn cần kiểm thử thực tế với dự án trên máy Windows. Gradle lần đầu có thể lâu và có thể thất bại do Java/Gradle/plugin, không có cam kết chạy thành công với mọi dự án.
