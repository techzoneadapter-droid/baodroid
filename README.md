# Baodroid v0.7.0 — Preview lớn và kết nối ChatGPT dễ hơn

Baodroid cho phép xem trước tối đa **3 dự án** từ thư mục được chọn trên máy tính. Không cần điện thoại USB và **không bắt buộc Android SDK cho dự án web**.

## Đã kiểm tra loại dự án thật trên GitHub

- **ReelTara**: React + TypeScript + Vite, chạy `npm run dev`. Đây là một ứng dụng web dạng mobile, không phải APK Android.
- **CHƯƠNG**: Expo SDK 54 + React Native/Expo Router, có hỗ trợ Expo Web; repository hiện chưa commit thư mục `android/`. Có thể xem trước phần giao diện web bằng Expo Web. Các native module (IAP, push, quảng cáo, v.v.) vẫn cần thiết bị/emulator Android để đánh giá đúng và có thể không chạy được trên web.
- **MiniZap**: React/Vite + Capacitor, preview bằng Vite; Android native qua Capacitor/Android SDK là một quy trình khác.

## Chạy nhanh

1. Tải source của dự án vào máy hoặc mở thư mục dự án đã có trong VS Code.
2. Mở Baodroid → **Thêm dự án** hoặc **Chọn thư mục dự án** ở từng máy → trỏ vào **thư mục gốc chứa `package.json`**.
3. Baodroid tự nhận diện:
   - `web` (Vite) → chạy `npm run dev -- --host 127.0.0.1 --port 43120..43122 --strictPort`, nhúng mobile preview qua iframe cục bộ.
   - `expo-web` (Expo managed hoặc bare) → chạy `npx --no-install expo start --web --port 43120..43122 --localhost`, nhúng mobile preview cục bộ.
   - `flutter`, `gradle`, `react-native` không có Expo → dùng **Android Emulator thực** như trước, cần Android SDK + AVD.
4. Nếu dự án chưa cài `node_modules`, Baodroid hiện **Cài thư viện & chạy**. Nút này yêu cầu xác nhận trước khi thực thi `npm install`; npm có thể chạy script do dự án chỉ định. Bạn cũng có thể chạy `npm install` từ VS Code rồi khởi động lại preview.
5. Sửa và lưu code: Vite dùng HMR, Expo Web dùng Metro refresh; không chạy Gradle chỉ để cập nhật UI web. Các máy dùng cổng riêng `43120`, `43121`, `43122`.
6. Nhấn chọn từng máy để phóng lớn. Mỗi máy tiếp tục có khung ChatGPT/Codex độc lập phía dưới preview để chỉnh trực tiếp code trong đúng thư mục được gán.

## Phân biệt quan trọng

**Web Mobile Preview là trình duyệt mô phỏng kích thước điện thoại, không phải một phiên Android chạy APK.** Vì vậy không thể dùng để xác nhận các tính năng chỉ tồn tại trên Android (push native, IAP, Bluetooth, camera native, quyền hệ thống, v.v.). Nếu bạn cần kiểm tra các tính năng đó, phải cài Android SDK + AVD hoặc một Android runtime tương đương. Baodroid không thể chuyển một app web thành ứng dụng Android thực nếu không có công cụ build/runtime tương ứng.

Với dự án web, Baodroid không còn chặn tất cả các thao tác vì thiếu SDK. Nút Android SDK chỉ hiện khi có dự án native cần nó.

## Yêu cầu môi trường

- Windows 10/11 x64 + Node.js/npm.
- Folder đã tải về máy, chứa mã nguồn dự án. Liên kết GitHub không đồng nghĩa tự có thư mục dự án trên ổ đĩa.
- `node_modules` (có thể cài bằng nút trong app).
- Android native: thêm Android SDK, Android Emulator và AVD theo loại dự án.
- Trình phát triển web cần mở cổng loopback trên Windows; Baodroid sử dụng localhost, không gửi mã nguồn lên máy chủ của Baodroid.

## Kiểm tra phát hành

```bash
npm install
npm test
npm run check
npm start
```

CI GitHub Actions trên Windows tạo Setup NSIS + `latest.yml` để nút **Kiểm tra bản vá** nhận phiên bản mới.


## Nâng cấp v0.7.0

- Xem 3 máy hoặc chọn riêng một máy. Khi có dự án web, Baodroid tự ưu tiên màn hình đầu tiên để xem lớn. Bấm **Xem lớn** trên từng thẻ để phóng to và có thể quay lại bố cục 3 máy. Vùng preview rộng hơn.
- Không còn tải lại iframe Vite/Expo khi Baodroid gửi thông báo trạng thái nhưng địa chỉ và trạng thái preview không đổi. Nhờ vậy ô nhập/chat và trạng thái trang web ít bị gián đoạn hơn.
- Vite/Expo hiện rõ nhãn **Web mobile ≠ Android native**. Web preview chỉ mô phỏng viewport điện thoại; muốn chạy APK và API hệ điều hành Android thật vẫn cần Android SDK + AVD.
- **Kết nối ChatGPT** giờ dò tìm Codex CLI ở thư mục npm của Windows, hiển thị nút **Cài Codex CLI** nếu chưa cài. Quá trình cài dùng npm toàn cục và chỉ được chạy khi bạn xác nhận.
- Hai lựa chọn đăng nhập: đăng nhập ChatGPT qua trình duyệt bằng lệnh Codex chính thức, hoặc **Đăng nhập bằng mã** (device authentication). Dùng account ChatGPT chung nhưng 3 lịch sử AI và 3 workspace vẫn độc lập.
- Model mặc định **Tự động (Codex CLI chọn)** để tránh phải chọn các model không khả dụng đối với tài khoản. Các lựa chọn khác tùy khả năng Codex CLI và quyền truy cập.
- Khi đăng nhập bằng mã, mã hiển thị trong Baodroid. Không chia sẻ mã, mật khẩu hay cookie. Baodroid không thu thập thông tin đăng nhập ChatGPT.
- Nếu CLI đã được cài nhưng Baodroid vẫn không tìm thấy, hãy kiểm tra phiên bản Node.js/npm trong Windows Terminal và khởi động lại Baodroid.

### Giới hạn bảo mật

Codex vẫn là công cụ có quyền sửa file nguồn. Baodroid dùng sandbox workspace-write, tạo điểm hoàn tác trước khi sửa và kiểm tra xung đột trước khi khôi phục. Mức cô lập file còn phụ thuộc vào khả năng sandbox trên Windows và cấu hình Codex. Hãy commit Git trước khi chạy tác vụ sửa mã quan trọng.
