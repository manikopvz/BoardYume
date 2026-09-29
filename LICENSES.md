# Nguồn gốc và giấy phép tài nguyên

BoardYume không tải nóng hình ảnh, âm thanh, font hoặc icon từ dịch vụ bên ngoài. Bản production chỉ sử dụng tài nguyên được lưu trong repository.

## Đồ họa raster

Toàn bộ hình ảnh trong `public/assets/` là tài nguyên nguyên bản được tạo riêng cho BoardYume. Các atlas đầu vào do công cụ tạo ảnh hỗ trợ AI tạo theo mô tả nghệ thuật riêng của dự án; sau đó được cắt, chuẩn hóa và đóng gói thành PNG/WebP nội bộ. Không có sprite, giao diện hoặc hình ảnh trích xuất từ game thương mại.

Quyền sử dụng các tài nguyên nguyên bản này thuộc chủ sở hữu repository BoardYume. Không có tài nguyên đồ họa bên thứ ba cần ghi công.

## Âm thanh

Toàn bộ file OGG trong `public/assets/audio/` được tổng hợp thủ tục riêng cho dự án bằng FFmpeg 6.1.1/Lavfi (`sine`, `anoisesrc` và các bộ lọc âm thanh). Không sử dụng bản ghi, sample, giai điệu hoặc media tải từ bên thứ ba.

Quyền sử dụng các file âm thanh nguyên bản này thuộc chủ sở hữu repository BoardYume. FFmpeg chỉ là công cụ tạo/encode và không được phân phối kèm game.

## Mã nguồn và công cụ build

- Runtime production không nhúng thư viện game, icon font, Canvas/WebGL renderer hay mã từ CDN.
- Vite được dùng ở bước phát triển/build theo giấy phép MIT; Vite không được nhúng như một runtime CDN.
- jsdom được dùng riêng trong kiểm thử khởi động DOM theo giấy phép MIT; không được đóng gói vào runtime production.
- Node.js được dùng để chạy test và script kiểm tra, không phải runtime của trò chơi trên trình duyệt.

Nếu bổ sung tài nguyên bên thứ ba trong tương lai, phải ghi rõ tên, tác giả, URL nguồn, phiên bản và giấy phép tại file này trước khi merge.
