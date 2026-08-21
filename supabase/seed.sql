-- CounterRx seed: auth users for every supported role + representative rows in every table.
-- Timestamps use bigint epoch-ms (the app's numeric `Date.now()` convention).
-- Auth contract (implemented in src/lib/sync.ts signInStaff):
--   email    = <staffid without dash>@counterrx.local   (e.g. s001@counterrx.local)
--   password = CRx<staffid without dash><pin>           (e.g. CRxS0011111)
-- Demo PINs printed by the lock screen: cashier 1111 · pharmacist 2222 · manager 3333 · admin 4444 · super 5555.

set search_path = public, extensions;

/* ------------------------------------------------------------------ */
/* Staff                                                                */
/* ------------------------------------------------------------------ */
insert into public.staff (id, name, role, pin_hash, initials, active) values
  ('S-001','D. Whitfield','pharmacy_admin','7f1d5e41a157fb4fa663362886a7a99bd7501fca665a05276c270a74ab080584','DW',true),
  ('S-002','R. Mensah, RPh','pharmacist','d728a67cd4b5e867e946cb9a59ccf9358d47c9ed2ee538d445d40aac839a94d3','RM',true),
  ('S-003','A. Okafor','cashier','ab26c63aac250675f176b35d43aaf5ca45f0ee87f0c313eac2542365d562b0ad','AO',true),
  ('S-004','J. Boateng','cashier','dbc1bfc7422e1dccbbdfd81d01c2793f8f949d849b788886d1839402cfc76d8c','JB',true),
  ('S-005','T. Okoye','super_admin','09301567db8a90eed12393c9f0f70ca51a68511f42c076c09612aea63da79f2d','TO',true) on conflict (id) do nothing;

/* ------------------------------------------------------------------ */
/* Supabase Auth users + identities + profiles                          */
/* Mirror of the app's makeStaff() roster (src/data.ts).               */
/* ------------------------------------------------------------------ */
insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at, last_sign_in_at, is_sso_user, is_anonymous)
values
  ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000000001','authenticated','authenticated','s001@counterrx.local',crypt('CRxS0013333',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),now(),false,false),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000000002','authenticated','authenticated','s002@counterrx.local',crypt('CRxS0022222',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),now(),false,false),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000000003','authenticated','authenticated','s003@counterrx.local',crypt('CRxS0031111',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),now(),false,false),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000000004','authenticated','authenticated','s004@counterrx.local',crypt('CRxS0044444',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),now(),false,false),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000000005','authenticated','authenticated','s005@counterrx.local',crypt('CRxS0055555',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),now(),false,false) on conflict (id) do nothing;

insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at, id)
values
  ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','{"sub":"00000000-0000-0000-0000-000000000001","email":"s001@counterrx.local","email_verified":true,"phone_verified":false}','email',now(),now(),now(),'00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','{"sub":"00000000-0000-0000-0000-000000000002","email":"s002@counterrx.local","email_verified":true,"phone_verified":false}','email',now(),now(),now(),'00000000-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000003','{"sub":"00000000-0000-0000-0000-000000000003","email":"s003@counterrx.local","email_verified":true,"phone_verified":false}','email',now(),now(),now(),'00000000-0000-0000-0000-000000000003'),
  ('00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000004','{"sub":"00000000-0000-0000-0000-000000000004","email":"s004@counterrx.local","email_verified":true,"phone_verified":false}','email',now(),now(),now(),'00000000-0000-0000-0000-000000000004'),
  ('00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000005','{"sub":"00000000-0000-0000-0000-000000000005","email":"s005@counterrx.local","email_verified":true,"phone_verified":false}','email',now(),now(),now(),'00000000-0000-0000-0000-000000000005') on conflict (id) do nothing;

-- GoTrue v2 returns `500 Database error querying schema` when these string
-- columns are NULL instead of '' — normalize for freshly-seeded AND existing rows.
update auth.users set
  confirmation_token          = coalesce(confirmation_token,''),
  recovery_token              = coalesce(recovery_token,''),
  email_change                = coalesce(email_change,''),
  email_change_token_new      = coalesce(email_change_token_new,''),
  email_change_token_current  = coalesce(email_change_token_current,''),
  phone_change                = coalesce(phone_change,''),
  phone_change_token          = coalesce(phone_change_token,''),
  reauthentication_token      = coalesce(reauthentication_token,'');

insert into public.profiles (id, staff_id, role) values
  ('00000000-0000-0000-0000-000000000001','S-001','cashier'),
  ('00000000-0000-0000-0000-000000000002','S-002','pharmacist'),
  ('00000000-0000-0000-0000-000000000003','S-003','manager'),
  ('00000000-0000-0000-0000-000000000004','S-004','pharmacy_admin'),
  ('00000000-0000-0000-0000-000000000005','S-005','super_admin') on conflict (id) do nothing;

/* ------------------------------------------------------------------ */
/* Org settings (single row)                                            */
/* ------------------------------------------------------------------ */
insert into public.settings (id, org_name, branch, address, phone, license, currency, receipt_footer, receipt_terms, show_barcode, loyalty, scan_beep, idle_lock_mins, auto_snapshot_mins, terminal_id)
values (1,'CounterRx Pharmacy','Branch 04 — Maple & 9th','214 Maple Avenue, Springfield','(555) 014-2210','LIC #PH-88412 · GST 29AAKCS4412F1Z8','USD','Thank you for choosing CounterRx','Rx may not be returned once dispensed.',true,'{"ptsPerUnit":1,"chunkPts":100,"chunkValue":5,"silverAt":500,"goldAt":1500}',true,5,0,'T-01') on conflict (id) do nothing;

/* ------------------------------------------------------------------ */
/* Products (+ embedded batches/uoms/fields/kit)                        */
/* ------------------------------------------------------------------ */
insert into public.products
  (id, sku, barcode, name, generic, brand, category, form, price, cost, reorder_level, rx, supplier, batches, uoms, fields, kit, ndc, gtin, controlled, restricted, generic_of, variant_of, compound)
