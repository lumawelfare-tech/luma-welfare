-- Luma Welfare — seed data
-- The 12 confirmed packages from the build spec (Section 4). Package data is
-- stored in tables and admin-editable — this seed is the starting point only.
-- Run AFTER schema.sql.

-- ---------------------------------------------------------------------------
-- Packages
-- ---------------------------------------------------------------------------
insert into packages (code, name, description, coverage, waiting_period_months, sort_order) values
('welfare', 'Welfare Package (incl. Burial Support)',
 'Burial support, family emergencies and compassion support for the member, their nuclear family and extended family (if registered). Contributions must stay current.',
 'Burial support Family emergencies Compassion support', '', 1),
('hospital', 'Hospital Insurance (Outpatient)',
 'Outpatient cover: consultation, lab tests, medicine and other approved outpatient services.',
 'Consultation Lab tests Medicine Approved outpatient services', '12', 2),
('education', 'Education Support',
 'School, college and university fees, and exam fees for the member or their registered dependents.',
 'School fees College fees University fees Exam fees', '6', 3),
('business', 'Business Support',
 'Capital for stock, equipment and expansion for member businesses.',
 'Stock Equipment Expansion capital', '12', 4),
('building', 'Building Support',
 'Materials, house improvement, roofing and finishing costs.',
 'Materials House improvement Roofing Finishing', '12', 5),
('land', 'Land Purchase Support',
 'Purchase of residential or farming land.',
 'Residential land Farming land', '12', 6),
('farming', 'Farming Support',
 'Seeds, fertilizer, inputs and irrigation for member farms.',
 'Seeds Fertilizer Farm inputs Irrigation', '12', 7),
('wedding', 'Wedding Support',
 'Wedding expenses and event preparation.',
 'Wedding expenses Event preparation', '12', 8),
('dowry', 'Dowry/Ruracio Support',
 'Costs of the traditional marriage ceremony.',
 'Traditional ceremony costs', '12', 9),
('disaster', 'Disaster Relief Support',
 'Fire, flood, storm damage and other approved emergencies.',
 'Fire damage Flood damage Storm damage Approved emergencies', '12', 10),
('youth', 'Youth Empowerment Support',
 'Vocational training, tools and skills development for young members.',
 'Vocational training Tools Skills development', '12', 11),
('senior', 'Senior Citizen Support',
 'Emergency assistance and welfare support for elderly members.',
 'Emergency assistance Elderly welfare', '12', 12);

-- ---------------------------------------------------------------------------
-- Contribution tiers
-- ---------------------------------------------------------------------------
-- Welfare Package: three tiers. Others: one flat tier matching the spec.
insert into package_tiers (package_id, name, amount, sort_order) values
((select id from packages where code = 'welfare'), 'Individual', 100, 1),
((select id from packages where code = 'welfare'), 'Nuclear Family', 300, 2),
((select id from packages where code = 'welfare'), 'Extended Family', 500, 3),
((select id from packages where code = 'hospital'), 'Individual', 1200, 1),
((select id from packages where code = 'education'), 'Individual', 1200, 1),
((select id from packages where code = 'business'), 'Individual', 2000, 1),
((select id from packages where code = 'building'), 'Individual', 2000, 1),
((select id from packages where code = 'land'), 'Individual', 2000, 1),
((select id from packages where code = 'farming'), 'Individual', 2000, 1),
((select id from packages where code = 'wedding'), 'Individual', 2000, 1),
((select id from packages where code = 'dowry'), 'Individual', 2000, 1),
((select id from packages where code = 'disaster'), 'Individual', 2000, 1),
((select id from packages where code = 'youth'), 'Individual', 2000, 1),
((select id from packages where code = 'senior'), 'Individual', 2000, 1);

-- ---------------------------------------------------------------------------
-- Qualification rules per package — consumed by the engine (Section 5)
-- ---------------------------------------------------------------------------
insert into package_rules (package_id, key, value, description) values
-- Welfare: no fixed waiting period; eligibility is an ongoing condition of
-- keeping contributions current. Arrears beyond 1 month put cover at risk.
((select id from packages where code = 'welfare'), 'waiting_period_months', '', 'No fixed waiting period.'),
((select id from packages where code = 'welfare'), 'requires_current_contributions', 'True', 'Contributions must stay current to remain covered.'),
((select id from packages where code = 'welfare'), 'arrears_allowed_months', '1', 'Cover stays active up to this many unpaid months.'),
((select id from packages where code = 'welfare'), 'max_arrears_months', '2', 'Beyond this, burial/emergency cover is at risk.'),
((select id from packages where code = 'welfare'), 'min_contributions', '0', 'No minimum count.'),
-- Standard 12-month packages
((select id from packages where code = 'hospital'), 'waiting_period_months', '12', '12 months of contributions.'),
((select id from packages where code = 'hospital'), 'min_contributions', '12', 'At least 12 contributions.'),
((select id from packages where code = 'hospital'), 'requires_current_contributions', 'True', 'Contributions must be current.'),
((select id from packages where code = 'business'), 'waiting_period_months', '12', '12 months of contributions.'),
((select id from packages where code = 'business'), 'min_contributions', '12', 'At least 12 contributions.'),
((select id from packages where code = 'building'), 'waiting_period_months', '12', '12 months of contributions.'),
((select id from packages where code = 'building'), 'min_contributions', '12', 'At least 12 contributions.'),
((select id from packages where code = 'land'), 'waiting_period_months', '12', '12 months of contributions.'),
((select id from packages where code = 'land'), 'min_contributions', '12', 'At least 12 contributions.'),
((select id from packages where code = 'farming'), 'waiting_period_months', '12', '12 months of contributions.'),
((select id from packages where code = 'farming'), 'min_contributions', '12', 'At least 12 contributions.'),
((select id from packages where code = 'wedding'), 'waiting_period_months', '12', '12 months of contributions.'),
((select id from packages where code = 'wedding'), 'min_contributions', '12', 'At least 12 contributions.'),
((select id from packages where code = 'dowry'), 'waiting_period_months', '12', '12 months of contributions.'),
((select id from packages where code = 'dowry'), 'min_contributions', '12', 'At least 12 contributions.'),
((select id from packages where code = 'disaster'), 'waiting_period_months', '12', '12 months of contributions.'),
((select id from packages where code = 'disaster'), 'min_contributions', '12', 'At least 12 contributions.'),
((select id from packages where code = 'youth'), 'waiting_period_months', '12', '12 months of contributions.'),
((select id from packages where code = 'youth'), 'min_contributions', '12', 'At least 12 contributions.'),
((select id from packages where code = 'senior'), 'waiting_period_months', '12', '12 months of contributions.'),
((select id from packages where code = 'senior'), 'min_contributions', '12', 'At least 12 contributions.'),
-- Shorter waiting period (Education Support)
((select id from packages where code = 'education'), 'waiting_period_months', '6', '6 months of contributions.'),
((select id from packages where code = 'education'), 'min_contributions', '6', 'At least 6 contributions.'),
((select id from packages where code = 'education'), 'requires_current_contributions', 'True', 'Contributions must be current.');

