INSERT INTO departments (id, name, code, description, goal, goal_description, progress) VALUES
  ('it', 'Công nghệ thông tin', 'IT', 'Xây dựng nền tảng công nghệ vững chắc, kết nối con người và đơn giản hóa cách chúng ta làm việc mỗi ngày.', 'Hoàn thiện nền tảng làm việc số', 'Chuẩn hóa trải nghiệm nội bộ và đưa các quy trình cốt lõi lên môi trường số trong quý IV.', 72),
  ('hr', 'Nhân sự & Văn hóa', 'HR', 'Đồng hành cùng mỗi thành viên, xây dựng môi trường làm việc cởi mở và phát triển bền vững.', 'Nâng cao trải nghiệm nhân viên', 'Cải tiến chương trình hội nhập và tổ chức các hoạt động kết nối trong quý IV.', 60);

INSERT INTO users (id, name, username, role, department_id, job_title, status, photo_key, is_department_lead) VALUES
  ('admin', 'Trần Hoàng An', 'hoangan', 'ADMIN', 'it', 'Quản trị hệ thống', 'Active', 'an', true),
  ('minh', 'Nguyễn Quang Minh', 'quangminh', 'EMPLOYEE', 'it', 'Kỹ sư Frontend', 'Active', 'minh', false),
  ('linh', 'Lê Thùy Linh', 'thuylinh', 'EMPLOYEE', 'it', 'Kỹ sư hệ thống', 'Active', 'linh', false),
  ('ha', 'Phạm Ngọc Hà', 'ngocha', 'EMPLOYEE', 'hr', 'Chuyên viên nhân sự', 'Active', 'ha', true),
  ('nam', 'Vũ Thành Nam', 'thanhnam', 'EMPLOYEE', 'it', 'Chuyên viên kiểm thử', 'Active', 'nam', false),
  ('mai', 'Đỗ Thanh Mai', 'thanhmai', 'EMPLOYEE', 'it', 'Thiết kế sản phẩm', 'Active', 'mai', false),
  ('phuc', 'Bùi Đức Phúc', 'ducphuc', 'EMPLOYEE', 'hr', 'Điều phối đào tạo', 'Disabled', NULL, false);

INSERT INTO directory_profiles (id, name, job_title, photo_key, is_leader) VALUES
  ('ceo', 'Đặng Minh Khang', 'Tổng giám đốc', 'leader-khang', true),
  ('deputy', 'Hoàng Bảo Ngọc', 'Phó tổng giám đốc', 'leader-ngoc', true),
  ('operations', 'Phan Quốc Huy', 'Giám đốc vận hành', 'leader-huy', true);

INSERT INTO projects (id, name, code, department_id, description, status, progress, due_date) VALUES
  ('alpha', 'Cổng thông tin nội bộ', 'ALPHA', 'it', 'Một điểm kết nối cho thông tin, con người và công việc trong doanh nghiệp.', 'In Progress', 72, '2026-11-12'),
  ('beta', 'Hạ tầng kết nối an toàn', 'BETA', 'it', 'Chuẩn hóa mạng nội bộ và môi trường truy cập cho các phòng ban.', 'In Progress', 45, '2026-11-25'),
  ('onboarding', 'Hành trình hội nhập', 'PEOPLE', 'hr', 'Thiết kế trải nghiệm chào đón và bộ tài liệu dành cho thành viên mới.', 'Pending', 15, '2026-12-04');

INSERT INTO project_members (project_id, user_id) VALUES
  ('alpha', 'minh'), ('alpha', 'nam'), ('alpha', 'mai'),
  ('beta', 'linh'), ('beta', 'admin'),
  ('onboarding', 'ha');

INSERT INTO tasks (id, project_id, title, description, status, priority, due_date, created_at) VALUES
  ('t1', 'alpha', 'Hoàn thiện giao diện trang chủ', 'Hoàn thiện Hero, bộ thống kê và thanh điều hướng theo hệ thiết kế đã thống nhất. Kiểm tra hiển thị trên thiết bị di động và bàn phím.', 'In Progress', 'High', '2026-10-22', '2026-10-12'),
  ('t2', 'alpha', 'Xây dựng bảng công việc cá nhân', 'Hiển thị đúng công việc được phân công, hỗ trợ tìm kiếm và bộ lọc trạng thái. Mở chi tiết bằng ngăn bên phải.', 'Pending', 'Medium', '2026-10-26', '2026-10-14'),
  ('t3', 'alpha', 'Chuẩn hóa bộ thành phần giao diện', 'Thống nhất token màu sắc, kiểu chữ, nút và thẻ trạng thái. Bổ sung hỗ trợ giảm chuyển động.', 'Completed', 'Medium', '2026-10-15', '2026-10-10'),
  ('t4', 'alpha', 'Rà soát khả năng truy cập', 'Kiểm tra độ tương phản, thứ tự focus và nhãn cho các thành phần tương tác.', 'Pending', 'High', '2026-10-17', '2026-10-12'),
  ('t5', 'beta', 'Khảo sát cấu hình mạng nội bộ', 'Lập danh sách các phân vùng mạng và đề xuất phương án phân quyền truy cập cho từng nhóm sử dụng.', 'In Progress', 'High', '2026-10-23', '2026-10-13'),
  ('t6', 'beta', 'Chuẩn bị kế hoạch thử nghiệm Mini VPN', 'Xác định kịch bản thử nghiệm kết nối, thiết bị tham gia và tiêu chí đánh giá. Đây là kế hoạch mẫu, chưa triển khai hạ tầng.', 'Pending', 'Medium', '2026-10-28', '2026-10-15'),
  ('t7', 'onboarding', 'Biên soạn tài liệu chào đón', 'Tổng hợp hướng dẫn hội nhập và thông tin liên hệ phòng ban dành cho thành viên mới.', 'Pending', 'Low', '2026-11-02', '2026-10-16'),
  ('t8', 'alpha', 'Kiểm thử luồng điều hướng', 'Kiểm thử các trang công khai và trạng thái giao diện theo từng người dùng mẫu.', 'In Progress', 'Medium', '2026-10-24', '2026-10-16');

