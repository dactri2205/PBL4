ALTER TABLE users
  ADD COLUMN directory_job_title TEXT;

UPDATE users
SET directory_job_title = CASE id
  WHEN 'admin' THEN 'Trưởng phòng Công nghệ thông tin'
  WHEN 'ha' THEN 'Trưởng phòng Nhân sự & Văn hóa'
  ELSE NULL
END;
