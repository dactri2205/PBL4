// Fictional company data. Every person, assignment and metric is for demonstration.
export const departments = [
  {
    id: "it",
    name: "Công nghệ thông tin",
    code: "IT",
    description:
      "Xây dựng nền tảng công nghệ vững chắc, kết nối con người và đơn giản hóa cách chúng ta làm việc mỗi ngày.",
    goal: "Hoàn thiện nền tảng làm việc số",
    goalDescription:
      "Chuẩn hóa trải nghiệm nội bộ và đưa các quy trình cốt lõi lên môi trường số trong quý IV.",
    progress: 72,
  },
  {
    id: "hr",
    name: "Nhân sự & Văn hóa",
    code: "HR",
    description:
      "Đồng hành cùng mỗi thành viên, xây dựng môi trường làm việc cởi mở và phát triển bền vững.",
    goal: "Nâng cao trải nghiệm nhân viên",
    goalDescription:
      "Cải tiến chương trình hội nhập và tổ chức các hoạt động kết nối trong quý IV.",
    progress: 60,
  },
];
export const users = [
  {
    id: "admin",
    name: "Trần Hoàng An",
    username: "hoangan",
    role: "ADMIN",
    departmentId: "it",
    job: "Quản trị hệ thống",
    status: "Active",
    photo: "an",
  },
  {
    id: "minh",
    name: "Nguyễn Quang Minh",
    username: "quangminh",
    role: "EMPLOYEE",
    departmentId: "it",
    job: "Kỹ sư Frontend",
    status: "Active",
    photo: "minh",
  },
  {
    id: "linh",
    name: "Lê Thùy Linh",
    username: "thuylinh",
    role: "EMPLOYEE",
    departmentId: "it",
    job: "Kỹ sư hệ thống",
    status: "Active",
    photo: "linh",
  },
  {
    id: "ha",
    name: "Phạm Ngọc Hà",
    username: "ngocha",
    role: "EMPLOYEE",
    departmentId: "hr",
    job: "Chuyên viên nhân sự",
    status: "Active",
    photo: "ha",
  },
  {
    id: "nam",
    name: "Vũ Thành Nam",
    username: "thanhnam",
    role: "EMPLOYEE",
    departmentId: "it",
    job: "Chuyên viên kiểm thử",
    status: "Active",
    photo: "nam",
  },
  {
    id: "mai",
    name: "Đỗ Thanh Mai",
    username: "thanhmai",
    role: "EMPLOYEE",
    departmentId: "it",
    job: "Thiết kế sản phẩm",
    status: "Active",
    photo: "mai",
  },
  {
    id: "phuc",
    name: "Bùi Đức Phúc",
    username: "ducphuc",
    role: "EMPLOYEE",
    departmentId: "hr",
    job: "Điều phối đào tạo",
    status: "Disabled",
    photo: null,
  },
];
// Public organizational profiles are independent of authentication roles.
export const leadershipUserIds = ["admin", "ha"];
export const directoryProfiles = [
  {
    id: "ceo",
    name: "Đặng Minh Khang",
    job: "Tổng giám đốc",
    departmentId: null,
    photo: "leader-khang",
    isLeader: true,
  },
  {
    id: "deputy",
    name: "Hoàng Bảo Ngọc",
    job: "Phó tổng giám đốc",
    departmentId: null,
    photo: "leader-ngoc",
    isLeader: true,
  },
  {
    id: "operations",
    name: "Phan Quốc Huy",
    job: "Giám đốc vận hành",
    departmentId: null,
    photo: "leader-huy",
    isLeader: true,
  },
];
export const directoryJobTitles = {
  admin: "Trưởng phòng Công nghệ thông tin",
  ha: "Trưởng phòng Nhân sự & Văn hóa",
};
export const projects = [
  {
    id: "alpha",
    name: "Cổng thông tin nội bộ",
    code: "ALPHA",
    departmentId: "it",
    description:
      "Một điểm kết nối cho thông tin, con người và công việc trong doanh nghiệp.",
    status: "In Progress",
    progress: 72,
    due: "2026-11-12",
    members: ["minh", "nam", "mai"],
  },
  {
    id: "beta",
    name: "Hạ tầng kết nối an toàn",
    code: "BETA",
    departmentId: "it",
    description:
      "Chuẩn hóa mạng nội bộ và môi trường truy cập cho các phòng ban.",
    status: "In Progress",
    progress: 45,
    due: "2026-11-25",
    members: ["linh", "admin"],
  },
  {
    id: "onboarding",
    name: "Hành trình hội nhập",
    code: "PEOPLE",
    departmentId: "hr",
    description:
      "Thiết kế trải nghiệm chào đón và bộ tài liệu dành cho thành viên mới.",
    status: "Pending",
    progress: 15,
    due: "2026-12-04",
    members: ["ha"],
  },
];
export const tasks = [
  {
    id: "t1",
    title: "Hoàn thiện giao diện trang chủ",
    description:
      "Hoàn thiện Hero, bộ thống kê và thanh điều hướng theo hệ thiết kế đã thống nhất. Kiểm tra hiển thị trên thiết bị di động và bàn phím.",
    projectId: "alpha",
    assignees: ["minh"],
    status: "In Progress",
    priority: "High",
    due: "2026-10-22",
    created: "2026-10-12",
  },
  {
    id: "t2",
    title: "Xây dựng bảng công việc cá nhân",
    description:
      "Hiển thị đúng công việc được phân công, hỗ trợ tìm kiếm và bộ lọc trạng thái. Mở chi tiết bằng ngăn bên phải.",
    projectId: "alpha",
    assignees: ["minh"],
    status: "Pending",
    priority: "Medium",
    due: "2026-10-26",
    created: "2026-10-14",
  },
  {
    id: "t3",
    title: "Chuẩn hóa bộ thành phần giao diện",
    description:
      "Thống nhất token màu sắc, kiểu chữ, nút và thẻ trạng thái. Bổ sung hỗ trợ giảm chuyển động.",
    projectId: "alpha",
    assignees: ["minh"],
    status: "Completed",
    priority: "Medium",
    due: "2026-10-15",
    created: "2026-10-10",
  },
  {
    id: "t4",
    title: "Rà soát khả năng truy cập",
    description:
      "Kiểm tra độ tương phản, thứ tự focus và nhãn cho các thành phần tương tác.",
    projectId: "alpha",
    assignees: ["minh"],
    status: "Pending",
    priority: "High",
    due: "2026-10-17",
    created: "2026-10-12",
  },
  {
    id: "t5",
    title: "Khảo sát cấu hình mạng nội bộ",
    description:
      "Lập danh sách các phân vùng mạng và đề xuất phương án phân quyền truy cập cho từng nhóm sử dụng.",
    projectId: "beta",
    assignees: ["linh"],
    status: "In Progress",
    priority: "High",
    due: "2026-10-23",
    created: "2026-10-13",
  },
  {
    id: "t6",
    title: "Chuẩn bị kế hoạch thử nghiệm Mini VPN",
    description:
      "Xác định kịch bản thử nghiệm kết nối, thiết bị tham gia và tiêu chí đánh giá. Đây là kế hoạch mẫu, chưa triển khai hạ tầng.",
    projectId: "beta",
    assignees: ["linh"],
    status: "Pending",
    priority: "Medium",
    due: "2026-10-28",
    created: "2026-10-15",
  },
  {
    id: "t7",
    title: "Biên soạn tài liệu chào đón",
    description:
      "Tổng hợp hướng dẫn hội nhập và thông tin liên hệ phòng ban dành cho thành viên mới.",
    projectId: "onboarding",
    assignees: ["ha"],
    status: "Pending",
    priority: "Low",
    due: "2026-11-02",
    created: "2026-10-16",
  },
  {
    id: "t8",
    title: "Kiểm thử luồng điều hướng",
    description:
      "Kiểm thử các trang công khai và trạng thái giao diện theo từng người dùng mẫu.",
    projectId: "alpha",
    assignees: ["nam"],
    status: "In Progress",
    priority: "Medium",
    due: "2026-10-24",
    created: "2026-10-16",
  },
];
export const announcements = [
  {
    id: "n1",
    title: "Kết nối và sẻ chia trong Ngày hội văn hóa tháng 10",
    category: "Hoạt động",
    date: "2026-10-19",
    summary:
      "Cùng gặp gỡ, chia sẻ những câu chuyện đáng nhớ và tiếp thêm năng lượng cho chặng đường phía trước.",
    body: [
      "Ngày hội văn hóa tháng 10 sẽ diễn ra vào lúc 15:00 ngày 30/10/2026 tại không gian sinh hoạt chung. Đây là dịp để các phòng ban gặp gỡ và chia sẻ những dấu ấn trong quý vừa qua.",
      "Chương trình gồm hoạt động giao lưu đội nhóm, góc chia sẻ sáng kiến và phần ghi nhận đóng góp của các thành viên. Mỗi phòng ban chuẩn bị một câu chuyện hoặc một sáng kiến muốn gửi đến đồng nghiệp.",
      "Bộ phận Nhân sự & Văn hóa sẽ gửi lịch chi tiết đến các phòng ban. Mong được gặp tất cả mọi người trong một buổi chiều nhiều kết nối.",
    ],
  },
  {
    id: "n2",
    title: "Lịch bảo trì hệ thống nội bộ cuối tuần",
    category: "Thông báo",
    date: "2026-10-17",
    summary:
      "Hệ thống được bảo trì định kỳ từ 20:00 đến 22:00 ngày 24/10. Vui lòng chủ động sắp xếp công việc.",
    body: [
      "Phòng Công nghệ thông tin dự kiến bảo trì hệ thống từ 20:00 đến 22:00 thứ Bảy, ngày 24/10/2026. Trong khoảng thời gian này, một số dịch vụ nội bộ có thể tạm thời gián đoạn.",
      "Đề nghị các thành viên lưu công việc trước thời điểm bảo trì. Thông báo hoàn tất sẽ được cập nhật tại bản tin này.",
    ],
  },
  {
    id: "n3",
    title: "Cập nhật hướng dẫn sử dụng không gian làm việc chung",
    category: "Chính sách",
    date: "2026-10-15",
    summary:
      "Một vài thói quen nhỏ giúp không gian chung luôn thuận tiện, ngăn nắp và thân thiện.",
    body: [
      "Không gian làm việc chung được dành cho hoạt động trao đổi nhóm và làm việc tập trung. Vui lòng đặt lịch phòng họp qua đầu mối hành chính và trả lại không gian gọn gàng sau khi sử dụng.",
      "Các thiết bị dùng chung cần được tắt khi kết thúc buổi làm việc. Nếu phát hiện thiết bị hỏng, hãy báo cho bộ phận phụ trách để được hỗ trợ.",
    ],
  },
  {
    id: "n4",
    title: "Khởi động chương trình chia sẻ kiến thức quý IV",
    category: "Đào tạo",
    date: "2026-10-12",
    summary:
      "Mỗi tuần một chủ đề mới, cùng học hỏi từ chính kinh nghiệm của đồng nghiệp.",
    body: [
      "Chương trình chia sẻ kiến thức quý IV bắt đầu từ tuần thứ ba của tháng 10. Các buổi chia sẻ tập trung vào kỹ năng phối hợp, bảo mật thông tin và sử dụng công cụ làm việc.",
      "Thành viên quan tâm có thể trao đổi với đại diện phòng Nhân sự & Văn hóa để đề xuất chủ đề và tham gia chia sẻ.",
    ],
  },
  {
    id: "n5",
    title: "Chào mừng các thành viên mới đến với An Việt",
    category: "Hoạt động",
    date: "2026-10-08",
    summary:
      "Những gương mặt mới, những góc nhìn mới và hành trình chung bắt đầu từ hôm nay.",
    body: [
      "An Việt chào đón các thành viên mới gia nhập trong tháng 10. Chúng ta cùng xây dựng một môi trường nơi mỗi người đều có cơ hội học hỏi và đóng góp.",
      "Các buổi giới thiệu phòng ban và hướng dẫn hội nhập sẽ được tổ chức trong tuần đầu tiên. Hãy dành một lời chào và sẵn sàng hỗ trợ những người đồng nghiệp mới.",
    ],
  },
];
export const notifications = [
  {
    id: "nt1",
    userId: "minh",
    title: "Bạn được giao việc: Hoàn thiện giao diện trang chủ",
    date: "2026-10-19",
    taskId: "t1",
    read: false,
  },
  {
    id: "nt2",
    userId: "minh",
    title: "Nhắc hạn: Rà soát khả năng truy cập",
    date: "2026-10-18",
    taskId: "t4",
    read: false,
  },
  {
    id: "nt3",
    userId: "minh",
    title: "Bộ thành phần giao diện đã hoàn thành",
    date: "2026-10-16",
    taskId: "t3",
    read: true,
  },
  {
    id: "nt4",
    userId: "linh",
    title: "Bạn được giao việc: Khảo sát cấu hình mạng nội bộ",
    date: "2026-10-19",
    taskId: "t5",
    read: false,
  },
  {
    id: "nt5",
    userId: "admin",
    title: "Kế hoạch bảo trì hệ thống đã được cập nhật",
    date: "2026-10-18",
    read: false,
  },
];
export const statistics = [
  {
    label: "Thành viên",
    action: "members",
    note: "Cùng chung một hành trình",
    icon: "users",
  },
  {
    label: "Phòng ban",
    action: "departments",
    note: "Kết nối chuyên môn, tạo giá trị",
    icon: "building",
  },
  {
    label: "Năm phát triển",
    value: "12",
    note: "Vững nền tảng, bền tương lai",
    icon: "spark",
  },
  {
    label: "Hoạt động năm 2026",
    value: "24",
    note: "Học hỏi và gắn kết cùng nhau",
    icon: "calendar",
  },
];
