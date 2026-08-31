BEGIN;
INSERT INTO organisations(id,name,slug) VALUES ('00000000-0000-4000-8000-000000000001','GoalVow Platform','goalvow');
INSERT INTO applications(id,organisation_id,name,slug) VALUES
('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','PlugConnect','plugconnect'),
('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','GoalVow Academies','goalvow-academies'),
('10000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','VowLMS','vowlms'),
('10000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','VowSupport','vowsupport');
INSERT INTO identities(id,organisation_id,owner_name,display_name,provenance,geographic_scope,commercial_use_confirmed,state,expires_at) VALUES
('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','GoalVow original placeholder','Thandi Mokoena','{"type":"original-ai-placeholder","actor_media":false}','{ZA}',true,'approved','2027-12-31'),
('20000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','GoalVow original placeholder','Sipho Daniels','{"type":"original-ai-placeholder","actor_media":false}','{ZA}',true,'approved','2027-12-31'),
('20000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','GoalVow synthetic asset','GoalVow Tutor','{"type":"original-ai-placeholder","actor_media":false}','{ZA}',true,'approved','2030-12-31');
INSERT INTO digital_humans(id,organisation_id,identity_id,name,role,disclosure,state) VALUES
('30000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Thandi Mokoena','Talent Partner','Fictional AI-generated practice interviewer','active'),
('30000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','Sipho Daniels','Recruitment Consultant','Fictional AI-generated practice interviewer','active'),
('30000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000003','GoalVow Tutor','Digital Course Facilitator','AI-generated course presenter','active');
INSERT INTO personas(id,organisation_id,name,description) VALUES
('40000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','PlugConnect Professional Practice Interviewer','Private candidate-owned interview practice'),
('40000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','GoalVow Course Tutor','Cited curriculum-grounded facilitator'),
('40000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','Career Coach','Non-clinical career coaching'),
('40000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','Learning Mentor','Supportive learning companion'),
('40000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000001','Support Adviser','Scoped customer support');
COMMIT;
