SET NAMES utf8mb4;
INSERT IGNORE INTO vhm_organisations(id,name,slug,status,settings_json) VALUES
('00000000-0000-4000-8000-000000000001','GoalVow Platform','goalvow','active','{}');

INSERT IGNORE INTO vhm_applications(id,organisation_id,name,slug,status,settings_json) VALUES
('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','PlugConnect','plugconnect','active','{}'),
('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','GoalVow Academies','goalvow-academies','active','{}'),
('10000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','VowLMS','vowlms','active','{}'),
('10000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','VowSupport','vowsupport','sandbox','{}');

INSERT IGNORE INTO vhm_identities(id,organisation_id,owner_name,display_name,source_provenance,geographic_scope,commercial_use_confirmed,consent_complete,consent_status,expires_at) VALUES
('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','GoalVow original placeholder','Thandi Mokoena','Original AI-generated placeholder; no actor source media','South Africa',1,1,'approved','2027-12-31 23:59:59'),
('20000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','GoalVow original placeholder','Sipho Daniels','Original AI-generated placeholder; no actor source media','South Africa',1,1,'approved','2027-12-31 23:59:59'),
('20000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','GoalVow synthetic asset','GoalVow Tutor','Original AI-generated placeholder; no actor source media','South Africa',1,1,'approved','2030-12-31 23:59:59');

INSERT IGNORE INTO vhm_digital_humans(id,organisation_id,identity_id,name,role,disclosure,status) VALUES
('30000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Thandi Mokoena','Talent Partner','Fictional AI-generated practice interviewer','active'),
('30000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','Sipho Daniels','Recruitment Consultant','Fictional AI-generated practice interviewer','active'),
('30000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000003','GoalVow Tutor','Digital Course Facilitator','AI-generated course presenter','active');

INSERT IGNORE INTO vhm_personas(id,organisation_id,name,description) VALUES
('40000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','PlugConnect Professional Practice Interviewer','Private candidate-owned interview practice'),
('40000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','GoalVow Course Tutor','Curriculum-grounded cited tutor'),
('40000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','Career Coach','Non-clinical career coach'),
('40000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','Learning Mentor','Supportive learning mentor'),
('40000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000001','Support Adviser','Scoped support adviser');
