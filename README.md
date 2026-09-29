# BoardYume — Vườn Mộng

BoardYume là web game sandbox xây vườn 2.5D chạy hoàn toàn bằng DOM và asset raster cục bộ. Trò chơi không dùng Canvas, WebGL, SVG, icon font, emoji làm asset, game engine render hay CDN runtime.

## Gameplay đã triển khai

- Bản đồ isometric 28 × 28, camera kéo/zoom, depth sorting theo tọa độ và chỉ render phần nhìn thấy.
- Nhân vật có sprite sheet raster cho đứng, đi bốn hướng, chặt, đào đá, cuốc, tưới, gieo, thu hoạch, nhặt và xây.
- Thu thập gỗ, đá, sợi, đất sét, quặng, nước, than, gỗ cứng và trái cây; tài nguyên có độ bền và hồi sinh.
- 12 cây trồng riêng: cà rốt, cà chua, lúa mì, ngô, khoai tây, dâu tây, bí ngô, bắp cải, hướng dương, cà tím, việt quất và dưa hấu. Mỗi cây có hạt, năm giai đoạn, nông sản, animation gió/tưới và hiệu ứng thu hoạch.
- Vòng lặp đầy đủ: cuốc đất → chọn hạt → gieo → tưới từng giai đoạn → chờ phát triển → thu hoạch → bán/chế biến.
- 20 công trình: ba cấp nhà chính, kho, xưởng gỗ, xưởng đá, giếng, cối xay, nhà kính, chuồng, bếp, chợ, lò luyện, cầu, hàng rào, cổng, đèn, ghế, biển và cổng hoa.
- Kiểm tra va chạm/footprint, preview hợp lệ–không hợp lệ, xây theo thời gian, xoay, di chuyển và phá dỡ có hoàn vật liệu.
- 12 công thức sản xuất, hàng đợi chế tạo theo thời gian và sản phẩm chế biến.
- Cửa hàng hạt giống, bán vật phẩm, hệ số chợ, kinh nghiệm, mở khóa, mở rộng đất, nâng cấp nhà và chuỗi nhiệm vụ.
- Chu kỳ ngày/đêm, thời tiết, mưa, đom đóm, khói, nước, bụi xây dựng và effect raster nhiều frame.
- 19 file âm thanh OGG thật: nhạc ngày/đêm, ambience mưa/chim/gió/côn trùng và 13 SFX. Có volume nhạc/SFX, mute và chính sách mở khóa sau tương tác đầu tiên.
- Autosave, lưu/tải thủ công, game mới có xác nhận, migration save version 0–3 và tiếp tục đúng trạng thái sau reload.
- Desktop, bàn phím, chuột, màn hình cảm ứng, camera drag, pinch/wheel zoom và tap-to-move.
- PWA/service worker tải trước toàn bộ asset manifest để chơi offline sau lần tải đầu.

## Điều khiển

| Thao tác | Desktop | Mobile |
|---|---|---|
| Di chuyển | WASD / phím mũi tên | Chọn tay rồi chạm ô đất |
| Dùng công cụ | Phím `1`–`7`, sau đó chạm ô | Chạm thanh công cụ rồi chạm ô |
| Kéo camera | Kéo chuột | Kéo một ngón |
| Zoom | Con lăn | Chụm hai ngón / nút `+` `−` |
| Tương tác | `Space` hoặc công cụ tay | Công cụ tay |
| Mở bảng | `B`, `I`, `C`, `M`, `Q` | Nút menu |
| Tạm dừng | `P` | Nút đồng hồ |
| Hủy đặt công trình | `Esc` | Chọn công cụ khác |

## Chạy local

Yêu cầu Node.js 22 trở lên.

```bash
npm install
npm run dev
```

Vite sẽ in URL local. Nếu môi trường không cho bind toàn bộ interface, dùng:

```bash
npx vite --host 127.0.0.1
```

## Build và kiểm thử

```bash
npm run check
npm run build
npm run preview
```

`npm run check` chạy theo thứ tự:

1. `verify:assets`: cấm SVG/Canvas/WebGL/CDN/icon font/emoji asset, kiểm tra header, file rỗng, placeholder, đường dẫn, chữ hoa/thường và asset trong production.
2. 18 kiểm thử gameplay/save/build/DOM startup.
3. Production build Vite với đường dẫn tương đối, tương thích GitHub Pages subdirectory.

Build nằm tại `dist/`. Workflow `.github/workflows/ci.yml` chạy quality gate và tải artifact production cho mỗi push/PR.

## Kiến trúc

```text
src/game       boot, state, fixed-step loop
src/data       item, crop, building, recipe, quest catalogs
src/systems    farming, gathering, building, crafting, economy, time
src/render     DOM renderer, entity pool, isometric projection/depth
src/input      keyboard, pointer/touch/pinch
src/ui         HUD, panel, tutorial, notifications
src/audio      HTMLAudioElement mixer
src/save       save schema, migration, autosave
public/assets  raster art, sprite sheets, effects, UI and OGG audio
scripts        asset pipeline and mandatory verifier
tests          gameplay, save, build and DOM startup tests
```

Chi tiết asset nằm trong [docs/ASSET_MANIFEST.md](docs/ASSET_MANIFEST.md). Nguồn gốc và quyền sử dụng nằm trong [LICENSES.md](LICENSES.md).

## Cam kết render

- Không có file `.svg`, chuỗi SVG data URI, `<canvas>`, `getContext`, `OffscreenCanvas` hoặc WebGL.
- Không có Phaser, PixiJS, Three.js, Babylon.js hay dependency render Canvas/WebGL.
- Cảnh vật, tile, cây, công trình, nhân vật, công cụ, vật phẩm, UI texture và effect đều là PNG/WebP raster thật trong repository.
- CSS chỉ định vị, crop sprite sheet, scale, opacity, filter phản hồi và chuyển động; không dùng CSS shape/gradient để giả asset trò chơi.

