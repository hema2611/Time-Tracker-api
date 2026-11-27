-- One person, one record: an employee can have a login (users row).
-- Email + access role on the employee decide the login; user_id links the two.
ALTER TABLE employees
  ADD COLUMN email VARCHAR(190) NULL AFTER name,
  ADD COLUMN access_role ENUM('admin','tl','developer','designer','tester') NULL AFTER role_id,
  ADD COLUMN user_id INT UNSIGNED NULL AFTER access_role,
  ADD UNIQUE KEY uq_employees_email (email),
  ADD UNIQUE KEY uq_employees_user (user_id),
  ADD CONSTRAINT fk_employees_user FOREIGN KEY (user_id) REFERENCES users(id);