values
  ('amx500','SKU-AMX500','890AMX500567890','Amoxicillin 500mg','Amoxicillin trihydrate','Novex Pharma','antibiotics','Capsule · strip of 10',8.40,4.90,40,true,'MediSource Ltd','[{"batch":"AMX-24C11","expiry":"2027-04-16","qty":132},{"batch":"AMX-25A04","expiry":"2027-11-24","qty":84}]','[]','[]','[]','00093-0058-01','00300093005801',NULL,NULL,NULL,NULL,false),
  ('azi250','SKU-AZI250','890AZI250567890','Azithromycin 250mg','Azithromycin','Zithron','antibiotics','Tablet · strip of 6',11.90,7.20,20,true,'MediSource Ltd','[{"batch":"AZT-24B07","expiry":"2027-02-01","qty":14}]','[]','[]','[]',NULL,NULL,NULL,NULL,NULL,NULL,false),
  ('cipro500','SKU-CIPRO500','890CIPRO500567890','Ciprofloxacin 500mg','Ciprofloxacin HCl','Ciprolon','antibiotics','Tablet · strip of 10',9.60,5.40,25,true,'PharmaLine Co','[{"batch":"CIP-24A19","expiry":"2027-05-26","qty":64},{"batch":"CIP-25C02","expiry":"2027-12-22","qty":40}]','[]','[]','[]',NULL,NULL,NULL,NULL,NULL,NULL,false),
  ('ibu400','SKU-IBU400','890IBU400567890','Ibuprofen 400mg','Ibuprofen','Brufen','pain','Tablet · strip of 20',3.20,1.40,60,false,'PharmaLine Co','[{"batch":"IBU-25D02","expiry":"2027-10-14","qty":260}]','[]','[]','[]',NULL,NULL,NULL,NULL,NULL,NULL,false),
  ('pcm500','SKU-PCM500','890PCM500567890','Paracetamol 500mg','Acetaminophen','Calpol','pain','Tablet · strip of 15',1.80,0.70,100,false,'Apex Distributors','[{"batch":"PCM-24E14","expiry":"2026-10-14","qty":420,"price":1.2},{"batch":"PCM-25E20","expiry":"2027-11-01","qty":340}]','[{"code":"box","label":"Box of 10 strips","factor":10,"price":16.2,"cost":6.3,"barcode":"891pcm500box10"}]','[]','[]','50580-0501-01','0030050580050101',NULL,NULL,NULL,NULL,false),
  ('diclo50','SKU-DICLO50','890DICLO50567890','Diclofenac 50mg','Diclofenac sodium','Voltaren','pain','Tablet · strip of 10',4.60,2.30,24,false,'PharmaLine Co','[{"batch":"DIC-24F30","expiry":"2026-11-16","qty":8}]','[]','[]','[]',NULL,NULL,NULL,NULL,NULL,NULL,false),
  ('cet10','SKU-CET10','890CET10567890','Cetirizine 10mg','Cetirizine HCl','Zyrtec','coldflu','Tablet · strip of 10',4.10,1.90,50,false,'Apex Distributors','[{"batch":"CET-25A08","expiry":"2027-09-04","qty":180}]','[{"code":"box","label":"Box of 12 strips","factor":12,"price":44.3,"cost":20.5,"barcode":"891cet10box12"}]','[]','[]','59762-1010-01','0030059762101001',NULL,NULL,NULL,NULL,false),
  ('cfsyrup','SKU-CFSYRUP','890CFSYRUP567890','Cough Syrup DM','Dextromethorphan 15mg/5ml','Benylin','coldflu','Syrup · 100ml bottle',6.50,3.60,20,false,'Apex Distributors','[{"batch":"BEN-25C21","expiry":"2027-03-14","qty":46},{"batch":"BEN-25J10","expiry":"2027-10-13","qty":26}]','[]','[]','[]',NULL,NULL,NULL,NULL,NULL,NULL,false),
  ('ors5','SKU-ORS5','890ORS5567890','ORS Sachets','Oral rehydration salts','Electral','coldflu','Powder · pack of 5',3.90,1.80,30,false,'Vital Trade','[{"batch":"ORS-25B11","expiry":"2027-11-24","qty":96}]','[{"code":"case","label":"Case of 20 packs","factor":20,"price":70.2,"cost":32.4,"barcode":"891ors5case20"}]','[]','[]',NULL,NULL,NULL,NULL,NULL,NULL,false),
  ('vd3','SKU-VD3','890VD3567890','Vitamin D3 1000IU','Cholecalciferol','D-Sun','vitamins','Softgel · bottle of 60',12.50,6.80,25,false,'Vital Trade','[{"batch":"VD3-25A03","expiry":"2027-11-21","qty":74}]','[{"code":"case","label":"Case of 6 bottles","factor":6,"price":71.4,"cost":38.8,"barcode":"891vd3case6"}]','[]','[]',NULL,NULL,NULL,NULL,NULL,NULL,false),
  ('vitc','SKU-VITC','890VITC567890','Vitamin C 1000mg','Ascorbic acid','Cevit','vitamins','Effervescent · 20 tabs',7.80,4.10,18,false,'Vital Trade','[{"batch":"VTC-24D18","expiry":"2026-10-13","qty":6}]','[]','[]','[]',NULL,NULL,NULL,NULL,NULL,NULL,false),
  ('zinco','SKU-ZINCO','890ZINCO567890','Zinc + Multivitamin','Zinc sulfate + B-complex','Zincovit','vitamins','Tablet · strip of 15',5.40,2.70,30,false,'Vital Trade','[{"batch":"ZNC-25C09","expiry":"2027-08-16","qty":118}]','[]','[]','[]',NULL,NULL,NULL,NULL,NULL,NULL,false),
  ('met500','SKU-MET500','890MET500567890','Metformin 500mg','Metformin HCl','Glucophage','diabetes','Tablet · strip of 15',4.90,2.20,60,true,'MediSource Ltd','[{"batch":"MET-25B25","expiry":"2027-03-06","qty":210},{"batch":"MET-25K08","expiry":"2027-12-23","qty":130}]','[{"code":"box","label":"Box of 10 strips","factor":10,"price":44.1,"cost":19.8,"barcode":"891met500box10"}]','[]','[]','00378-0048-01','003000378004801',NULL,NULL,NULL,NULL,false),
  ('glm1','SKU-GLM1','890GLM1567890','Glimepiride 1mg','Glimepiride','Amaryl','diabetes','Tablet · strip of 15',8.80,4.90,20,true,'MediSource Ltd','[{"batch":"GLM-25A14","expiry":"2027-03-23","qty":52}]','[]','[]','[]',NULL,NULL,NULL,NULL,NULL,NULL,false),
  ('glst50','SKU-GLST50','890GLST50567890','Glucometer Strips','Glucose test strips','Accu-Chek','diabetes','Strips · box of 50',24.00,15.50,15,false,'DevicePoint','[{"batch":"ACU-25D30","expiry":"2027-09-25","qty":34}]','[]','[]','[]',NULL,NULL,NULL,NULL,NULL,NULL,false),
  ('insg','SKU-INSG','890INSG567890','Insulin Glargine','Insulin glargine 100IU/ml','Lantus','diabetes','SoloStar pen · 3ml',46.50,33.00,10,true,'ColdChain Direct','[{"batch":"LNT-24K02","expiry":"2026-09-23","qty":12},{"batch":"LNT-25L15","expiry":"2027-06-17","qty":8}]','[]','[{"key":"Storage","value":"2–8 °C · fridge zone B"},{"key":"Hazard class","value":"Cold chain"}]','[]','00088-2220-33','003000088222033',NULL,NULL,NULL,NULL,false),
  ('atv20','SKU-ATV20','890ATV20567890','Atorvastatin 20mg','Atorvastatin calcium','Lipitor','cardio','Tablet · strip of 15',10.20,5.60,40,true,'MediSource Ltd','[{"batch":"ATV-25C16","expiry":"2027-05-22","qty":140}]','[]','[]','[]','00071-0155-23','003000071015523',NULL,NULL,NULL,NULL,false),
  ('aml5','SKU-AML5','890AML5567890','Amlodipine 5mg','Amlodipine besylate','Norvasc','cardio','Tablet · strip of 15',5.80,2.90,20,true,'MediSource Ltd','[{"batch":"AML-24H08","expiry":"2026-12-28","qty":4}]','[]','[]','[]','59762-3719-01','0030059762371901',NULL,NULL,NULL,NULL,false),
  ('asa75','SKU-ASA75','890ASA75567890','Aspirin 75mg','Acetylsalicylic acid','Ecosprin','cardio','Tablet · strip of 14',2.40,1.10,50,false,'PharmaLine Co','[{"batch":"ASP-25F22","expiry":"2027-11-04","qty":230}]','[]','[]','[]',NULL,NULL,NULL,NULL,NULL,NULL,false),
  ('omz20','SKU-OMZ20','890OMZ20567890','Omeprazole 20mg','Omeprazole','Losec','derma','Capsule · strip of 14',6.90,3.40,30,false,'PharmaLine Co','[{"batch":"OMZ-25E07","expiry":"2027-04-09","qty":92},{"batch":"OMZ-25M03","expiry":"2027-10-14","qty":52}]','[]','[]','[]',NULL,NULL,NULL,NULL,NULL,NULL,false),
  ('clot1','SKU-CLOT1','890CLOT1567890','Clotrimazole 1%','Clotrimazole','Canesten','derma','Cream · 20g tube',5.60,2.80,20,false,'Apex Distributors','[{"batch":"CLT-25B19","expiry":"2027-04-15","qty":58}]','[]','[]','[]',NULL,NULL,NULL,NULL,NULL,NULL,false),
  ('spf50','SKU-SPF50','890SPF50567890','Sunscreen SPF 50','Broad-spectrum UV filters','Photostable','derma','Lotion · 60g tube',13.90,8.20,12,false,'Vital Trade','[{"batch":"SUN-25A27","expiry":"2027-05-30","qty":26}]','[]','[]','[]',NULL,NULL,NULL,NULL,NULL,NULL,false),
  ('bpmon','SKU-BPMON','890BPMON567890','BP Monitor Arm','Digital sphygmomanometer','Omron HEM-7120','devices','Device · 1 unit',39.00,26.00,6,false,'DevicePoint','[{"batch":"OMR-25U04","expiry":"2028-01-09","qty":16}]','[]','[]','[]',NULL,NULL,NULL,NULL,NULL,NULL,false),
  ('thermo','SKU-THERMO','890THERMO567890','Digital Thermometer','Oral/axillary thermometer','Beurer FT-09','devices','Device · 1 unit',9.50,5.30,12,false,'DevicePoint','[{"batch":"BEU-25U11","expiry":"2027-12-25","qty":42}]','[]','[]','[]',NULL,NULL,NULL,NULL,NULL,NULL,false),
  ('oxim','SKU-OXIM','890OXIM567890','Pulse Oximeter','Fingertip SpO2 + HR','ChoiceMMed','devices','Device · 1 unit',18.00,11.40,8,false,'DevicePoint','[{"batch":"CMD-25U09","expiry":"2027-10-05","qty":3}]','[]','[{"key":"Vendor code","value":"DP-CMD-09"},{"key":"Recall flag","value":"none"}]','[]',NULL,NULL,NULL,NULL,NULL,NULL,false),
  ('band','SKU-BAND','890BAND567890','Adhesive Bandages','Sterile adhesive strips','Band-Aid','firstaid','Box of 40 strips',4.20,2.00,40,false,'Vital Trade','[{"batch":"BND-26A12","expiry":"2028-02-12","qty":150}]','[{"code":"case","label":"Case of 12 boxes","factor":12,"price":45.4,"cost":21.6,"barcode":"891bandcase12"}]','[]','[]',NULL,NULL,NULL,NULL,NULL,NULL,false),
  ('detl','SKU-DETL','890DETL567890','Antiseptic Liquid','Povidone-iodine 10%','Betadine','firstaid','Solution · 100ml',4.80,2.40,25,false,'Apex Distributors','[{"batch":"BET-25G15","expiry":"2027-03-26","qty":84}]','[]','[]','[]',NULL,NULL,NULL,NULL,NULL,NULL,false),
  ('salb','SKU-SALB','890SALB567890','Salbutamol Inhaler','Salbutamol 100mcg','Ventolin','coldflu','Inhaler · 200 doses',14.80,9.10,10,true,'ColdChain Direct','[{"batch":"VNT-25I06","expiry":"2026-09-19","qty":22},{"batch":"VNT-25N19","expiry":"2027-02-23","qty":14}]','[]','[]','[]','00173-0682-20','003000173068220',NULL,NULL,NULL,NULL,false),
  ('tram50','SKU-TRAM50','890TRAM50567890','Tramadol 50mg','Tramadol HCl','Ultram','pain','Tablet · strip of 10',7.20,3.80,15,true,'MediSource Ltd','[{"batch":"TRM-25C18","expiry":"2027-03-17","qty":46}]','[]','[{"key":"Storage","value":"Locked schedule cabinet"},{"key":"Hazard class","value":"C-IV · count sheet"}]','[]','00093-0058-01','003000093005801','C-IV',NULL,NULL,NULL,false),
  ('codsyr','SKU-CODSYR','890CODSYR567890','Codeine Cough Syrup','Codeine phosphate 10mg/5ml','Cheratussin AC','coldflu','Syrup · 118ml',8.90,4.60,10,true,'Apex Distributors','[{"batch":"COD-25B09","expiry":"2027-01-31","qty":28}]','[]','[]','[]','12496-1205-01','003012496120501','C-V',NULL,NULL,NULL,false),
  ('alpr05','SKU-ALPR05','890ALPR05567890','Alprazolam 0.5mg','Alprazolam','Xanax','cns','Tablet · strip of 15',9.40,4.20,12,true,'MediSource Ltd','[{"batch":"ALP-25D06","expiry":"2027-04-08","qty":34}]','[]','[]','[]','59762-5019-01','0030059762501901','C-IV',NULL,NULL,NULL,false),
  ('zolp5','SKU-ZOLP5','890ZOLP5567890','Zolpidem 5mg','Zolpidem tartrate','Ambien','cns','Tablet · strip of 10',11.60,5.90,8,true,'PharmaLine Co','[{"batch":"ZOL-25A11","expiry":"2027-03-20","qty":18}]','[]','[]','[]','00074-4340-13','003000074434013','C-IV',NULL,NULL,NULL,false),
  ('sud30','SKU-SUD30','890SUD30567890','Pseudoephedrine 30mg','Pseudoephedrine HCl','Sudafed','coldflu','Tablet · strip of 12',6.80,3.10,12,false,'Apex Distributors','[{"batch":"SUD-25B14","expiry":"2027-04-01","qty":40}]','[]','[]','[]',NULL,NULL,NULL,'{"limitPerSale":2}',NULL,NULL,false),
  ('g-atv20','SKU-G-ATV20','890G-ATV20567890','Atorvastatin 20mg','Atorvastatin calcium','Generic · Teva','cardio','Tablet · strip of 15',6.10,2.90,40,true,'MediSource Ltd','[{"batch":"GAT-26A04","expiry":"2027-11-18","qty":180}]','[]','[]','[]',NULL,NULL,NULL,NULL,'atv20',NULL,false),
  ('g-aml5','SKU-G-AML5','890G-AML5567890','Amlodipine 5mg','Amlodipine besylate','Generic · Lupin','cardio','Tablet · strip of 15',3.40,1.50,30,true,'MediSource Ltd','[{"batch":"GAM-26B12","expiry":"2027-11-27","qty":160}]','[]','[]','[]',NULL,NULL,NULL,NULL,'aml5',NULL,false),
  ('g-met500','SKU-G-MET500','890G-MET500567890','Metformin 500mg','Metformin HCl','Generic · Glenmark','diabetes','Tablet · strip of 15',2.90,1.10,60,true,'MediSource Ltd','[{"batch":"GMT-26A20","expiry":"2027-12-06","qty":300}]','[]','[]','[]',NULL,NULL,NULL,NULL,'met500',NULL,false),
  ('mmwash','SKU-MMWASH','890MMWASH567890','Magic Mouthwash 240ml','Diphenhydramine / viscous lidocaine / antacid','In-house compound','compound','Suspension · 240ml bottle',18.50,7.40,2,true,'Compounded in-house','[{"batch":"MMW-26A03","expiry":"2026-09-30","qty":6}]','[]','[]','[]',NULL,NULL,NULL,NULL,NULL,NULL,true),
  ('amx250','SKU-AMX250','890AMX250567890','Amoxicillin 250mg','Amoxicillin trihydrate','Novex Pharma','antibiotics','Capsule · strip of 10',6.20,3.40,30,true,'MediSource Ltd','[{"batch":"AMX25-26A01","expiry":"2027-03-10","qty":90}]','[]','[]','[]',NULL,NULL,NULL,NULL,NULL,'amx500',false),
  ('kit-flu','SKU-KIT-FLU','890KIT-FLU567890','Flu Relief Kit','Cetirizine + cough syrup + ORS','CounterRx bundle','coldflu','Bundle · 3 products',13.90,0.00,5,false,'Assembled in-store','[]','[]','[]','[{"productId":"cet10","qty":1},{"productId":"cfsyrup","qty":1},{"productId":"ors5","qty":2}]',NULL,NULL,NULL,NULL,NULL,NULL,false),
  ('kit-fa','SKU-KIT-FA','890KIT-FA567890','Travel First-Aid Kit','Bandages + antiseptic','CounterRx bundle','firstaid','Bundle · 2 products',8.50,0.00,5,false,'Assembled in-store','[]','[]','[]','[{"productId":"band","qty":1},{"productId":"detl","qty":1}]',NULL,NULL,NULL,NULL,NULL,NULL,false) on conflict (id) do nothing;

