# UAT Phase 1F-A — Báo cáo

Owner xác nhận trên dữ liệu tổng hợp Cloud trước khi mở Phase 1F-B.

- Dashboard hôm nay hiển thị đúng tồn, cảnh báo hàng, chứng từ chờ và doanh thu theo quyền.
- Khoảng Hôm nay/Tuần này/Tháng này/Tùy chọn dùng đúng ngày Việt Nam.
- Nhân viên chỉ thấy doanh thu phạm vi được cấp; không có giá vốn/lợi nhuận trong UI, network response hay XLSX.
- Owner đối soát `doanh thu thuần - giá vốn thuần = lợi nhuận gộp`, có sự kiện bán/trả/hủy đúng ngày phát sinh.
- Breakdown kênh bán giữ lịch sử kênh đã tắt; trả hàng dùng phương thức hoàn tiền.
- XLSX có đủ sheet và tổng tiền trùng DTO server.
- Định giá tồn owner-only tìm kiếm, phân trang và không hiển thị cho nhân viên.
- Desktop/mobile, offline/loading/error và nút Làm mới hoạt động bằng tiếng Việt.

Không ký UAT khi còn migration history lệch, Cloud security test thất bại hoặc còn test profile/data tổng hợp.
