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


## v0.8.2 — Sửa trường hợp Android chỉ hiện màn hình Home

Khi Android Emulator đã được công cụ sửa lỗi hoặc Android Studio mở trước trên cổng tương ứng, Baodroid sẽ dùng `adb emu avd name` xác minh đó **đúng AVD của vị trí preview**, kết nối lại và tiếp tục **Gradle build → ADB install → mở APK**. Không buộc người dùng đóng emulator, cài SDK lại hay gõ lệnh CMD. Không tự nhận một AVD khác đang dùng cùng cổng. Nếu build APK thất bại, xem Nhật ký kỹ thuật để xác định Gradle/JDK hay thư viện dự án. Cập nhật này chưa được xác nhận trên phần cứng Windows cụ thể.


## v0.8.3: Sửa kết nối & mở app

Nếu SDK/AVD đã tạo nhưng máy Android chỉ hiện màn hình Home, nhấn nút **Sửa kết nối & mở app** dưới dự án ở chế độ Android native. Baodroid tự tìm AVD đúng theo tên trên mọi cổng ADB, nhận emulator bên ngoài mà không đóng nó, hoặc chọn cổng trống để khởi động AVD, sau đó tự chạy Gradle → cài APK → mở ứng dụng. Nếu Android đang chạy nhưng Gradle lỗi, nút sẽ build lại mà không cài SDK hay reset dữ liệu AVD. Lỗi được hiển thị dưới preview và mở Nhật ký kỹ thuật, đồng thời lưu tại thư mục dữ liệu Baodroid trong file `baodroid-runtime.log`. Nếu một emulator thuộc dự án khác đang dùng cổng mặc định, Baodroid sẽ thử cổng còn trống, không ghi đè AVD khác. Android Emulator và build native trên Windows yêu cầu cấu hình JDK/Gradle phù hợp, nên nút sửa không thể đảm bảo vượt qua lỗi phụ thuộc trong mã dự án.


## v0.8.4 — Khắc phục Gradle gọi sai đường dẫn và build lặp vô hạn

- Windows: Baodroid chạy Gradle Wrapper trực tiếp qua Java (`org.gradle.wrapper.GradleWrapperMain`) và JAR đi kèm trong dự án, không gọi đường dẫn `gradlew.bat` tuyệt đối qua `cmd.exe / shell:true`. Đây là cách tránh lỗi kiểu `'D:\\?' is not recognized` khi thư mục chứa ký tự đặc biệt, khoảng trắng hoặc dấu tiếng Việt. JDK phải tồn tại; ưu tiên `JAVA_HOME` và Android Studio JBR.
- Capacitor/Vite: chỉ theo dõi thư mục source và cấu hình, **không theo dõi thư mục android** do `cap sync`/Gradle sinh ra; tránh vòng lặp rebuild sau khi build.
- EPERM từ watcher không còn spam log liên tục; chỉ báo lỗi khi thay đổi trạng thái.
- Nếu Gradle thất bại, Baodroid hiển thị lỗi rồi dừng vòng build tự động. Chỉ bắt đầu lại khi người dùng bấm **Sửa kết nối & mở app** hoặc lưu thay đổi file nguồn thực sự.
- Không cần xóa Android SDK, AVD hay project. Khi cập nhật, thử ReelTara trước; lần build Android đầu tiên có thể mất vài phút.

Giới hạn: CI Windows kiểm tra chức năng và tạo setup; chưa chạy Gradle/Capacitor của ReelTara trên máy Windows của bạn. Nếu dự án thiếu `gradle-wrapper.jar` hoặc cần JDK khác, phần nhật ký sẽ nêu lỗi cụ thể.


## v0.8.5 — Máy ảo Android khởi động quá lâu hoặc dừng hẳn

- Trước khi khởi động AVD trên Windows, Baodroid gọi `emulator -accel-check`. Nếu WHPX/tăng tốc máy ảo không sẵn sàng, hiển thị lỗi cụ thể ngay thay vì chờ boot 180 giây lặp lại. Đã bật Virtualization trong Task Manager không đồng nghĩa chắc chắn Windows Hypervisor Platform khả dụng.
- Máy mới được chạy `-no-snapshot-load -gpu software`; nếu boot lỗi một lần, tự thử lại duy nhất với `-gpu swiftshader`, theo cơ chế GPU của Android Emulator. Không xóa dữ liệu AVD, không cài lại Android SDK.
- Thời gian chờ ADB tối đa 120 giây/mỗi lần, có tiến độ và log định kỳ. Lỗi emulator/PANIC/WHPX/crash được ghi lại; khi cả hai lựa chọn GPU đều không chạy thì dừng hẳn, không tạo vòng thử vô hạn.
- Nếu thất bại, dùng nút **Sửa kết nối & mở app** để thử lại sau khi giải quyết nguyên nhân, hoặc gửi file `baodroid-runtime.log` trong thư mục dữ liệu Baodroid để tiếp tục xác định lỗi.
- Việc khởi động Android ảo, build APK và chạy ReelTara thực tế trên máy người dùng vẫn phải được kiểm nghiệm; CI Windows chỉ kiểm tra logic, cú pháp và đóng gói, không có AVD phần cứng.