/* ------------------------------------------------------------------ */
/* Prescribers                                                          */
/* ------------------------------------------------------------------ */
insert into public.prescribers (id, name, credentials, specialty, npi, dea, phone, fax, active) values
  ('DR-01','Dr. I. Bello','MD','Family medicine','1093847562','FB4482913','(555) 210-8830','(555) 210-8831',true),
  ('DR-02','Dr. R. Vance','MD, FACC','Cardiology','1472639058','RV2214470','(555) 318-4410','(555) 318-4411',true),
  ('DR-03','Dr. S. Adeyemi','MD','Endocrinology','1659308127','SA7730051','(555) 402-1190','(555) 402-1191',true),
  ('DR-04','Dr. L. Tran','DO','Pediatrics','1831294670','LT5569934','(555) 909-2245','(555) 909-2246',true),
  ('DR-05','Dr. H. Osei','MD','Psychiatry','1285764013','HO9917285','(555) 655-3370','(555) 655-3371',true) on conflict (id) do nothing;

/* ------------------------------------------------------------------ */
/* Customers                                                            */
/* ------------------------------------------------------------------ */
insert into public.customers
  (id, name, phone, email, created_at_tx, notes, points, allergies, dob, gender, address, blood_type, primary_prescriber_id, insurance_plan, clinical_notes, tax_exempt, fields)
