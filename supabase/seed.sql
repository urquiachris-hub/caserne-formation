-- =====================================================================
-- Référentiels de départ — VALEURS INDICATIVES
-- Périodicités et heures de formation continue à vérifier / ajuster selon
-- le règlement de formation de votre SDIS (modifiables dans l'appli).
-- =====================================================================
insert into referentiels (code, libelle, domaine, periodicite_mois, heures_fc_annuelles, ordre) values
  -- Secours à personne
  ('PSE1',  'Premiers secours en équipe niveau 1',        'SAP', 12, 6,  10),
  ('PSE2',  'Premiers secours en équipe niveau 2',        'SAP', 12, 6,  20),
  ('SAP1',  'Équipier secours à personne',                'SAP', 12, null, 30),
  ('SAP2',  'Chef d''agrès VSAV',                          'SAP', 12, null, 40),
  -- Incendie
  ('INC1',  'Équipier incendie',                          'INC', 12, null, 50),
  ('INC2',  'Chef d''équipe incendie',                     'INC', 12, null, 60),
  ('CA1E',  'Chef d''agrès une équipe',                    'INC', 12, null, 70),
  ('CATE',  'Chef d''agrès tout engin',                    'INC', 12, null, 80),
  ('ARI',   'Port de l''appareil respiratoire isolant',    'INC', 12, null, 90),
  -- Spécialités
  ('SR1',   'Secours routier — équipier',                 'SPE', 12, null, 100),
  ('SR2',   'Secours routier — chef d''agrès',             'SPE', 12, null, 110),
  ('FDF1',  'Feux de forêts — équipier',                  'SPE', 12, null, 120),
  ('FDF2',  'Feux de forêts — chef d''agrès',              'SPE', 12, null, 130),
  ('SAV1',  'Sauvetage aquatique — sauveteur',            'SPE', 12, null, 140),
  ('COD1',  'Conducteur engins pompe / VSAV',             'SPE', null, null, 150),
  ('COD2',  'Conducteur tout-terrain (FDF)',              'SPE', null, null, 160);

-- Prérequis (exemples)
update referentiels set prerequis_id = (select id from referentiels where code='PSE1') where code='PSE2';
update referentiels set prerequis_id = (select id from referentiels where code='INC1') where code='INC2';
update referentiels set prerequis_id = (select id from referentiels where code='FDF1') where code='FDF2';
update referentiels set prerequis_id = (select id from referentiels where code='SR1')  where code='SR2';

-- =====================================================================
-- PREMIER ADMINISTRATEUR
-- 1) Créez votre compte dans Supabase > Authentication > Users > Add user
-- 2) Puis exécutez (en remplaçant l'email) :
-- insert into profils (user_id, role)
-- select id, 'admin' from auth.users where email = 'VOTRE_EMAIL_CASERNE@gmail.com';
-- =====================================================================
