# 🚒 Caserne — Suivi formation

Application de suivi des qualifications (secourisme, incendie, spécialités), du planning de formation et des FMPA.

- **Front** : React + Vite, hébergé sur GitHub Pages (déploiement automatique à chaque push sur `main`)
- **Back** : Supabase (base PostgreSQL + authentification + sécurité par ligne)

## Fonctionnalités

| Module | Contenu |
|---|---|
| Tableau de bord | Agents actifs, qualifications expirées / à recycler sous 60 j, prochaines sessions |
| Personnel | Liste, recherche, ajout, import/export CSV, fiche agent |
| Fiche agent | Qualifications (obtention, recyclage, échéance, état), heures de formation de l'année vs attendues, historique |
| Matrice compétences | Tableau agents × référentiels coloré par état, nb d'agents opérationnels par qualif, export |
| Planning & FMPA | Sessions par mois, inscriptions, présences, heures validées, feuille d'émargement, validation automatique des recyclages |
| Référentiels | Catalogue modifiable (validité en mois, heures de FC annuelles, prérequis) |
| Mon suivi | Chaque personne liée à une fiche voit ses qualifications et ses heures |

## Mise en route (une seule fois)

### 1. Créer le projet Supabase
1. Sur https://supabase.com, se connecter avec le Gmail de la caserne → **New project**.
2. Région : **Europe** (données personnelles → rester dans l'UE).

### 2. Créer la base
Dans Supabase → **SQL Editor** → New query, exécuter dans l'ordre :
1. `supabase/schema.sql`
2. `supabase/seed.sql`
3. `supabase/002_profils_acces.sql`

### 3. Connexion par lien email
1. Ajouter les emails autorisés (voir « Gestion des accès »), en commençant par l'administrateur.
2. **Authentication → Sign In / Providers** : laisser *Allow new users to sign up* **activé** (seuls les emails de la liste peuvent créer un compte, les autres sont refusés).
3. **Authentication → URL Configuration** : *Site URL* = adresse de l'appli GitHub Pages.
4. **Envoi des emails** (obligatoire au-delà des membres de l'organisation Supabase) : **Authentication → Emails → SMTP Settings** avec le Gmail de la caserne : hôte `smtp.gmail.com`, port `465`, utilisateur = adresse Gmail, mot de passe = *mot de passe d'application* Google (myaccount.google.com → Sécurité → Validation en deux étapes → Mots de passe des applications).

### 4. Activer le déploiement automatique (une seule fois)
Le fichier de déploiement n'a pas pu être créé automatiquement (droit « workflow » non accordé au connecteur). À faire à la main :
1. Ouvrir `setup/deploy.yml` dans ce dépôt → bouton **Copy raw file**.
2. **Add file → Create new file** → nom : `.github/workflows/deploy.yml` → coller → **Commit changes**.

### 5. Relier GitHub à Supabase
1. Supabase → **Project Settings → API Keys** : copier l'URL du projet et la *Publishable key*.
2. GitHub → dépôt → **Settings → Secrets and variables → Actions → New repository secret** :
   - `VITE_SUPABASE_URL` = URL du projet
   - `VITE_SUPABASE_ANON_KEY` = Publishable key
3. GitHub → **Settings → Pages** → Source : **GitHub Actions**.
4. Onglet **Actions** → *Déploiement GitHub Pages* → **Run workflow**.

L'application est alors en ligne sur `https://<compte>.github.io/<depot>/`.

> La clé publique est publique par nature ; la protection des données repose sur les règles RLS. Ne jamais mettre la clé *secret* / *service_role* dans le code ou dans GitHub.

## Gestion des accès

Connexion **sans mot de passe** : la personne saisit son email, reçoit un lien, clique → connectée. Seuls les emails de la table `acces_autorises` peuvent se connecter.

| Profil (`role`) | Voit | Modifie |
|---|---|---|
| `admin` | Tout | Tout (personnel, référentiels, formation) |
| `encadrement` | Tout (tableau de bord, personnel, matrice, planning) | Rien |
| `resp_formation` | Tout | Planning, inscriptions, présences, qualifications |
| `formateur` | Planning, son suivi, les stagiaires de ses sessions | L'appel (présences/heures) sur les sessions dont il est formateur responsable |
| `agent` | Son suivi, le planning | Rien |

```sql
-- ajouter
insert into acces_autorises (email, role) values ('prenom.nom@gmail.com', 'encadrement');
-- changer de profil
update acces_autorises set role = 'resp_formation' where email = 'prenom.nom@gmail.com';
-- retirer l'accès (effet immédiat)
delete from acces_autorises where email = 'prenom.nom@gmail.com';
```
Pour **formateur** et **agent** (et pour que chacun ait « Mon suivi »), l'email doit aussi être renseigné sur sa fiche Personnel.

## Import CSV du personnel
Fichier séparé par `;` avec en-tête (colonnes facultatives sauf nom/prénom) :
```
nom;prenom;grade;statut;matricule;email;telephone;date_entree
DUPONT;Jean;CPL;SPV;12345;jean.dupont@mail.fr;0600000000;2018-09-01
```
`statut` ∈ SPV, SPP, PATS, JSP — `date_entree` au format AAAA-MM-JJ.

## Développement local
```bash
cp .env.example .env   # renseigner URL + clé publique
npm install
npm run dev
```

## Règles de calcul
- **Échéance** = (dernier recyclage, sinon date d'obtention) + validité du référentiel.
- **État** : *Expiré* si échéance dépassée, *À recycler* si < 60 jours, *Suspendu* si coché manuellement.
- **Heures de formation** : somme des sessions où l'agent est *Présent* (heures validées si saisies, sinon durée de la session).
- Les périodicités et heures fournies dans `seed.sql` sont **indicatives** : à aligner sur le règlement de formation du SDIS.
