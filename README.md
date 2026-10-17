# Baodroid 0.4.0 — Android Preview Hub

Baodroid là ứng dụng Windows đơn giản để **xem và kiểm tra tối đa ba dự án Android trực tiếp trên máy tính** trong khi sửa code bằng VS Code. Không cần điện thoại USB, không có dịch vụ cloud hay đồng bộ mã nguồn ra ngoài.

## Sử dụng

1. Cài Android SDK (gồm `platform-tools/adb.exe` và `emulator/emulator.exe`) và tạo ít nhất một Android Virtual Device (AVD) qua Android Studio → Device Manager. Để chạy Android trên Windows vẫn cần một Android runtime thực.
2. Mở Baodroid → **Thêm dự án** hoặc **Kết nối VS Code** trên vị trí 1/2/3 → chọn thư mục gốc dự án trên máy.
3. Baodroid nhận diện Android Gradle, Flutter hoặc React Native (bao gồm bare Expo có thư mục `android/`), chọn AVD còn trống, tự khởi động Android ảo, build và cài ứng dụng.
4. Sửa/lưu code trong VS Code; màn hình preview tự cập nhật theo framework: Flutter hot reload, React Native/Expo Metro Fast Refresh hoặc Gradle incremental build với Android native.
5. Chọn **Máy 1/2/3** để phóng lớn. Chạm/vuốt chuột trực tiếp trên preview để kiểm tra tương tác.

## React Native

Dự án cần có `package.json`, thư mục `android/` và `android/settings.gradle` (hoặc `.kts`). Dự án cần đã cài `node_modules` và máy Windows cần Node.js/npm. Baodroid chạy Metro trên `localhost:8081`, `8082`, `8083` theo từng vị trí và dùng ADB reverse để nối từng Android **emulator** tới Metro tương ứng. Đây là kết nối nội bộ máy tính ↔ máy ảo, *không phải USB*.

Sau lần build APK debug ban đầu, JS/TS thường chỉ dùng Fast Refresh; thay đổi mã Android native cần Gradle rebuild. Expo bare/development build được nhận diện; Expo Go managed-only chưa được hỗ trợ.

## Yêu cầu và giới hạn

- Windows 10/11 x64; Android SDK/Android Emulator; tối thiểu một AVD có system image đã cài.
- Mỗi máy ảo dùng CPU/RAM thật; chạy ba máy song song tùy thuộc phần cứng.
- React Native: Node.js/npm và dependencies đã cài; Flutter: Flutter SDK; native Android: JDK và Gradle Wrapper.
- Phát hiện sửa file có debounce khoảng 220 ms; **không bảo đảm quá trình biên dịch và preview cập nhật dưới 0,5 giây**.
- Không cần cắm điện thoại và không dùng dịch vụ mạng để gửi mã nguồn. GitHub chỉ được sử dụng khi người dùng chủ động kiểm tra bản vá.
- Nếu chưa có AVD, Baodroid báo yêu cầu tạo AVD trong Android Studio trước. Không tự tải system image (kích thước có thể nhiều GB).

## Development

```bash
npm install
npm test
npm run check
npm start
```

GitHub Actions build bản cài Windows và phát hành kèm `latest.yml` để nút **Kiểm tra bản vá** cập nhật.

MIT License.
