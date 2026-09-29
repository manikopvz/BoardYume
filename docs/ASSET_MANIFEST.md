# Asset manifest BoardYume

Nguồn dữ liệu máy đọc: `public/assets/manifest.json`. Manifest ghi `src`, `width`, `height`, định dạng, số frame, kích thước frame, thời lượng animation, tag và alias runtime.

## Tổng quan

| Nhóm | File hình chính | Dung lượng gần đúng | Kích thước / mục đích |
|---|---:|---:|---|
| Background | 1 WebP | 2.2 MB | 1774 × 887, thung lũng nhiều lớp và foreground parallax |
| Tiles | 10 WebP | 348 KB | 192 × 112 hoặc atlas crop 2.5D: cỏ, đất, luống, ẩm, đường, nước, bờ |
| Crops | 108 WebP | 2.5 MB | Hạt, 5 stage, product và animation wind/watered cho 12 cây |
| Buildings | 80 WebP | 2.2 MB | 20 công trình × normal/active/construction/shadow, phần lớn 320 × 280 |
| Characters | 40 PNG | 628 KB | 10 nhóm hành động × 4 hướng; sprite sheet 3–4 frame, frame 128 × 128 |
| Nature | 35 WebP | 932 KB | 3 biến thể cây/đá/bụi/cỏ/gốc, cây ăn quả, hoa, fence/gate |
| Items | 40 WebP | 408 KB | Tool, tài nguyên, vật liệu và sản phẩm; phần lớn 96 × 96 |
| UI | 18 WebP | 340 KB | Toolbar, slot, panel, nút, cursor và placement marker |
| Effects | 12 PNG | 644 KB | Sprite sheet sáu frame 768 × 128 và shadow raster |
| Audio | 19 OGG | 1.4 MB | 2 nhạc, 4 ambience, 13 SFX |

Tổng thư mục `public/assets`: khoảng 12 MB; 365 file vật lý gồm manifest/license. Manifest hiện có 784 entry sau khi tính alias và 344 file đồ họa duy nhất.

## Cây trồng

Mỗi cây có key `crop.<id>.seed`, `sown`, `sprout`, `young`, `mature`, `harvest`, `product`, `wind`, `watered`.

| ID | Tên hiển thị | Đặc trưng silhouette |
|---|---|---|
| carrot | Cà rốt | Lá tán nhỏ, củ cam lộ khỏi đất |
| tomato | Cà chua | Bụi phân nhánh, chùm quả đỏ |
| wheat | Lúa mì | Bụi thân mảnh, bông vàng |
| corn | Ngô | Lá dài cao, nhiều bắp |
| potato | Khoai tây | Bụi thấp, củ quanh gốc |
| strawberry | Dâu tây | Tán sát đất, hoa trắng và quả đỏ |
| pumpkin | Bí ngô | Dây bò rộng, quả lớn |
| cabbage | Bắp cải | Lá cuộn nhiều lớp |
| sunflower | Hướng dương | Thân cao, đầu hoa vàng |
| eggplant | Cà tím | Bụi hoa tím, quả dài |
| blueberry | Việt quất | Bụi dày, chùm quả xanh |
| watermelon | Dưa hấu | Dây bò, quả sọc xanh |

## Nhân vật

Các key `character.player.<action>.<direction>` gồm `idle`, `walk`, `chop`, `mine`, `hoe`, `water`, `sow`, `harvest`, `pickup`, `build`; hướng `down`, `up`, `left`, `right`.

## Âm thanh

| Nhóm | File | Thời lượng |
|---|---|---:|
| Music | `day-garden.ogg` | 32.8 giây |
| Music | `night-garden.ogg` | 37.1 giây |
| Ambience | `rain`, `birds`, `wind`, `insects` | 16.1–16.4 giây/file |
| SFX | `footstep`, `hoe`, `water`, `seed`, `harvest`, `chop`, `mine`, `pickup`, `build`, `complete`, `click`, `buy`, `sell` | 0.18–1.45 giây/file |

Mọi âm thanh là OGG Vorbis có header hợp lệ, không rỗng và được mixer HTMLAudioElement phát sau tương tác đầu tiên.

## Quy trình tái tạo

`python scripts/process-atlases.py` tái tạo/cắt/chuẩn hóa asset và viết lại manifest. Các atlas nghệ thuật nguồn được giữ ngoài commit; output cần thiết để chạy game đã nằm hoàn chỉnh trong `public/assets/`.

Sau mọi thay đổi asset, chạy:

```bash
npm run verify:assets
```

Verifier làm build thất bại nếu phát hiện asset thiếu/hỏng, sai đường dẫn/chữ hoa-thường, file rỗng/placeholder, remote asset, SVG, Canvas/WebGL hoặc output không được đóng gói.
