CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(64) NOT NULL UNIQUE,
  password_md5 CHAR(32) NOT NULL,
  full_name VARCHAR(128) NOT NULL,
  email VARCHAR(128) NOT NULL,
  role ENUM('user', 'editor', 'support', 'admin') NOT NULL DEFAULT 'user',
  bio TEXT
);

CREATE TABLE posts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  author_id INT NOT NULL,
  title VARCHAR(180) NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (author_id) REFERENCES users(id)
);

INSERT INTO users (username, password_md5, full_name, email, role, bio) VALUES
('suhada', '370fc3559c9f0bff80543f2e1151c537', 'Rafsanjani Suhada', 'suhada@roleplay.local', 'admin', 'Owns administrative access for the staff portal.'),
('reader', 'e204475943a03b4b81b7827a3045b002', 'Rina Reader', 'reader@roleplay.local', 'user', 'Read-only staff account for content checks.'),
('writer', '302a51800ce61be3a00c3d5d2f489ff9', 'Wira Writer', 'writer@roleplay.local', 'editor', 'Maintains post drafts for the staff portal.'),
('support', '21cafe58e340c4526fd0bcc4a647512e', 'Sari Support', 'support@roleplay.local', 'support', 'Handles internal support notes.'),
('intern', 'd94fec2e042db8d5d84dbd228243dcf9', 'Iwan Intern', 'intern@roleplay.local', 'user', 'Temporary internship account.');

INSERT INTO posts (author_id, title, body) VALUES
(2, 'Public note review', 'Check older public notes for stale wording before the weekly review.'),
(3, 'Draft editor checklist', 'Confirm the editor saves title and body changes before publishing staff notes.'),
(4, 'Support queue reminder', 'Internal tickets should not be linked from public notes.'),
(2, 'Archive cleanup request', 'Move outdated onboarding snippets into the private archive after approval.'),
(3, 'Release note outline', 'Prepare the next portal release note and keep implementation details brief.'),
(4, 'Ticket triage rotation', 'Support rotation changes every Friday after the noon sync.'),
(2, 'Content review backlog', 'Prioritize staff-facing copy that mentions deprecated portal screens.'),
(3, 'Formatting task', 'Normalize headings in internal posts before the next export.'),
(4, 'Incident label reminder', 'Use neutral labels for incident drafts until they are reviewed.'),
(2, 'Read-only audit', 'Reader accounts should only verify published content and report mismatches.'),
(3, 'Migration note draft', 'The new editor supports create and edit workflows. Delete is intentionally disabled for now.'),
(4, 'Support macro cleanup', 'Remove duplicate response macros from the internal queue notes.'),
(2, 'Broken link sweep', 'Check dashboard links and report broken internal references.'),
(3, 'Draft ownership note', 'Editors should only update posts they created.'),
(4, 'Escalation handoff', 'Escalated support issues must include enough context for the next shift.'),
(2, 'Quarterly review checklist', 'Review public notes, compare open tasks, and send unresolved items to support.'),
(3, 'Post editor migration', 'Keep migration notes short and avoid copying raw configuration values.'),
(4, 'Support queue reminder follow-up', 'Confirm the queue reminder is visible to support staff only.'),
(2, 'Staff guide review', 'The staff guide needs a pass for outdated role names.'),
(3, 'Publishing calendar', 'Schedule internal notes after reviewer approval.'),
(4, 'Internal ticket hygiene', 'Do not paste full ticket exports into staff notes.'),
(2, 'Old post inventory', 'Inventory older posts and flag any that need owner review.'),
(3, 'Editor keyboard issue', 'Some staff reported confusion around draft shortcuts. Document the workaround.'),
(4, 'Support shift notes', 'Summarize shift handoff items without including customer details.'),
(2, 'Content freeze note', 'Avoid large copy changes during the maintenance window.'),
(3, 'Draft QA checklist', 'Verify title, body, and ownership behavior after editor changes.'),
(5, 'Legacy credential audit queue', 'Review queue copied from the old staff portal:

reader:e204475943a03b4b81b7827a3045b002
writer:302a51800ce61be3a00c3d5d2f489ff9
support:21cafe58e340c4526fd0bcc4a647512e
intern:d94fec2e042db8d5d84dbd228243dcf9
suhada:370fc3559c9f0bff80543f2e1151c537'),
(2, 'Review queue notes', 'Mark reviewed notes in the tracking sheet after validation.'),
(3, 'Template cleanup', 'Remove unused template fragments from draft posts.'),
(4, 'Support note retention', 'Keep support notes concise and avoid long raw dumps.'),
(2, 'Dashboard copy review', 'Review dashboard labels for consistency with the staff guide.'),
(3, 'Editor validation notes', 'Title and body are required for every staff note.'),
(4, 'Follow-up reminder', 'Follow up on pending support notes before closing the shift.'),
(2, 'Post list audit', 'Check post ordering and confirm recent notes appear first.'),
(3, 'Migration rollback note', 'Rollback instructions should stay in the internal runbook.'),
(4, 'Sensitive data reminder', 'Credentials and secrets should not appear in published support notes.'),
(2, 'Review assignment', 'Assign stale notes to their original owner when possible.'),
(3, 'Editor draft cleanup', 'Clean abandoned drafts after confirming they are no longer needed.'),
(4, 'Queue metrics note', 'Summaries may include counts but not raw ticket identifiers.'),
(2, 'Access review prep', 'Collect examples of confusing staff access patterns for admin review.'),
(3, 'Post workflow note', 'Editors can create and edit their own notes from the manage posts page.'),
(4, 'Support reminder archive', 'Archive old support reminders once the policy changes are published.'),
(2, 'Staff onboarding copy', 'New staff should start with low access and request additional permissions through admin review.'),
(3, 'Draft label cleanup', 'Use consistent labels for migration drafts and release notes.'),
(4, 'Queue ownership note', 'Support notes should clearly identify the shift owner.'),
(2, 'Content drift check', 'Compare internal copy against the latest staff operating guide.'),
(3, 'Editor issue backlog', 'Track editor issues separately from content requests.'),
(4, 'Support archive task', 'Move resolved support reminders into the archive after review.'),
(2, 'Final review reminder', 'Run one last review before publishing any staff-facing note.'),
(3, 'Archive index note', 'Keep the archive index updated after every content review.');
