-- Reimbursements: approve/decline is replaced by a payment status.
-- unpaid (default) -> pending / hold / paid, set by someone with edit access. cancelled = withdrawn.
UPDATE reimbursements SET status = 'pending' WHERE status = 'approved';
UPDATE reimbursements SET status = 'hold' WHERE status = 'rejected';
ALTER TABLE reimbursements
  MODIFY status ENUM('unpaid','pending','hold','paid','cancelled','approved','rejected') NOT NULL DEFAULT 'unpaid';
ALTER TABLE reimbursements
  MODIFY status ENUM('unpaid','pending','hold','paid','cancelled') NOT NULL DEFAULT 'unpaid';

-- Work Allotment: one allotment = a team, then one or more project blocks.
-- Each block has its employees and a list of works (stored as a JSON array of strings).
CREATE TABLE IF NOT EXISTS work_allotments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  team ENUM('website','application') NOT NULL,
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_wa_creator FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS work_allotment_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  allotment_id INT UNSIGNED NOT NULL,
  project_id INT UNSIGNED NOT NULL,
  works TEXT NOT NULL,
  UNIQUE KEY uq_wa_project (allotment_id, project_id),
  CONSTRAINT fk_wai_allotment FOREIGN KEY (allotment_id) REFERENCES work_allotments(id) ON DELETE CASCADE,
  CONSTRAINT fk_wai_project FOREIGN KEY (project_id) REFERENCES project_master(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS work_allotment_members (
  item_id INT UNSIGNED NOT NULL,
  employee_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (item_id, employee_id),
  INDEX idx_wam_employee (employee_id),
  CONSTRAINT fk_wam_item FOREIGN KEY (item_id) REFERENCES work_allotment_items(id) ON DELETE CASCADE,
  CONSTRAINT fk_wam_employee FOREIGN KEY (employee_id) REFERENCES employees(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Every role may see the work allotted to them. Assigning needs create; seeing everyone's needs edit.
INSERT IGNORE INTO role_permissions (role_id, module_key, can_view)
SELECT id, 'work_allotment', 1 FROM roles;
