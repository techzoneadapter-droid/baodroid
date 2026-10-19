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


## v0.9.0 — Giao diện tập trung vào preview và giảm crash Android

**Giao diện:** rút gọn thanh tiêu đề và phần giới thiệu, ưu tiên một màn hình điện thoại lớn khi có dự án; có nút để quay lại xem 3 máy. Khung ChatGPT/Codex của từng máy chuyển thành mục **thu gọn**; nhấn Chat AI để mở chat, nhưng vẫn giữ lịch sử và phiên làm việc độc lập. Dự án chưa chọn không còn chiếm khung điện thoại cao như trước. Các nút dành cho lập trình viên và log vẫn có nhưng không che màn hình.

**Khởi động AVD:** Trên Windows, log đã xác nhận WHPX hoạt động nhưng emulator vẫn có thể crash với mã `3221225477` (Windows `0xC0000005`). Để giảm khả năng xung đột driver Vulkan, Baodroid thử **GPU SwiftShader + `-feature -Vulkan` + cold boot không snapshot** ở chế độ không cửa sổ, thời gian chờ tối đa 90 giây. Nếu emulator thoát hoặc không boot, Baodroid thử **một lần cuối với GPU host, Vulkan tắt và cửa sổ emulator dự phòng**. Dù emulator có cửa sổ riêng, Baodroid vẫn dùng ADB để truyền ảnh Android vào preview khi máy ảo hoạt động.

**Không làm lại từ đầu:** giữ nguyên SDK, AVD và mã nguồn dự án; không xóa dữ liệu AVD. Lỗi đã được ghi vào log và dừng sau hai lần thử. Nếu cả hai cấu hình GPU thất bại, đây có thể là lỗi driver hoặc phiên bản emulator trên Windows cần khắc phục ngoài Baodroid. Đây không phải cam kết đã giải quyết crash trên mọi máy; cần kiểm tra thực tế Windows và APK của ReelTara.

Tham khảo tài liệu chính thức Android Emulator về các lựa chọn GPU và cờ tắt Vulkan: https://developer.android.com/studio/run/emulator-acceleration và https://developer.android.com/studio/run/emulator-troubleshooting.


## v0.9.1 — Quay lại Preview Hub và chẩn đoán ReelTara rõ hơn

**Giao diện:** khôi phục bố cục giống bản cũ với điều hướng trái, 3 máy Android ở giữa và panel Build/Deploy/Sync bên phải. Hai thanh bên có thể thu gọn bằng nút Trái/Phải trên thanh công cụ. Vẫn giữ nút Thêm dự án, VS Code, Web Preview, khởi tạo SDK/AVD, phóng to từng máy, ChatGPT/Codex độc lập, Nhật ký và Kiểm tra bản vá. Mặc định hiển thị 3 máy thay vì tự chuyển sang 1 máy. Chi tiết lỗi được hiển thị ngay tại card của máy và panel phải.

**Sửa pipeline APK:** build Vite rồi Capacitor → Gradle → ADB install → mở Activity chính. Khi Node.js cài đặt chuẩn trên Windows, gọi `node.exe npm-cli.js / npx-cli.js` trực tiếp, giảm lỗi gọi `.cmd` qua shell với đường dẫn dự án có khoảng trắng/dấu. Thêm log tóm tắt lỗi theo từng bước và không lặp Gradle khi bản build đã thất bại. Sau khi build APK, ưu tiên đọc `applicationId` và `launchable-activity` từ chính APK bằng `aapt dump badging`; không chỉ suy đoán từ mã Gradle. Sau lệnh install xác minh package và kết quả mở Activity; nếu không được, báo lỗi nguyên nhân thay vì coi màn hình Gmail của emulator là thành công.

**Giới hạn:** Không thể xác nhận lỗi Gradle/Vite cụ thể của ReelTara chỉ bằng ảnh thông báo chung; nếu mã dự án thiếu thư viện, plugin hoặc JDK không tương thích, app sẽ báo rõ lỗi từ bước tương ứng. CI Windows chỉ kiểm thử mã và tạo bộ cài; không có môi trường Android Emulator của người dùng để chứng nhận APK đã chạy. Không cần cài lại SDK hay AVD.