INSERT INTO task_assignees (task_id, user_id) VALUES
  ('t1', 'minh'), ('t2', 'minh'), ('t3', 'minh'), ('t4', 'minh'),
  ('t5', 'linh'), ('t6', 'linh'), ('t7', 'ha'), ('t8', 'nam');

INSERT INTO announcements (id, title, category, published_on, summary, body) VALUES
  ('n1', 'Kết nối và sẻ chia trong Ngày hội văn hóa tháng 10', 'Hoạt động', '2026-10-19', 'Cùng gặp gỡ, chia sẻ những câu chuyện đáng nhớ và tiếp thêm năng lượng cho chặng đường phía trước.', '["Ngày hội văn hóa tháng 10 sẽ diễn ra lúc 15:00 ngày 30/10/2026 tại không gian sinh hoạt chung.", "Chương trình gồm hoạt động giao lưu đội nhóm, góc chia sẻ sáng kiến và phần ghi nhận đóng góp.", "Bộ phận Nhân sự & Văn hóa sẽ gửi lịch chi tiết đến các phòng ban."]'::jsonb),
  ('n2', 'Lịch bảo trì hệ thống nội bộ cuối tuần', 'Thông báo', '2026-10-17', 'Hệ thống được bảo trì định kỳ từ 20:00 đến 22:00 ngày 24/10. Vui lòng chủ động sắp xếp công việc.', '["Phòng Công nghệ thông tin dự kiến bảo trì hệ thống từ 20:00 đến 22:00 thứ Bảy, ngày 24/10/2026.", "Đề nghị các thành viên lưu công việc trước thời điểm bảo trì."]'::jsonb),
  ('n3', 'Cập nhật hướng dẫn sử dụng không gian làm việc chung', 'Chính sách', '2026-10-15', 'Một vài thói quen nhỏ giúp không gian chung luôn thuận tiện, ngăn nắp và thân thiện.', '["Không gian làm việc chung được dành cho hoạt động trao đổi nhóm và làm việc tập trung.", "Các thiết bị dùng chung cần được tắt khi kết thúc buổi làm việc."]'::jsonb),
  ('n4', 'Khởi động chương trình chia sẻ kiến thức quý IV', 'Đào tạo', '2026-10-12', 'Mỗi tuần một chủ đề mới, cùng học hỏi từ chính kinh nghiệm của đồng nghiệp.', '["Chương trình chia sẻ kiến thức quý IV bắt đầu từ tuần thứ ba của tháng 10.", "Thành viên quan tâm có thể đề xuất chủ đề và tham gia chia sẻ."]'::jsonb),
  ('n5', 'Chào mừng các thành viên mới đến với An Việt', 'Hoạt động', '2026-10-08', 'Những gương mặt mới, những góc nhìn mới và hành trình chung bắt đầu từ hôm nay.', '["An Việt chào đón các thành viên mới gia nhập trong tháng 10.", "Các buổi giới thiệu phòng ban và hướng dẫn hội nhập sẽ được tổ chức trong tuần đầu tiên."]'::jsonb);

INSERT INTO notifications (id, user_id, title, notification_date, task_id, is_read) VALUES
  ('nt1', 'minh', 'Bạn được giao việc: Hoàn thiện giao diện trang chủ', '2026-10-19', 't1', false),
  ('nt2', 'minh', 'Nhắc hạn: Rà soát khả năng truy cập', '2026-10-18', 't4', false),
  ('nt3', 'minh', 'Bộ thành phần giao diện đã hoàn thành', '2026-10-16', 't3', true),
  ('nt4', 'linh', 'Bạn được giao việc: Khảo sát cấu hình mạng nội bộ', '2026-10-19', 't5', false),
  ('nt5', 'admin', 'Kế hoạch bảo trì hệ thống đã được cập nhật', '2026-10-18', NULL, false);