-- ---------------------------------------------------------------------------
-- Roles and permissions
-- ---------------------------------------------------------------------------
insert into roles (name, description) values
('superadmin', 'Full access, including roles and platform settings.'),
('admin', 'Manages members, subscriptions and approvals.'),
('finance', 'Verifies payments and runs payouts.'),
('claims_reviewer', 'Reviews and decides claims.'),
('support', 'Handles member enquiries and notifications.');

-- superadmin: everything
insert into permissions (role_id, resource, action)
select r.id, res.resource, act.action
from roles r
cross join (values ('members'),('packages'),('contributions'),('payments'),('claims'),('payouts'),('notifications'),('audit_logs')) as res(resource)
cross join (values ('create'),('read'),('update'),('delete'),('approve'),('verify')) as act(action)
where r.name = 'superadmin';

-- admin
insert into permissions (role_id, resource, action)
select r.id, res.resource, act.action
from roles r
cross join (values ('members'),('subscriptions'),('packages')) as res(resource)
cross join (values ('create'),('read'),('update'),('approve')) as act(action)
where r.name = 'admin';

-- finance: payments, payouts, contributions
insert into permissions (role_id, resource, action)
select r.id, res.resource, act.action
from roles r
cross join (values ('payments'),('payouts'),('contributions')) as res(resource)
cross join (values ('read'),('update'),('verify')) as act(action)
where r.name = 'finance';

-- claims_reviewer
insert into permissions (role_id, resource, action)
select r.id, res.resource, act.action
from roles r
cross join (values ('claims'),('payouts')) as res(resource)
cross join (values ('read'),('update'),('approve'),('reject')) as act(action)
where r.name = 'claims_reviewer';

-- support
insert into permissions (role_id, resource, action)
select r.id, res.resource, act.action
from roles r
cross join (values ('members'),('notifications')) as res(resource)
cross join (values ('read'),('update')) as act(action)
where r.name = 'support';

-- ---------------------------------------------------------------------------
-- Platform settings — confirmed values only. Stats render from here; never
-- hardcode the unconfirmed marketing numbers (Section 9).
-- ---------------------------------------------------------------------------
insert into platform_settings (key, value, description) values
('org_contact', '{"phone":"0798635024","whatsapp":"0798635024","email":"info@lumawelfare.or.ke","address":"P.O. Box 12345 - 00100, Nairobi, Kenya","website":"www.lumawelfare.or.ke"}', 'Public contact details. Confirm with Luma before publishing (older flyers show different numbers).'),
('stats', '{"members":150,"successful_claims":null,"lives_touched":null,"commitment":100}', 'Confirmed figures only. successful_claims and lives_touched stay null until Luma confirms them.'),
('mpesa', '{"paybill":"522522","account":"454545#","env":"sandbox"}', 'M-Pesa Paybill configuration. Switch env to production before go-live.');

-- ---------------------------------------------------------------------------
-- Open questions for Luma (Section 9) — surface these in the admin panel.
-- ---------------------------------------------------------------------------
insert into open_questions (section_number, question, answer, status) values
(4, 'Flyers list 12, 13 or 14 packages (some add Pastors Support, Event Launch, Initiation Ceremony, Water Drilling, Baby Shower, Ordination Ceremony, Toilets, Mandatory Welfare for 18+). Which is current?', '', 'open'),
(5, 'One sheet says every package pays a flat KSh 100,000 after six months. Another ties payout to amount paid in (KSh 1,000 to 20,000; KSh 2,000 to 40,000; KSh 5,000 to 100,000). Which benefit model is correct?', '', 'open'),
(5, 'Some flyers mention "renew every 2 months with 300" with no equivalent on the detailed package sheet. Is there a renewal requirement?', '', 'open'),
(9, 'Older flyers show phone 0700 000 000 and a .org email domain. Current set uses 0798635024 and info@lumawelfare.or.ke. Confirm the official contacts.', '', 'open'),
(9, 'Marketing materials claim 12,000+ members and 10,000+ claims against a confirmed 150 members. Confirm the real figures so the stats bar can be published.', '', 'open');