## v0.9.2 — Sửa lỗi GradleWrapperMain khi build ReelTara trên Windows

Dòng lỗi `Could not find or load main class org.gradle.wrapper.GradleWrapperMain` ở bước 3/4 là lỗi Gradle Wrapper, không phải lỗi Android Emulator/SDK. Dự án ReelTara gốc trên GitHub là Vite (không có thư mục `android`), nên Baodroid tạo Android native bằng Capacitor.

- Trước khi chạy Gradle, Baodroid kiểm tra file `android/gradle/wrapper/gradle-wrapper.jar` có ZIP central directory hợp lệ và chứa `org/gradle/wrapper/GradleWrapperMain.class` hay không.
- Nếu thiếu/hỏng, Baodroid dùng `node_modules/@capacitor/cli/assets/android-template.tar.gz` **đang có sẵn trong dự án** để khôi phục file JAR, không tải tệp nhị phân từ nguồn ngẫu nhiên và không cài lại Android SDK.
- Tệp JAR cũ được sao lưu với phần mở rộng `.baodroid-backup`; không động vào source React, không xóa AVD/Emulator.
- Nếu Java vẫn báo thiếu lớp sau lần chạy đầu, Baodroid phục hồi JAR một lần (kể cả khi nhìn có vẻ hợp lệ) và thử build Gradle lại đúng một lần, không build lặp vô hạn. Nếu template CLI cũng thiếu thì hiển thị thông báo chỉ rõ phải cài lại @capacitor/cli thay vì chờ.
- Chạy Wrapper thông qua `java -jar` giống script Gradle Wrapper chuẩn, tránh thao tác shell trên đường dẫn Unicode Windows.
- Giữ nguyên UI v0.9.1: thanh trái/phải thu gọn, 3 máy, VS Code, Web Preview, Android Native, ChatGPT/Codex và cập nhật.

Giới hạn: CI Windows kiểm tra code và đóng gói; không thể xác nhận Gradle/Capacitor build thành công trên máy người dùng cho đến khi chạy Baodroid v0.9.2 tại Windows. Nếu còn lỗi, Nhật ký sẽ ghi chính xác thông báo Gradle.


## v0.9.3 — ADB không nhận emulator-5554

Khi Baodroid báo `adb.exe: device 'emulator-5554' not found`, lỗi xảy ra **trước** bước Gradle/Capacitor: máy ảo chưa đăng ký với ADB hoặc đang dùng serial khác. Trước khi mở emulator, Baodroid chủ động `adb start-server`, kiểm tra `adb devices -l`, và nếu AVD xuất hiện ở cổng khác thì gọi `adb emu avd name` để xác nhận đúng tên máy ảo rồi tiếp quản serial ấy. Không bao giờ cố gán máy ảo khác vào dự án.

Nếu suốt 55 giây ADB không đăng ký bất kỳ serial nào của máy đó, Baodroid kết thúc lần thử vô vọng sớm và thử một cấu hình GPU dự phòng duy nhất. Với Android đã được ADB nhìn thấy dưới dạng `offline` hoặc `device` nhưng boot chậm, cho phép tối đa 150 giây để hoàn thành boot. Nhật ký phân biệt lỗi **thiết bị chưa xuất hiện** và **Android đã xuất hiện nhưng chưa boot xong**; không tự xóa AVD, dữ liệu APK, thư mục dự án hay cài lại SDK. Bố cục Preview Hub cũ từ v0.9.1 được giữ nguyên.

Đây là bản sửa luồng kết nối, không phải bằng chứng emulator đã chạy tốt trên máy tính người dùng. Nếu AVD vẫn không khởi động ở cả hai chế độ đồ họa, cần lấy log emulator thực tế và kiểm tra bộ driver GPU, bản emulator và cấu hình AVD, thay vì liên tục tăng timeout hoặc build APK.


## v0.9.4 — Khắc phục máy ảo không đăng ký ADB sau khi khởi động

