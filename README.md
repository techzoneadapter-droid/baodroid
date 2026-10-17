# Baodroid 0.5.0 — Android Preview & ChatGPT coding

Baodroid là ứng dụng desktop Windows giúp chạy và xem trước tối đa **ba ứng dụng Android**, đồng thời chỉnh sửa mã nguồn ngay bên dưới từng màn hình bằng **ChatGPT/Codex**. Không cần điện thoại USB.

## Dùng app

1. Cài Android SDK, Android Emulator và tạo tối thiểu một AVD trong Android Studio → Device Manager.
2. Mở Baodroid, thêm dự án Gradle, Flutter hoặc React Native từ thư mục trên Windows. Baodroid tự gán AVD còn trống và chạy ứng dụng.
3. Mỗi máy có nút **Kết nối ChatGPT**, chọn model và ô nhập prompt dưới màn hình.
4. Đăng nhập ChatGPT qua trình duyệt bằng **Codex CLI chính thức**. Nếu Windows chưa cài Codex CLI, cài Node.js/npm rồi chạy một lần: `npm install -g @openai/codex`. Sau đó bấm lại Kết nối ChatGPT. Ứng dụng không lấy cookie hay mật khẩu đăng nhập của bạn.
5. Gửi yêu cầu. Codex chạy tại **thư mục gốc dự án của riêng máy đó**, sửa file nguồn trực tiếp; watcher/hot reload/build của Baodroid tự làm mới preview.
6. **Xem thay đổi** để so sánh nội dung trước/sau cho tối đa 12 file (bản xem trước giới hạn 2.500 ký tự mỗi phía). **Hoàn tác** để khôi phục thay đổi gần nhất nếu file chưa bị người dùng sửa tiếp.

## Hệ thống AI

- Tài khoản ChatGPT có thể được dùng chung để xác thực, nhưng **3 phiên chat và 3 workspace độc lập**. Các prompt không được đưa vào lịch sử của máy khác.
- Codex được chạy với chế độ **workspace-write** và không tự yêu cầu tăng quyền. Không sử dụng chế độ bỏ qua sandbox.
- Trước khi chỉnh code, Baodroid chụp snapshot tối đa 700 file nguồn (24MB) để có thể Undo. File bí mật, thư mục build, `node_modules`, `.git`... không được đưa vào snapshot.
- ChatAI sẽ từ chối bắt đầu khi footprint quá lớn để không hứa hẹn hoàn tác thiếu an toàn.
- Hoàn tác chỉ được thực hiện nếu các file vẫn y như lúc AI chỉnh xong, nhằm không ghi đè thay đổi mới của bạn. Chỉ lưu điểm hoàn tác gần nhất trong bộ nhớ phiên app, mất khi thoát.
- Baodroid không thể cam kết AI chỉ đọc/sửa file phù hợp nếu sandbox Codex của hệ điều hành không được kích hoạt đúng. Nên sao lưu hoặc commit Git trước khi nhờ AI chỉnh dự án quan trọng.
- Việc đăng nhập ChatGPT dùng **Codex CLI**, không phải tự động hóa trang ChatGPT. ChatGPT gói thuê bao và OpenAI API là hai cơ chế tính phí/quyền truy cập khác nhau. Các model trong menu có thể không được tài khoản cấp quyền; nếu lỗi, thử model khác.

## Android Preview

- React Native/Expo bare: Metro Fast Refresh; Flutter: hot reload; Android Gradle: incremental build/deploy.
- Baodroid chạy Android ảo trên Windows qua SDK và ADB. ADB là cầu nối đến emulator local, không yêu cầu cắm điện thoại.
- Sửa code đến ảnh preview cập nhật không thể luôn dưới 0,5 giây vì thời gian build/hot reload phụ thuộc dự án.

## Development & release

```bash
npm install
npm test
npm run check
npm start
```

GitHub Actions xây dựng file setup Windows x64 và phát hành `latest.yml` để nút **Kiểm tra bản vá** cập nhật.

MIT License.
