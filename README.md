# Baodroid — Android Preview Hub

**Baodroid** là ứng dụng Windows chạy local, cho phép quản lý **tối đa 3 dự án Android** và kết nối từng dự án với **một Android Virtual Device (AVD)** độc lập. Dự án được chỉnh sửa trực tiếp trong **VS Code**, Baodroid chỉ theo dõi thư mục đã liên kết; không tải mã nguồn lên dịch vụ bên ngoài.

![Build](https://github.com/techzoneadapter-droid/baodroid/actions/workflows/windows.yml/badge.svg)

## Chức năng phiên bản 0.2.0

**Bản UX/UI 0.2.0:** Có thể thu gọn độc lập thanh điều hướng trái và bảng Build/Settings phải, ẩn/hiện danh sách dự án để ưu tiên màn hình Android, phóng lớn riêng máy 1/2/3, đặt zoom 75–150%, trở về cả 3 máy bằng phím Escape. Trên máy đang chạy có thao tác Home, Back, Xoay, và chụp PNG lưu ra ổ cứng. Nút kiểm tra môi trường báo tình trạng ADB, AVD, VS Code và Flutter. VS Code được tìm bằng đường dẫn cài đặt Windows tiêu chuẩn thay vì phụ thuộc CLI `code` trong PATH.


- Giao diện desktop tối, ba khung điện thoại song song; chạy Android Emulator headless và hiển thị ảnh chụp màn hình qua ADB; click/vuốt ngay trên màn hình xem trước.
- Liên kết **tối đa ba** dự án **Android Gradle (Kotlin/Java)** hoặc **Flutter**; mỗi AVD và mỗi dự án được gán duy nhất cho một vị trí.
- Phát hiện thay đổi mã nguồn qua `chokidar` (debounce khoảng 220 ms). Dự án Android Gradle tự incremental build, cài APK debug qua `adb install -r` và mở ứng dụng. Flutter dùng `flutter run` + lệnh hot reload.
- Build/deploy/status và nhật ký theo từng máy ảo. Có Start, Stop, Reload; mở thư mục dự án trong VS Code.
- Tự động kiểm tra, tải và cài bản vá phát hành trên GitHub Releases bằng nút **Kiểm tra bản vá** trong bản cài đặt.
- Toàn bộ dự án/ADB/AVD chạy trên Windows của người dùng. GitHub chỉ dùng để phát hành mã nguồn và bản cài.

### Giới hạn thực tế

**Không thể cam kết toàn bộ quá trình sửa code → biên dịch → hiển thị dưới 0,5 giây.** Watcher bắt đầu xử lý sau ~220 ms cộng thời gian sự kiện hệ thống; Gradle build và ADB deploy thường mất vài giây đến vài phút. Flutter hot reload thường nhanh hơn nhưng không có SLA 0,5 giây. Chu kỳ ảnh chụp xem trước mặc định là 1,5 giây nhằm tiết kiệm CPU. Một số thay đổi Flutter native (plugin, Android manifest/Gradle) có thể cần khởi động lại runner; tính năng Flutter hiện ở mức beta.

Baodroid **không tạo Android Emulator từ số 0** và không đi kèm Android SDK. Cần cài Android SDK, Android Emulator, ADB, Java/Gradle phù hợp dự án và ít nhất 1 AVD; muốn chạy 3 máy cần **3 AVD khác nhau**, không được mở trùng AVD bên ngoài Baodroid. Android SDK Emulator trên Windows cần bật tăng tốc phần cứng/virtualization (WHPX tùy máy). Nên có ít nhất 16 GB RAM, SSD và CPU hỗ trợ virtualization cho ba máy ảo; cấu hình cao hơn sẽ tốt hơn.

## Cài đặt Windows (.exe)

1. Mở [GitHub Actions → Windows build & release](https://github.com/techzoneadapter-droid/baodroid/actions/workflows/windows.yml), chọn workflow chạy thành công của nhánh `main`.
2. Tải artifact **Baodroid-Windows-Setup**, giải nén và mở `Baodroid-Setup-0.2.0.exe`.
3. Chọn thư mục cài, thực hiện các bước cài đặt, mở Baodroid.
4. Vì chưa có chứng chỉ ký mã Windows, SmartScreen có thể đưa ra cảnh báo. Chỉ chạy bản cài lấy từ repository mà bạn tin cậy.

**GitHub Release:** Với phiên bản 0.2.0, workflow trên nhánh `main` tạo release chứa bộ cài và file `latest.yml` sau khi CI thành công. Chức năng tự cập nhật **chỉ** hoạt động với bản cài và release công khai trên GitHub. Artifact từ workflow nhánh `main` dùng để thử nghiệm, không tự biến thành một release cập nhật.

## Chuẩn bị Android SDK

- Cài Android Studio hoặc Android command-line tools để lấy **SDK Platform-Tools**, **Android Emulator**, **AVD** (qua Device Manager hoặc `avdmanager`), và Build-Tools.
- Tạo ít nhất một AVD (ví dụ Pixel 7 / Android 14 x86_64); Baodroid chỉ hiển thị và quản lý AVD có sẵn.
- Nếu cần thêm 2 máy ảo, hãy tạo AVD khác tên và tải Android system images. Baodroid dùng các cổng ADB `5554`, `5556` và `5558`; các cổng này phải trống.
- Cài JDK phù hợp với dự án Android (thường JDK 17 hoặc phiên bản mà Android Gradle Plugin yêu cầu).
- Để chạy Flutter, cài Flutter SDK và bảo đảm lệnh `flutter` dùng được trong `PATH`. Hỗ trợ React Native chưa có trong bản này.
- Cài VS Code; Baodroid tìm VS Code trong thư mục cài đặt tiêu chuẩn (User hoặc System); nếu cài bản portable/vị trí khác, tính năng mở VS Code chưa hỗ trợ cấu hình thủ công.

## Khởi động

1. Mở Baodroid, vào phần **Cài đặt nhanh** và chỉ đến thư mục Android SDK (thường là `%LOCALAPPDATA%\Android\Sdk`).
2. Nhấn **Thêm dự án** và chọn thư mục gốc Android Gradle hoặc Flutter (không chọn thư mục con `app`).
3. Trên từng khung **Emulator**, chọn dự án và tên AVD.
4. Nhấn **Bắt đầu** và đợi Android boot; Baodroid build/deploy ứng dụng. Sau khi mở dự án trong VS Code và lưu mã nguồn, watcher sẽ tự đồng bộ nếu bật Auto build và Auto deploy.
5. Theo dõi tiến trình và lỗi trong **Log & Trạng thái hệ thống**; dùng **Tải lại** để build lại hoặc Flutter hot restart.

## Phát triển từ mã nguồn

```powershell
# Node.js 22+, Windows 10/11 x64
npm install
npm test
npm run check
npm start

# Tạo bộ cài Windows NSIS
npm run dist:win
```

Bộ cài xuất hiện trong `dist/`. Build Windows tốt nhất trên Windows, tự động hóa bằng GitHub Actions. Cần có internet để cài npm packages và tải dependency Android lần đầu; sau khi đủ thành phần, thiết bị chạy local.

## Cấu trúc mã nguồn

```text
src/main/index.js      Electron window, IPC API
src/main/engine.js     Quản lý 3 AVD, file watcher, build/deploy, screen capture và touch
src/main/process.js    Lệnh hệ thống an toàn dạng spawn/exec
src/main/store.js      Lưu cấu hình local bằng JSON
src/main/update.js     Tích hợp electron-updater / GitHub Releases
src/main/preload.js    API bridge giới hạn cho UI
src/shared/project.js  Nhận diện và phân tích dự án Android/Flutter
src/renderer/         HTML/CSS/JS giao diện, điều khiển Android
.github/workflows/    Pipeline tạo setup.exe trên Windows
```

**Lưu ý riêng tư:** Mã nguồn dự án Android vẫn ở đúng thư mục mà bạn lựa chọn; Baodroid đọc file và chạy công cụ cục bộ. Cấu hình nằm trong thư mục dữ liệu ứng dụng của Windows, không phải dự án GitHub.

Bản 0.2.0 là **MVP**. Chưa kiểm thử end-to-end trên Windows với Android SDK/AVD thực trong môi trường xây dựng này; cần kiểm tra thực tế trên PC Windows trước khi coi là bản phát hành ổn định.


## Baodroid v0.3.0 — Chạy tự động & kết nối VS Code

- Nhấn **Kết nối VS Code** trên từng máy. Nếu chưa gán dự án, chọn thư mục Android Gradle/Flutter trên ổ đĩa; nếu đã gán, VS Code mở trực tiếp thư mục đó.
- File watcher giám sát thư mục nguồn ngay trên Windows (không mở cổng mạng, không phải cài extension VS Code). Sau khi chọn dự án, phần mềm tự tìm AVD còn trống, khởi động Android và triển khai ứng dụng.
- Tùy chọn chọn dự án và AVD vẫn hiện trong mỗi thẻ máy để đổi thủ công khi cần. Thay đổi dự án khi đang chạy sẽ dừng máy hiện tại và tự khởi chạy dự án vừa chọn.
- Baodroid kiểm tra kết nối ADB định kỳ và khôi phục có giới hạn nếu emulator ngừng hoạt động. Nếu Android SDK hoặc AVD chưa được cài, ứng dụng sẽ báo rõ điều kiện thiếu; không thể tự tạo AVD ngoài SDK.
- Giao diện sửa lỗi chữ menu bên trái bị cuốn xuống thành cột, bổ sung nút kết nối VS Code riêng và bỏ nút Bắt đầu/Tải lại. Vẫn có nút Dừng máy để chủ động giải phóng CPU/RAM.
- Các yêu cầu về cập nhật dưới 0,5 giây chỉ áp dụng cho phát hiện thay đổi file; thời gian build Android/Gradle không thể bảo đảm dưới 0,5 giây.