values
  ('C-001','Helen Okafor','(555) 201-8834','helen.o@mail.com',now()-interval '212 days','Prefers 90-day fills',342,'["Penicillin","Latex"]','1958-03-14','F','42 Willow Drive, Springfield','O+','DR-02','BlueCross PBM','Hypertension + hyperlipidemia.',false,'[]'),
  ('C-002','Victor Adeyemi','(555) 318-0021',NULL,now()-interval '156 days',NULL,218,'[]','1967-11-02','M','240 Cedar Court, Springfield','A+','DR-03','MediPlan Rx','T2DM. A1c 7.1.',false,'[]'),
  ('C-003','Marta Kessler','(555) 774-2910','mkessler@mail.com',now()-interval '98 days','Penicillin allergy on file',126,'["Penicillin"]','1991-07-29','F','9 Aspen Row, Springfield','B−','DR-01',NULL,'Confirmed penicillin anaphylaxis 2019.',false,'[]'),
  ('C-004','Daniel Osei','(555) 402-5519',NULL,now()-interval '74 days',NULL,94,'["Aspirin / NSAID"]','1964-05-18','M','310 Harbor Lane, Springfield','O−','DR-02','BlueCross PBM',NULL,false,'[]'),
  ('C-005','Priya Nair','(555) 909-1147','priya.n@mail.com',now()-interval '41 days',NULL,265,'[]','1981-09-23','F','77 Birch Street, Springfield',NULL,'DR-03','Aetna Rx',NULL,false,'[]'),
  ('C-006','Grace Lin','(555) 655-7702',NULL,now()-interval '23 days','Insulin — cold chain pickup',71,'["Iodine"]','1973-01-08','F','18 Harbor Lane, Springfield','AB+','DR-03','Aetna Rx','Insulin glargine — rotate sites; cold chain mandatory.',false,'[]'),
  ('C-007','Tom Alvarez','(555) 130-4486',NULL,now()-interval '9 days','Guardian: mother (pickup)',18,'[]',NULL,NULL,NULL,NULL,NULL,NULL,NULL,false,'[]'),
  ('C-008','Ruth Bello','(555) 887-3320',NULL,now()-interval '2 days',NULL,6,'[]',NULL,NULL,NULL,NULL,NULL,NULL,NULL,false,'[]'),
  ('C-009','Maple Family Clinic','(555) 014-9900','orders@mapleclinic.org',now()-interval '130 days','Resale certificate on file',0,'[]',NULL,NULL,NULL,NULL,NULL,NULL,NULL,true,'[]') on conflict (id) do nothing;