- Theo log thực tế máy Windows, GPU NVIDIA host **đã từng mở được Android** ở chế độ cửa sổ dự phòng; nhưng GPU SwiftShader chạy ẩn trong các bản gần đây liên tục không đăng ký ADB. Ưu tiên `-gpu host -no-window -feature -Vulkan` để tận dụng GPU đã hoạt động, rồi thử lại **một lần bằng GPU host với cửa sổ dự phòng** nếu Android vẫn không lên. Không tự xoá dữ liệu AVD, không tạo emulator mới ngoài ba slot.
- Trước khi chạy emulator, kiểm tra cả cổng console (5554, 5556, …) và cổng ADB ngay sau (5555, 5557, …) có bị chương trình khác chiếm hay không. Nếu bị chiếm, tìm cặp cổng tiếp theo thay vì cố khởi động trên cổng cũ.
- Ghi thêm lỗi emulator bằng `-verbose`, giữ buffer các dòng gần đây và bổ sung thông báo tình trạng GPU/cổng vào nhật ký khi emulator không hiện trong `adb devices`. Không nhầm lỗi này với lỗi Gradle/Capacitor; chưa bắt đầu build cho đến khi Android chạy thật.
- Giữ nguyên giao diện ba máy Preview Hub, ChatGPT, VS Code và chức năng cập nhật của bản v0.9.3.

**Cần kiểm tra trên máy thật:** CI Windows không thể chạy máy ảo có tăng tốc GPU. Nếu v0.9.4 vẫn không khởi động được AVD, vui lòng dùng Nhật ký kỹ thuật và log khởi động chi tiết mới; không nên tiếp tục cài lại Android SDK hoặc thay đổi timeout vô điều kiện. Tham khảo hướng dẫn đồ hoạ của Android: https://developer.android.com/studio/run/emulator-acceleration


## v0.9.5 — Tích hợp cơ chế quản lý máy ảo mã nguồn mở Androidbox

Nguồn tham khảo: [Wolklaw/Androidbox](https://github.com/Wolklaw/Androidbox), MIT, có lưu giấy phép tại [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Androidbox là giao diện Windows quản lý Google Android Emulator, không phải một hypervisor khác. Baodroid đã **chuyển phần quản lý vòng đời máy ảo** từ Androidbox sang JavaScript và dùng trên Windows cùng SDK hiện có. Đây không phải cài thêm trình giả lập thứ hai hoặc nhúng toàn bộ Python UI.

- Tạo `src/main/androidbox-runtime.js` để thăm dò trực tiếp **console TCP của QEMU**, đọc dấu hiệu **AVD hardware-qemu.ini.lock**, kiểm tra đường dẫn AVD, khả năng quick boot và tạo môi trường `ANDROID_HOME/ANDROID_SDK_ROOT` trỏ tới SDK mà Baodroid đã cấu hình.
- Không phụ thuộc hoàn toàn vào `adb devices`: nếu QEMU đã mở cổng console nhưng ADB chưa nhận thiết bị, Baodroid tiếp tục đợi trong ngân sách boot 150 giây và hiển thị **QEMU đang chạy / ADB chưa sẵn sàng**, thay vì luôn dừng sau 55 giây.
- Nếu QEMU chưa mở cổng và ADB không xuất hiện sau 55 giây, Baodroid dừng thử sớm với log console/AVD/đồ họa, không khởi động vô hạn hoặc xoá lock/AVD. Có fallback GPU host với cửa sổ emulator như trước.
- `-no-metrics` giảm công việc bên ngoài không cần thiết. Ba preview độc lập, Web Preview, Gradle/Capacitor, VS Code, ChatGPT, auto-update và UI v0.9.4 vẫn giữ nguyên.
- `scrcpy` được đánh giá nhưng **chưa đưa vào bản vá này**, vì scrcpy chỉ truyền hình ảnh từ Android đã chạy; nó không thể khắc phục VM chưa xuất hiện trong ADB.

**Giới hạn kiểm chứng:** GitHub Actions chạy tests và đóng gói Windows, nhưng không thể xác thực khởi động QEMU/WHPX trên máy người dùng. Nếu firmware/driver hoặc AVD hỏng, không thư viện Node/Python nào bảo đảm boot được. Hãy xem trạng thái QEMU/ADB mới trước khi thực hiện lần sửa sâu tiếp theo.


## v0.9.6 — Tạo nhanh 2 dự án mẫu NVB

Nếu danh sách dự án chưa có **Neon Arrow** và **WavePlay**, nhấn **✦ Tạo 2 dự án NVB**. Baodroid sao chép hai template Vite/Capacitor-preview từ chính bộ cài vào `Documents/NVB_IAA_Apps/NeonArrow` và `Documents/NVB_IAA_Apps/WavePlay`, sau đó gắn chúng vào các slot trống. Cần có ít nhất **2 slot dự án trống**. Nếu đã tồn tại dữ liệu ở thư mục đích mà không phải template do Baodroid tạo, ứng dụng từ chối ghi đè.

Hai template là giao diện/prototype tương tác. Chọn **Cài thư viện** ở từng máy để cài Vite và chạy Web Preview. Muốn xem APK Android trong emulator, nhấn **Khởi tạo Android SDK & AVD** và xác nhận cài Capacitor. Việc này có thể mất nhiều phút và cần SDK, Gradle, JDK. Các ứng dụng mẫu **chưa tích hợp AdMob/Meta**, không phải sản phẩm phát hành. Cập nhật Baodroid không tự động thêm dự án hoặc sửa các thư mục đã có nếu người dùng không chọn tạo.


## v0.9.7 — Tích hợp quản lý Android Emulator từ Expo CLI (MIT)

Sau nhiều lần thử chế độ `-no-window` trên Windows khiến AVD không xuất hiện ở ADB, Baodroid chuyển sang **cách quản lý máy ảo tham khảo và chuyển thể từ Expo CLI** (MIT): https://github.com/expo/expo/tree/main/packages/@expo/cli/src/start/platforms/android

- Ưu tiên khởi động Android Emulator chính thức bằng cú pháp chuẩn `emulator @Baodroid_Preview_1 -port 5554 -no-audio`, có **cửa sổ emulator thật** thay vì ép chạy headless. Cửa sổ này là bộ máy Android; Baodroid vẫn chiếu màn hình và thao tác trên thiết bị qua ADB sau khi khởi động. Nếu khởi động chuẩn không được, thử một lần với GPU host, Vulkan tắt, cold boot.
- Tích hợp `src/main/expo-device-manager.js`: dựa trên cơ chế Expo CLI, đọc danh sách ADB tuần tự, nhận diện tên AVD qua `adb emu avd name` nếu serial thay đổi, chờ `sys.boot_completed=1` và boot animation dừng, ngừng theo dõi khi slot đã đóng.
- Không nhận nhầm emulator giữa ba dự án và không khởi chạy nhiều vòng vô hạn. Giữ nguyên hệ thống tạo Android SDK/AVD, Capacitor, Gradle, VS Code, ChatGPT và UI Preview Hub của bản trước.
- **Không nhúng scrcpy thành emulator**: scrcpy (https://github.com/Genymobile/scrcpy, Apache-2.0) chỉ sao chép màn hình Android đã hoạt động, không tự chạy Android. `google/android-emulator-container-scripts` chạy Linux/KVM và không hỗ trợ Docker Desktop Windows cho KVM; không phù hợp mục tiêu Windows local.
- Mã chuyển thể và thông báo bản quyền MIT của Expo được ghi tại `THIRD_PARTY_NOTICES.md`.

**Chưa được xác minh trên phần cứng của bạn:** CI Windows có thể chạy test và tạo bộ cài nhưng không có GPU/AVD của PC người dùng; nên phải cài bản vá và thử máy 1 để biết quá trình Emulator → Gradle → APK đã hoạt động chưa. Nếu Android còn không boot thì lỗi là lớp emulator host; không nên tiếp tục tăng thời gian chờ hoặc thay toàn bộ SDK.


## v0.9.8 — Sửa lỗi Gradle jarfile từ log ReelTara trên Windows

**Triệu chứng:** Android Emulator đã khởi động và ADB hoạt động, nhưng bước 3/4 không build được vì Java báo `Unable to access jarfile ...gradle-wrapper.jar`. Thay vì thay bộ giả lập tiếp, Baodroid dùng phương thức chuẩn của chính Gradle/Capacitor:

- Gọi `gradlew.bat :app:assembleDebug ...` từ **cwd = thư mục Android native của dự án**, bằng tiến trình `cmd.exe /d /c gradlew.bat`. Không tự ghép đường dẫn tuyệt đối của JAR để truyền cho `java -jar`. Đây là cách chạy dựa trên `gradlew.bat` chính thức trong [Gradle](https://github.com/gradle/gradle/blob/master/gradlew.bat) và [Capacitor](https://github.com/ionic-team/capacitor/blob/main/android-template/gradlew.bat). Cửa sổ CMD được ẩn; không yêu cầu người dùng thao tác.
- Kiểm tra JAR có thể truy cập và `gradle-wrapper.properties` tồn tại trước khi build; với dự án Capacitor có JAR bị thiếu/hỏng thì vẫn giữ tự khôi phục từ template như v0.9.2. Nếu vẫn gặp `GradleWrapperMain` / `Unable to access jarfile`, chỉ thử khôi phục một lần, không lặp build vô hạn.
- Bổ sung kiểm thử thực thi `cmd.exe` thật trên GitHub Actions Windows trong đường dẫn có tiếng Việt, khoảng trắng. Mục đích là bắt lỗi escaping từng bị bỏ sót trong những test mô phỏng trước.
- Giữ nguyên UI Preview Hub, 3 slot Android, Expo/Web, VS Code, Codex/ChatGPT, cập nhật bản vá và cơ chế tạo AVD v0.9.7. Không đổi Android SDK hay đụng dữ liệu AVD.

**Phạm vi xác nhận:** CI Windows chỉ chạy Gradle batch smoke test với JAR fixture và đóng gói. Không có mã nguồn ReelTara trên máy người dùng, nên không thể khẳng định toàn bộ APK build thành công trước khi chạy kiểm tra thực tế.


## v0.9.9 — Khắc phục crashpad/OpenGL trong Android Emulator 37.x

**Lỗi Windows thực tế:** `Critical: Failed to load opengl32sw`, `Software OpenGL failed. Falling back to system OpenGL`, `Showing crashdialog to get consent`, sau đó AVD `Baodroid_Preview_1` không xuất hiện trong `adb devices`. Log của emulator 37.x có thể chứa cảnh báo `opengl32sw` ngay cả khi DLL không được phát hành kèm SDK; **không tải DLL lạ từ Internet**. Trong trường hợp này, dấu hiệu Crashpad cùng với không có serial ADB mới là bằng chứng tiến trình emulator không chạy được.

- Dựa vào hướng dẫn chính thức [Android GPU acceleration](https://developer.android.com/studio/run/emulator-acceleration) và bài điều tra Windows emulator từ [windows-android-opencode / environment-gaps](https://github.com/JosiahSiegel/windows-android-opencode/blob/main/docs/environment-gaps.md), Baodroid chọn hai chế độ có kiểm soát, không thêm một emulator không rõ nguồn gốc.
- Trên Windows Console: lần 1 chạy emulator windowed với `-gpu host -no-snapshot-load -feature -Vulkan`, lần 2 thử `-gpu software -no-window`. Với Windows RDP (`SESSIONNAME` dạng `RDP-...`), dùng phần mềm headless trước và GPU host windowed làm dự phòng. Đều sử dụng Google emulator.exe hiện đã cài.
- Tích hợp bộ phát hiện **crashpad consent dialog**; nếu quá trình crash trước khi đăng ký thiết bị ADB, ngừng lần thử đó sớm, không chờ đủ 110 giây. Cảnh báo `opengl32sw` **một mình nó** không kích hoạt tự dừng.
- Giữ retry tối đa **1 lần**, không xóa SDK, AVD, mã nguồn, dữ liệu emulator hoặc cài đặt dự án; nếu cả hai đều thất bại thì thông báo crash cụ thể thay vì báo chung chung ADB not listed.
- Giữ UI Preview Hub ba điện thoại, VS Code, ChatGPT/Codex, Web Preview và bộ cập nhật, cũng như cơ chế build Gradle Wrapper chuẩn v0.9.8.

**Giới hạn:** CI Windows chỉ mô phỏng log và chạy kiểm thử mã. Không có GPU Nvidia, driver, AVD và môi trường đăng nhập Windows của máy người dùng. Nếu Crashpad vẫn xuất hiện ở cả hai chế độ, phải kiểm tra log crash của emulator và hệ điều hành/driver GPU trên máy đó; bản cập nhật không được coi là chứng nhận Android đã chạy thành công.