/* ------------------------------------------------------------------ */
/* Prescriptions (PHI)                                                  */
/* ------------------------------------------------------------------ */
insert into public.prescriptions
  (id, patient, age, product_id, qty, prescriber_id, status, created_at_tx, note, days_supply, refills_authorized, refills_remaining, rx_expiry, phone, insurance, pa, notified_at, dispensed_at)
values
  ('RX-2481','Marta Kessler',34,'amx500',2,'DR-01','new',now()-interval '14 minutes','Take 1 capsule every 8h after food',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
  ('RX-2480','Daniel Osei',61,'atv20',2,'DR-02','verifying',now()-interval '52 minutes','Refill — check interaction with amlodipine',30,5,2,to_char(now()+interval '180 days','YYYY-MM-DD'),NULL,'{"plan":"BlueCross PBM","memberId":"XCB-9917-31","status":"pending"}',NULL,NULL,NULL),
  ('RX-2479','Priya Nair',45,'met500',4,'DR-03','ready',now()-interval '126 minutes',NULL,90,3,3,to_char(now()+interval '320 days','YYYY-MM-DD'),'(555) 909-1147',NULL,NULL,NULL,NULL),
  ('RX-2478','Tom Alvarez',8,'salb',1,'DR-01','waiting',now()-interval '204 minutes','Guardian pickup — mother',NULL,NULL,NULL,NULL,'(555) 130-4486',NULL,NULL,(extract(epoch from now()-interval '66 minutes')*1000)::bigint,NULL),
  ('RX-2477','Grace Lin',52,'insg',2,'DR-03','verifying',now()-interval '312 minutes','Cold-chain — keep refrigerated',28,NULL,NULL,NULL,'(555) 655-7702','{"plan":"Aetna Rx","memberId":"AET-8830-19","status":"pending"}',NULL,NULL,NULL),
  ('RX-2476','Samuel Eze',29,'azi250',1,'DR-02','dispensed',now()-interval '516 minutes',NULL,6,NULL,NULL,NULL,NULL,NULL,NULL,NULL,(extract(epoch from now()-interval '516 minutes')*1000)::bigint),
  ('RX-2475','Esther Mensah',47,'insg',3,'DR-03','verifying',now()-interval '660 minutes','High-cost biologic — payer requires PA before fill',84,NULL,NULL,NULL,'(555) 209-8814','{"plan":"BlueCross PBM","memberId":"XCB-5521-08","status":"verified"}',
   ('{"status":"pending","requestedAt":'::text || (extract(epoch from now()-interval '9 hours')*1000)::bigint::text || ',"note":"Submitted via payer portal — awaiting clinical review"}'::text)::jsonb,
   NULL,NULL),
  ('RX-2441','Helen Okafor',67,'atv20',2,'DR-02','dispensed',now()-interval '29 days','Monthly maintenance — auto-refill allowed',30,5,1,to_char(now()+interval '150 days','YYYY-MM-DD'),NULL,'{"plan":"BlueCross PBM","memberId":"XCB-4471-02","status":"verified"}',
   ('{"status":"approved","requestedAt":'::text || (extract(epoch from now()-interval '40 days')*1000)::bigint::text || ',"decidedAt":'::text || (extract(epoch from now()-interval '38 days')*1000)::bigint::text || ',"note":"Approved 12 months — step therapy documented"}'::text)::jsonb,
   NULL,(extract(epoch from now()-interval '29 days')*1000)::bigint) on conflict (id) do nothing;

/* ------------------------------------------------------------------ */
/* Transactions (+ embedded lines)                                      */
/* ------------------------------------------------------------------ */
insert into public.transactions (id, at, lines, subtotal, discount, tax, total, method, cashier, tendered, change, customer_id)
values
  ('T-1041', (extract(epoch from now()-interval '20 minutes')*1000)::bigint,
   '[{"productId":"amx500","name":"Amoxicillin 500mg","form":"Capsule · strip of 10","qty":2,"price":8.4,"rx":true,"alloc":[{"batch":"AMX-24C11","qty":2}]}]',
   16.80,0,1.34,18.14,'cash','A. Okafor',20,1.86,'C-003'),
  ('T-1042', (extract(epoch from now()-interval '48 minutes')*1000)::bigint,
   '[{"productId":"met500","name":"Metformin 500mg","form":"Tablet · strip of 15","qty":4,"price":4.9,"rx":true,"alloc":[{"batch":"MET-25B25","qty":4}]},{"productId":"vd3","name":"Vitamin D3 1000IU","form":"Softgel · bottle of 60","qty":1,"price":12.5,"rx":false}]',
   32.10,0,2.57,34.67,'card','A. Okafor',NULL,NULL,'C-005'),
  ('T-1043', (extract(epoch from now()-interval '75 minutes')*1000)::bigint,
   '[{"productId":"cet10","name":"Cetirizine 10mg","form":"Tablet · strip of 10","qty":2,"price":4.1,"rx":false}]',
   8.20,0,0.66,8.86,'cash','A. Okafor',10,1.14,NULL),
  ('T-1044', (extract(epoch from now()-interval '110 minutes')*1000)::bigint,
   '[{"productId":"insg","name":"Insulin Glargine","form":"SoloStar pen · 3ml","qty":2,"price":46.5,"rx":true,"alloc":[{"batch":"LNT-24K02","qty":2}]}]',
   93.00,0,0,93.00,'insurance','A. Okafor',NULL,NULL,'C-006'),
  ('T-1031', (extract(epoch from now()-interval '1 day')*1000)::bigint,
   '[{"productId":"salb","name":"Salbutamol Inhaler","form":"Inhaler · 200 doses","qty":1,"price":14.8,"rx":true,"alloc":[{"batch":"VNT-25I06","qty":1}]},{"productId":"ors5","name":"ORS Sachets","form":"Powder · pack of 5","qty":2,"price":3.9,"rx":false}]',
   22.60,1.13,1.72,23.19,'cash','A. Okafor',25,1.81,NULL),
  ('T-1030', (extract(epoch from now()-interval '1 day' - interval '3 hours')*1000)::bigint,
   '[{"productId":"bpmon","name":"BP Monitor Arm","form":"Device · 1 unit","qty":1,"price":39,"rx":false}]',
   39.00,0,3.12,42.12,'card','A. Okafor',NULL,NULL,'C-009'),
  ('T-1029', (extract(epoch from now()-interval '1 day' - interval '6 hours')*1000)::bigint,
   '[{"productId":"tram50","name":"Tramadol 50mg","form":"Tablet · strip of 10","qty":1,"price":7.2,"rx":true,"alloc":[{"batch":"TRM-25C18","qty":1}]}]',
   7.20,0,0.58,7.78,'cash','A. Okafor',10,2.22,NULL),
  ('T-1028', (extract(epoch from now()-interval '2 days')*1000)::bigint,
   '[{"productId":"vitc","name":"Vitamin C 1000mg","form":"Effervescent · 20 tabs","qty":3,"price":7.8,"rx":false},{"productId":"band","name":"Adhesive Bandages","form":"Box of 40 strips","qty":2,"price":4.2,"rx":false}]',
   31.80,0,2.54,34.34,'cash','A. Okafor',40,5.66,NULL),
  ('T-1027', (extract(epoch from now()-interval '2 days' - interval '4 hours')*1000)::bigint,
   '[{"productId":"pcm500","name":"Paracetamol 500mg","form":"Tablet · strip of 15","qty":5,"price":1.2,"rx":false,"alloc":[{"batch":"PCM-24E14","qty":5}]}]',
   6.00,0.30,0.46,6.16,'cash','A. Okafor',10,3.84,NULL),
  ('T-1026', (extract(epoch from now()-interval '3 days')*1000)::bigint,
   '[{"productId":"atv20","name":"Atorvastatin 20mg","form":"Tablet · strip of 15","qty":2,"price":10.2,"rx":true,"alloc":[{"batch":"ATV-25C16","qty":2}]}]',
   20.40,0,1.63,22.03,'insurance','L. Mensah',NULL,NULL,'C-004') on conflict (id) do nothing;

/* ------------------------------------------------------------------ */
/* Shifts                                                               */
/* ------------------------------------------------------------------ */
insert into public.shifts
  (id, terminal_id, cashier_id, cashier_name, opened_at, closed_at, status, opening_balance, closing_balance, counted_cash, transactions, cash_movements, sales_total, refunds_total, card_total, insurance_total, store_credit_total, paid_in_total, paid_out_total, expected_cash, over_short, notes)
values
  ('SH-0001','T-01','S-001','A. Okafor',(extract(epoch from now()-interval '6 hours')*1000)::bigint,NULL,'open',200.00,NULL,NULL,
   ('[{"txId":"T-1041","at":'||(extract(epoch from now()-interval '20 minutes')*1000)::bigint::text||',"type":"sale","total":18.14,"tenderType":"cash","cashier":"A. Okafor"},{"txId":"T-1042","at":'||(extract(epoch from now()-interval '48 minutes')*1000)::bigint::text||',"type":"sale","total":34.67,"tenderType":"card","cashier":"A. Okafor"},{"txId":"T-1043","at":'||(extract(epoch from now()-interval '75 minutes')*1000)::bigint::text||',"type":"sale","total":8.86,"tenderType":"cash","cashier":"A. Okafor"},{"txId":"T-1044","at":'||(extract(epoch from now()-interval '110 minutes')*1000)::bigint::text||',"type":"sale","total":93,"tenderType":"insurance","cashier":"A. Okafor"}]')::jsonb,
   ('[{"id":"CM-1","at":'||(extract(epoch from now()-interval '5 hours')*1000)::bigint::text||',"type":"paid_in","amount":100,"reason":"Float top-up","cashier":"A. Okafor"}]')::jsonb,
   154.67,0,34.67,93.00,0,300.00,0,327.00,NULL,NULL),
  ('SH-0042','T-01','S-001','A. Okafor',(extract(epoch from now()-interval '1 day' - interval '9 hours')*1000)::bigint,(extract(epoch from now()-interval '1 day')*1000)::bigint,'closed',150.00,465.31,273.00,
   ('[{"txId":"T-1031","at":'||(extract(epoch from now()-interval '1 day')*1000)::bigint::text||',"type":"sale","total":23.19,"tenderType":"cash","cashier":"A. Okafor"},{"txId":"T-1030","at":'||(extract(epoch from now()-interval '1 day' - interval '3 hours')*1000)::bigint::text||',"type":"sale","total":42.12,"tenderType":"card","cashier":"A. Okafor"}]')::jsonb,
   ('[{"id":"CM-2","at":'||(extract(epoch from now()-interval '1 day' - interval '8 hours')*1000)::bigint::text||',"type":"paid_in","amount":100,"reason":"Float top-up","cashier":"A. Okafor"}]')::jsonb,
   65.31,0,42.12,0,0,250.00,0,273.19,-0.19,'Shift balanced — counted 273.00 vs expected 273.19') on conflict (id) do nothing;

/* ------------------------------------------------------------------ */
/* Audit + behind-the-counter log                                       */
/* ------------------------------------------------------------------ */
insert into public.audit_log (at, actor, kind, detail) values
  ((extract(epoch from now()-interval '6 hours')*1000)::bigint,'A. Okafor','shift','Shift SH-0001 opened by A. Okafor'),
  ((extract(epoch from now()-interval '5 hours')*1000)::bigint,'A. Okafor','cash','Paid in $100.00 — Float top-up'),
  ((extract(epoch from now()-interval '20 minutes')*1000)::bigint,'A. Okafor','sale','Sale T-1041 · $18.14 · cash'),
  ((extract(epoch from now()-interval '48 minutes')*1000)::bigint,'A. Okafor','sale','Sale T-1042 · $34.67 · card'),
  ((extract(epoch from now()-interval '1 day')*1000)::bigint,'A. Okafor','system','Shift SH-0042 closed — over/short: -0.19'),
  ((extract(epoch from now()-interval '2 days')*1000)::bigint,'L. Mensah','rx','Prescriber added — Dr. L. Tran · NPI 1831294670');

insert into public.restricted_log (at, product_id, qty, purchaser, id_type, id_last4, cashier) values
  ((extract(epoch from now()-interval '5 hours')*1000)::bigint,'sud30',1,'Omar Haddad','Driving license','1187','A. Okafor'),
  ((extract(epoch from now()-interval '26 hours')*1000)::bigint,'sud30',2,'Daniel Osei','National ID','4021','A. Okafor'),
  ((extract(epoch from now()-interval '52 hours')*1000)::bigint,'tram50',1,'Esther Mensah','Passport','8830','L. Mensah');

/* ------------------------------------------------------------------ */
/* Transfers, backorders, rx transfers                                  */
/* ------------------------------------------------------------------ */
insert into public.transfers (id, product_id, qty, to_branch, status, created_at, requested_by, note) values
  ('TR-311','insg',4,'Branch 02 — Cedar Mall','requested',(extract(epoch from now()-interval '150 minutes')*1000)::bigint,'R. Mensah, RPh','Northgate running low on glargine'),
  ('TR-310','ors5',24,'Branch 07 — Northgate','approved',(extract(epoch from now()-interval '9 hours')*1000)::bigint,'A. Okafor',NULL) on conflict (id) do nothing;

insert into public.backorders (id, patient, phone, product_id, qty, created_at, status, eta_days, supplier, arrived_at, notified_at) values
  ('BO-101','Victor Adeyemi','(555) 318-0021','aml5',6,(extract(epoch from now()-interval '29 hours')*1000)::bigint,'ordered',3,'MediSource Ltd',NULL,NULL),
  ('BO-102','Samuel Eze','(555) 481-2209','oxim',1,(extract(epoch from now()-interval '62 hours')*1000)::bigint,'arrived',2,'DevicePoint',(extract(epoch from now()-interval '2 hours')*1000)::bigint,NULL) on conflict (id) do nothing;

insert into public.rx_transfers (id, transfer_no, direction, prescription_id, patient, drug, qty, other_pharmacy, other_phone, prescriber, refills_remaining, pharmacist, at, note) values
  ('RXT-1','TRF-0012','out','RX-2480','Daniel Osei','Atorvastatin 20mg',2,'Oakside Pharmacy','(555) 977-2044','Dr. R. Vance',2,'L. Mensah',(extract(epoch from now()-interval '2 days')*1000)::bigint,'Patient relocating — records sent'),
  ('RXT-2','TRF-0013','in','RX-2477','Grace Lin','Insulin Glargine',2,'Northgate Pharmacy','(555) 402-5501','Dr. S. Adeyemi',3,'L. Mensah',(extract(epoch from now()-interval '1 day')*1000)::bigint,'Inbound transfer — insulin regimen') on conflict (id) do nothing;

/* ------------------------------------------------------------------ */
/* Suppliers + finance                                                  */
/* ------------------------------------------------------------------ */
insert into public.suppliers (id, name, contact, phone, email, terms, lead_days, min_order, price_book) values
  ('SUP-01','MediSource Ltd','K. Adebayo','(555) 120-8812','orders@medisource.example',30,3,10,'[{"productId":"amx500","unitCost":4.6},{"productId":"met500","unitCost":2.1}]'),
  ('SUP-02','PharmaLine Co','S. Brown','(555) 224-9977','sales@pharmaline.example',30,5,12,'[{"productId":"ibu400","unitCost":1.3}]'),
  ('SUP-03','Apex Distributors','T. Okoro','(555) 334-1145','dist@apex.example',14,2,8,'[{"productId":"cet10","unitCost":1.8}]'),
  ('SUP-04','Vital Trade','M. Hassan','(555) 448-2210','trade@vital.example',30,4,6,'[{"productId":"vd3","unitCost":6.5}]'),
  ('SUP-05','DevicePoint','R. Kim','(555) 559-8830','devices@devicepoint.example',30,7,2,'[{"productId":"oxim","unitCost":10.9}]'),
  ('SUP-06','ColdChain Direct','G. Patel','(555) 661-3390','cold@ccd.example',14,3,5,'[{"productId":"insg","unitCost":31.5}]') on conflict (id) do nothing;

insert into public.purchase_orders (id, supplier_id, lines, status, created_at, expected_at, received_at, received_by, invoice_id, note) values
  ('PO-101','SUP-01','[{"productId":"amx500","qty":50,"unitCost":4.9,"received":0},{"productId":"met500","qty":60,"unitCost":2.2,"received":0}]','ordered',(extract(epoch from now()-interval '1 day')*1000)::bigint,(extract(epoch from now()+interval '2 days')*1000)::bigint,NULL,NULL,NULL,'Replenishment from reorder report'),
  ('PO-102','SUP-05','[{"productId":"oxim","qty":10,"unitCost":11.4,"received":10}]','received',(extract(epoch from now()-interval '4 days')*1000)::bigint,(extract(epoch from now()-interval '2 days')*1000)::bigint,(extract(epoch from now()-interval '2 days')*1000)::bigint,'B. Whitfield',NULL,'Device restock received in full') on conflict (id) do nothing;

insert into public.ap_invoices (id, number, supplier_id, po_id, date, due_days, total, payments, credits) values
  ('INV-301','INV-8851','SUP-05','PO-102',(extract(epoch from now()-interval '2 days')*1000)::bigint,30,114.00,
   ('[{"at":'::text || (extract(epoch from now()-interval '1 day')*1000)::bigint::text || ',"amount":114,"method":"bank","ref":"TRF-2201"}]'::text)::jsonb,
   '[]'::jsonb),
  ('INV-302','INV-8840','SUP-01',NULL,(extract(epoch from now()-interval '10 days')*1000)::bigint,30,4820.00,'[]'::jsonb,'[]'::jsonb) on conflict (id) do nothing;

update public.purchase_orders set invoice_id = 'INV-301' where id = 'PO-102';

insert into public.expenses (id, category, amount, date, payee, note, recurring) values
  ('EX-501','Rent',1200.00,(extract(epoch from now()-interval '20 days')*1000)::bigint,'Maple Property Mgmt','August rent',true),
  ('EX-502','Utilities',185.40,(extract(epoch from now()-interval '6 days')*1000)::bigint,'City Power & Water','Monthly utilities',true),
  ('EX-503','Salaries',2400.00,(extract(epoch from now()-interval '3 days')*1000)::bigint,'Payroll','Bi-weekly staff payroll',true),
  ('EX-504','Marketing',95.00,(extract(epoch from now()-interval '1 day')*1000)::bigint,'Local Gazette','Hometown flyer insert',false) on conflict (id) do nothing;

/* ------------------------------------------------------------------ */
/* Deliveries & web orders                                              */
/* ------------------------------------------------------------------ */
insert into public.deliveries (id, customer_id, address, lines, fee, mode, status, driver, scheduled_at, proof, created_at) values
  ('DL-301','C-006','18 Harbor Lane, Springfield','[{"productId":"insg","qty":2}]',6.00,'delivery','queued',NULL,(extract(epoch from now()+interval '3 hours')*1000)::bigint,NULL,(extract(epoch from now()-interval '1 hour')*1000)::bigint),
  ('DL-302','C-002','240 Cedar Court, Springfield','[{"productId":"met500","qty":4},{"productId":"vd3","qty":1}]',4.00,'curbside','assigned','K. Boateng',(extract(epoch from now()+interval '5 hours')*1000)::bigint,NULL,(extract(epoch from now()-interval '3 hours')*1000)::bigint) on conflict (id) do nothing;

insert into public.web_orders (id, customer_name, phone, items, type, channel, pickup, status, note, decline_reason, created_at) values
  ('WEB-118','Priya Nair','(555) 909-1147','[{"productId":"met500","name":"Metformin 500mg","qty":4}]','refill','app','curbside','new','Refill #RX-2479 — same dose',NULL,(extract(epoch from now()-interval '2 hours')*1000)::bigint),
  ('WEB-117','Omar Haddad','(555) 210-7743','[{"productId":"cet10","name":"Cetirizine 10mg","qty":2},{"productId":"vitc","name":"Vitamin C 1000mg","qty":1}]','otc','web','delivery','new','Deliver after 5pm please',NULL,(extract(epoch from now()-interval '5 hours')*1000)::bigint),
  ('WEB-116','Grace Lin','(555) 655-7702','[{"productId":"insg","name":"Insulin glargine (photo attached)","qty":2}]','rx_upload','app','in_store','new','Uploaded photo of new Rx from Dr. Adeyemi',NULL,(extract(epoch from now()-interval '9 hours')*1000)::bigint),
  ('WEB-115','Daniel Osei','(555) 402-5519','[{"productId":"atv20","name":"Atorvastatin 20mg","qty":2}]','refill','web','in_store','converted',NULL,NULL,(extract(epoch from now()-interval '30 hours')*1000)::bigint) on conflict (id) do nothing;

/* ------------------------------------------------------------------ */
/* Time clock + snapshots                                               */
/* ------------------------------------------------------------------ */
insert into public.time_entries (id, staff_id, in_at, out_at) values
  (501,'S-001',(extract(epoch from now()-interval '1 day' - interval '15 hours')*1000)::bigint,(extract(epoch from now()-interval '1 day' - interval '7 hours')*1000)::bigint),
  (502,'S-002',(extract(epoch from now()-interval '1 day' - interval '16 hours')*1000)::bigint,(extract(epoch from now()-interval '1 day' - interval '8 hours')*1000)::bigint),
  (503,'S-001',(extract(epoch from now()-interval '2 days' - interval '15 hours')*1000)::bigint,(extract(epoch from now()-interval '2 days' - interval '7.5 hours')*1000)::bigint),
  (504,'S-004',(extract(epoch from now()-interval '2 days' - interval '12 hours')*1000)::bigint,(extract(epoch from now()-interval '2 days' - interval '6 hours')*1000)::bigint) on conflict (id) do nothing;

insert into public.snapshots (id, at, label, auto, data) values
  ('SNAP-001',(extract(epoch from now()-interval '1 day')*1000)::bigint,'End of day — 2026-08-19',true,'{}') on conflict (id) do nothing;
